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

    const body: {
      job_id: string;
      worker_id?: string;
      agreed_price: number;
      currency?: string;
      notes?: string;
      action: "propose" | "lock" | "cancel";
    } = await req.json();

    const {
      job_id,
      worker_id,
      agreed_price,
      currency = "NGN",
      notes,
      action,
    } = body;

    if (!job_id) return errorResponse("job_id required");
    if (!action) return errorResponse("action required");

    // Get user profile
    const { data: profile } = await db
      .from("users")
      .select("role, email_verified, is_banned")
      .eq("id", userId)
      .single();

    if (!profile) return errorResponse("User not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);

    // Get job
    const { data: job } = await db
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (!job) return errorResponse("Job not found", 404);

    // Determine owner and worker
    const isOwner = job.owner_id === userId;
    const isWorker = worker_id
      ? worker_id === userId
      : profile.role === "worker";

    if (!isOwner && !isWorker) {
      return errorResponse("You are not a party to this job", 403);
    }

    if (action === "propose") {
      // Validate required fields for proposal
      if (!agreed_price || agreed_price <= 0) {
        return errorResponse("Valid agreed_price required");
      }
      if (!worker_id && isOwner) {
        return errorResponse("worker_id required when owner proposes price");
      }

      const ownerIdToUse = isOwner ? userId : job.owner_id;
      const workerIdToUse = isOwner ? worker_id! : userId;

      // Check existing agreement
      const { data: existing } = await db
        .from("price_agreements")
        .select("id, agreement_status")
        .eq("job_id", job_id)
        .eq("owner_id", ownerIdToUse)
        .eq("worker_id", workerIdToUse)
        .maybeSingle();

      if (existing?.agreement_status === "locked") {
        return errorResponse("Price already locked for this job", 409);
      }

      // Upsert price agreement
      const { data: agreement, error: agreementErr } = await db
        .from("price_agreements")
        .upsert({
          job_id,
          owner_id: ownerIdToUse,
          worker_id: workerIdToUse,
          agreed_price,
          currency,
          agreement_status: "pending",
          agreement_timestamp: new Date().toISOString(),
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (agreementErr) throw new Error(agreementErr.message);

      // Notify the other party
      const notifyUserId = isOwner ? workerIdToUse : ownerIdToUse;
      await sendNotification(db, {
        user_id: notifyUserId,
        type: "contract_created",
        title: "Price Proposed 💬",
        body: `A price of ₦${agreed_price.toLocaleString()} has been proposed for your job.`,
        data: { agreement_id: agreement.id, job_id, agreed_price },
        action_url: `/jobs/${job_id}`,
      });

      await logAudit(db, {
        user_id: userId,
        action: "price_proposed",
        record_id: agreement.id,
        new_data: { agreed_price, job_id },
        edge_fn_name: "lock-price-agreement",
      });

      return successResponse({
        agreement_id: agreement.id,
        status: "pending",
        agreed_price,
        message: "Price proposal sent. Waiting for confirmation.",
      });
    }

    if (action === "lock") {
      // Only owner can lock the price
      if (!isOwner) {
        return errorResponse("Only the job owner can lock the price", 403);
      }

      const { data: agreement } = await db
        .from("price_agreements")
        .select("*")
        .eq("job_id", job_id)
        .eq("owner_id", userId)
        .eq("agreement_status", "pending")
        .single();

      if (!agreement) {
        return errorResponse("No pending price agreement found for this job", 404);
      }

      // Lock the price — immutable after this point
      const { data: locked, error: lockErr } = await db
        .from("price_agreements")
        .update({
          agreement_status: "locked",
          locked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", agreement.id)
        .select()
        .single();

      if (lockErr) throw new Error(lockErr.message);

      // Notify worker
      await sendNotification(db, {
        user_id: agreement.worker_id,
        type: "contract_created",
        title: "Price Locked 🔒",
        body: `The price of ₦${agreement.agreed_price.toLocaleString()} has been locked for your job.`,
        data: {
          agreement_id: agreement.id,
          job_id,
          agreed_price: agreement.agreed_price,
        },
        action_url: `/jobs/${job_id}`,
      });

      await logAudit(db, {
        user_id: userId,
        action: "price_locked",
        record_id: agreement.id,
        new_data: { agreed_price: agreement.agreed_price, job_id },
        edge_fn_name: "lock-price-agreement",
      });

      return successResponse({
        agreement_id: locked.id,
        status: "locked",
        agreed_price: locked.agreed_price,
        locked_at: locked.locked_at,
        message: "Price locked successfully. You can now create a contract.",
      });
    }

    if (action === "cancel") {
      const { data: agreement } = await db
        .from("price_agreements")
        .select("*")
        .eq("job_id", job_id)
        .neq("agreement_status", "locked")
        .or(`owner_id.eq.${userId},worker_id.eq.${userId}`)
        .single();

      if (!agreement) {
        return errorResponse("No cancellable price agreement found", 404);
      }

      await db
        .from("price_agreements")
        .update({
          agreement_status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", agreement.id);

      const notifyUserId =
        agreement.owner_id === userId
          ? agreement.worker_id
          : agreement.owner_id;

      await sendNotification(db, {
        user_id: notifyUserId,
        type: "dispute_created",
        title: "Price Agreement Cancelled",
        body: "The price agreement for your job has been cancelled.",
        data: { agreement_id: agreement.id, job_id },
        action_url: `/jobs/${job_id}`,
      });

      await logAudit(db, {
        user_id: userId,
        action: "price_cancelled",
        record_id: agreement.id,
        edge_fn_name: "lock-price-agreement",
      });

      return successResponse({
        message: "Price agreement cancelled",
        agreement_id: agreement.id,
      });
    }

    return errorResponse("Invalid action. Use: propose, lock, or cancel");
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "price_agreement_failed",
      edge_fn_name: "lock-price-agreement",
      success: false,
      error_msg: (err as Error).message,
    });
    return errorResponse("Internal server error", 500);
  }
});