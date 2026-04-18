import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  getAuthUser,
  logAudit,
  sendNotification,
} from "../_shared/utils.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const db = createServiceClient();
  let userId: string | undefined;

  try {
    const user = await getAuthUser(req);
    if (!user) return errorResponse("Unauthorized", 401);
    userId = user.id;

    const { data: profile } = await db
      .from("users")
      .select("role, email_verified")
      .eq("id", userId)
      .single();

    if (!profile) return errorResponse("User not found", 404);
    if (profile.role !== "owner" && profile.role !== "admin")
      return errorResponse("Only the job owner can release payments", 403);
    if (!profile.email_verified)
      return errorResponse("Email verification required", 403);

    const body: { contract_id: string; milestone_id?: string } =
      await req.json();
    const { contract_id, milestone_id } = body;

    if (!contract_id) return errorResponse("contract_id required");

    const { data: contract } = await db
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (!contract) return errorResponse("Contract not found", 404);
    if (contract.owner_id !== userId)
      return errorResponse("You are not the owner of this contract", 403);
    if (contract.status !== "active")
      return errorResponse("Contract is not active");

    const { data: wallet } = await db
      .from("escrow_wallets")
      .select("*")
      .eq("contract_id", contract_id)
      .single();

    if (!wallet) return errorResponse("Escrow wallet not found", 404);

    let releaseAmount: number;
    let ledgerRef: string;
    let description: string;

    if (contract.payment_mode === "milestone" && milestone_id) {
      const { data: milestone } = await db
        .from("milestones")
        .select("*")
        .eq("id", milestone_id)
        .eq("contract_id", contract_id)
        .single();

      if (!milestone) return errorResponse("Milestone not found", 404);
      if (milestone.status !== "submitted") {
        return errorResponse(
          `Milestone must be submitted to release. Current: ${milestone.status}`
        );
      }

      releaseAmount = milestone.amount;
      ledgerRef = `release_ms_${milestone_id}_${Date.now()}`;
      description = `Milestone released: ${milestone.title}`;

      if (wallet.balance < releaseAmount) {
        return errorResponse("Insufficient escrow balance for release");
      }

      const { data: existing } = await db
        .from("escrow_ledger")
        .select("id")
        .eq("reference", ledgerRef)
        .maybeSingle();

      if (existing) return errorResponse("Release already processed", 409);

      const newBalance = wallet.balance - releaseAmount;

      await db
        .from("escrow_wallets")
        .update({
          balance: newBalance,
          released_total: wallet.released_total + releaseAmount,
        })
        .eq("id", wallet.id);

      await db.from("escrow_ledger").insert({
        wallet_id: wallet.id,
        contract_id,
        milestone_id,
        entry_type: "release",
        amount: releaseAmount,
        balance_before: wallet.balance,
        balance_after: newBalance,
        reference: ledgerRef,
        description,
      });

      await db
        .from("milestones")
        .update({
          status: "released",
          released_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
        })
        .eq("id", milestone_id);

      await db.from("transactions").insert({
        user_id: contract.worker_id,
        contract_id,
        milestone_id,
        idempotency_key: ledgerRef,
        amount: releaseAmount,
        type: "release",
        status: "success",
      });

      const { data: allMilestones } = await db
        .from("milestones")
        .select("status")
        .eq("contract_id", contract_id);

      const allReleased = allMilestones?.every(
        (m) => m.status === "released"
      );

      if (allReleased) {
        await db
          .from("contracts")
          .update({ status: "completed" })
          .eq("id", contract_id);
        await db
          .from("jobs")
          .update({ status: "completed" })
          .eq("id", contract.job_id);
      }

      await sendNotification(db, {
        user_id: contract.worker_id,
        type: "payment_released",
        title: "Payment Released 🎉",
        body: `₦${releaseAmount.toLocaleString()} has been released for milestone: ${milestone.title}`,
        data: { contract_id, milestone_id, amount: releaseAmount },
        action_url: `/contracts/${contract_id}`,
      });
    } else if (contract.payment_mode === "full" && !milestone_id) {
      releaseAmount = wallet.balance;
      if (releaseAmount <= 0) return errorResponse("No balance to release");

      ledgerRef = `release_full_${contract_id}_${Date.now()}`;
      description = "Full contract payment released";

      await db
        .from("escrow_wallets")
        .update({
          balance: 0,
          released_total: wallet.released_total + releaseAmount,
        })
        .eq("id", wallet.id);

      await db.from("escrow_ledger").insert({
        wallet_id: wallet.id,
        contract_id,
        entry_type: "release",
        amount: releaseAmount,
        balance_before: wallet.balance,
        balance_after: 0,
        reference: ledgerRef,
        description,
      });

      await db
        .from("contracts")
        .update({ status: "completed" })
        .eq("id", contract_id);

      await db
        .from("jobs")
        .update({ status: "completed" })
        .eq("id", contract.job_id);

      await db.from("transactions").insert({
        user_id: contract.worker_id,
        contract_id,
        idempotency_key: ledgerRef,
        amount: releaseAmount,
        type: "release",
        status: "success",
      });

      await sendNotification(db, {
        user_id: contract.worker_id,
        type: "payment_released",
        title: "Full Payment Released 🎉",
        body: `₦${releaseAmount.toLocaleString()} has been released for your contract.`,
        data: { contract_id, amount: releaseAmount },
        action_url: `/contracts/${contract_id}`,
      });
    } else {
      return errorResponse("Invalid release parameters");
    }

    await logAudit(db, {
      user_id: userId,
      action: "payment_released",
      table_name: "escrow_wallets",
      record_id: wallet.id,
      new_data: { contract_id, milestone_id, amount: releaseAmount },
      edge_fn_name: "release-payment",
    });

    return successResponse({
      message: "Payment released successfully",
      amount: releaseAmount,
      contract_id,
      milestone_id: milestone_id || null,
    });
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "release_payment_failed",
      edge_fn_name: "release-payment",
      success: false,
      error_msg: (err as Error).message,
    });
    console.error("release-payment error:", err);
    return errorResponse("Internal server error", 500);
  }
});