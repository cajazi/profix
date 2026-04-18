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

    const { milestone_id } = await req.json();
    if (!milestone_id) return errorResponse("milestone_id required");

    // Get milestone and contract
    const { data: milestone, error: msErr } = await db
      .from("milestones")
      .select("*, contract:contracts(*)")
      .eq("id", milestone_id)
      .single();

    if (msErr || !milestone) return errorResponse("Milestone not found", 404);

    // Only worker can submit
    if (milestone.contract.worker_id !== userId) {
      return errorResponse("Only the worker can submit milestones", 403);
    }

    // Must be funded
    if (milestone.status !== "funded") {
      return errorResponse("Milestone must be funded before submission", 400);
    }

    // Update milestone status
    const { error: updateErr } = await db
      .from("milestones")
      .update({ status: "submitted", updated_at: new Date().toISOString() })
      .eq("id", milestone_id);

    if (updateErr) throw new Error(updateErr.message);

    // Notify owner
    await sendNotification(db, {
      user_id: milestone.contract.owner_id,
      type: "contract_created",
      title: "Milestone Submitted ✅",
      body: `Worker has submitted "${milestone.title}" for your review.`,
      data: { contract_id: milestone.contract.id, milestone_id },
      action_url: `/contracts/${milestone.contract.id}`,
    });

    await logAudit(db, {
      user_id: userId,
      action: "milestone_submitted",
      record_id: milestone_id,
      new_data: { status: "submitted", contract_id: milestone.contract.id },
      edge_fn_name: "mark-milestone-complete",
    });

    return successResponse({
      milestone_id,
      status: "submitted",
      message: "Milestone submitted for review",
    });
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "milestone_submit_failed",
      edge_fn_name: "mark-milestone-complete",
      success: false,
      error_msg: (err as Error).message,
    });
    return errorResponse("Internal server error", 500);
  }
});