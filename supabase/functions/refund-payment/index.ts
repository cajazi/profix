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
      .select("role")
      .eq("id", userId)
      .single();

    if (!profile) return errorResponse("User not found", 404);
    if (profile.role !== "admin") {
      return errorResponse("Only administrators can process refunds", 403);
    }

    const body: {
      contract_id: string;
      milestone_id?: string;
      reason: string;
      dispute_id?: string;
    } = await req.json();

    const { contract_id, milestone_id, reason, dispute_id } = body;

    if (!contract_id || !reason)
      return errorResponse("contract_id and reason required");

    const { data: contract } = await db
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (!contract) return errorResponse("Contract not found", 404);

    const { data: wallet } = await db
      .from("escrow_wallets")
      .select("*")
      .eq("contract_id", contract_id)
      .single();

    if (!wallet) return errorResponse("Escrow wallet not found", 404);

    let refundAmount: number;
    const ledgerRef = `refund_${milestone_id || contract_id}_${Date.now()}`;

    if (milestone_id) {
      const { data: milestone } = await db
        .from("milestones")
        .select("*")
        .eq("id", milestone_id)
        .eq("contract_id", contract_id)
        .single();

      if (!milestone) return errorResponse("Milestone not found", 404);
      if (
        !["funded", "in_progress", "submitted", "disputed"].includes(
          milestone.status
        )
      ) {
        return errorResponse(
          `Cannot refund milestone in status: ${milestone.status}`
        );
      }

      refundAmount = milestone.amount;

      if (wallet.balance < refundAmount)
        return errorResponse("Insufficient escrow balance");

      const newBalance = wallet.balance - refundAmount;

      await db
        .from("escrow_wallets")
        .update({
          balance: newBalance,
          refunded_total: wallet.refunded_total + refundAmount,
        })
        .eq("id", wallet.id);

      await db.from("escrow_ledger").insert({
        wallet_id: wallet.id,
        contract_id,
        milestone_id,
        entry_type: "refund",
        amount: refundAmount,
        balance_before: wallet.balance,
        balance_after: newBalance,
        reference: ledgerRef,
        description: `Refund: ${reason}`,
        metadata: { dispute_id, admin_id: userId },
      });

      await db
        .from("milestones")
        .update({ status: "refunded" })
        .eq("id", milestone_id);
    } else {
      refundAmount = wallet.balance;
      if (refundAmount <= 0) return errorResponse("No balance to refund");

      await db
        .from("escrow_wallets")
        .update({
          balance: 0,
          refunded_total: wallet.refunded_total + refundAmount,
        })
        .eq("id", wallet.id);

      await db.from("escrow_ledger").insert({
        wallet_id: wallet.id,
        contract_id,
        entry_type: "refund",
        amount: refundAmount,
        balance_before: wallet.balance,
        balance_after: 0,
        reference: ledgerRef,
        description: `Full refund: ${reason}`,
        metadata: { dispute_id, admin_id: userId },
      });

      await db
        .from("contracts")
        .update({ status: "cancelled" })
        .eq("id", contract_id);
    }

    if (dispute_id) {
      await db
        .from("disputes")
        .update({
          status: "resolved_refund",
          resolved_by: userId,
          resolved_at: new Date().toISOString(),
          resolution_note: reason,
        })
        .eq("id", dispute_id);
    }

    await db.from("transactions").insert({
      user_id: contract.owner_id,
      contract_id,
      milestone_id: milestone_id || null,
      idempotency_key: ledgerRef,
      amount: refundAmount,
      type: "refund",
      status: "success",
    });

    await sendNotification(db, {
      user_id: contract.owner_id,
      type: "payment_released",
      title: "Refund Processed",
      body: `₦${refundAmount.toLocaleString()} has been refunded. Reason: ${reason}`,
      data: { contract_id, milestone_id, amount: refundAmount },
      action_url: `/contracts/${contract_id}`,
    });

    await logAudit(db, {
      user_id: userId,
      action: "refund_processed",
      record_id: wallet.id,
      new_data: { contract_id, milestone_id, amount: refundAmount, reason },
      edge_fn_name: "refund-payment",
    });

    return successResponse({
      message: "Refund processed",
      amount: refundAmount,
    });
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "refund_failed",
      edge_fn_name: "refund-payment",
      success: false,
      error_msg: (err as Error).message,
    });
    console.error("refund-payment error:", err);
    return errorResponse("Internal server error", 500);
  }
});