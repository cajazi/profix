import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  getAuthUser,
  logAudit,
  sendNotification,
  calculatePlatformFee,
} from "../_shared/utils.ts";

interface ContractPayload {
  job_id: string;
  worker_id: string;
  payment_mode: "milestone" | "full";
  total_price: number;
  terms?: string;
  start_date?: string;
  end_date?: string;
  milestones?: Array<{
    title: string;
    description?: string;
    amount: number;
    due_date?: string;
    order_index: number;
  }>;
}

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

    const { data: profile, error: profileErr } = await db
      .from("users")
      .select("role, kyc_level, is_banned")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) return errorResponse("User not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);
    if (profile.role !== "owner")
      return errorResponse("Only job owners can create contracts", 403);

    const body: ContractPayload = await req.json();
    const {
      job_id,
      worker_id,
      payment_mode,
      total_price,
      terms,
      start_date,
      end_date,
      milestones,
    } = body;

    if (!job_id || !worker_id || !payment_mode || !total_price) {
      return errorResponse(
        "Missing required fields: job_id, worker_id, payment_mode, total_price"
      );
    }

    if (total_price <= 0) return errorResponse("total_price must be positive");
    if (!["milestone", "full"].includes(payment_mode)) {
      return errorResponse("payment_mode must be milestone or full");
    }

    if (payment_mode === "milestone") {
      if (!milestones || milestones.length === 0) {
        return errorResponse(
          "Milestones required for milestone payment mode"
        );
      }
      const milestonesSum = milestones.reduce((s, m) => s + m.amount, 0);
      if (Math.abs(milestonesSum - total_price) > 0.01) {
        return errorResponse(
          `Milestone amounts (${milestonesSum}) must equal total_price (${total_price})`
        );
      }
    }

    const { data: job, error: jobErr } = await db
      .from("jobs")
      .select("id, owner_id, status, title")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) return errorResponse("Job not found", 404);
    if (job.owner_id !== userId)
      return errorResponse("You don't own this job", 403);
    if (!["open", "in_progress"].includes(job.status)) {
      return errorResponse(
        "Job must be open or in_progress to create a contract"
      );
    }

    const { data: worker, error: workerErr } = await db
      .from("users")
      .select("id, role, full_name, is_banned")
      .eq("id", worker_id)
      .single();

    if (workerErr || !worker) return errorResponse("Worker not found", 404);
    if (worker.role !== "worker")
      return errorResponse("Selected user is not a worker", 400);
    if (worker.is_banned)
      return errorResponse("Worker account is suspended", 400);

    const { data: existingContract } = await db
      .from("contracts")
      .select("id, status")
      .eq("job_id", job_id)
      .eq("worker_id", worker_id)
      .in("status", ["draft", "active"])
      .maybeSingle();

    if (existingContract) {
      return errorResponse(
        "An active contract already exists for this job and worker"
      );
    }

    const { data: chatRoom } = await db
      .from("chat_rooms")
      .select("id")
      .eq("job_id", job_id)
      .maybeSingle();

    const platform_fee = calculatePlatformFee(total_price);
    const net_amount = total_price - platform_fee;

    const { data: contract, error: contractErr } = await db
      .from("contracts")
      .insert({
        job_id,
        owner_id: userId,
        worker_id,
        payment_mode,
        total_price,
        platform_fee,
        net_amount,
        status: "draft",
        terms: terms || null,
        start_date: start_date || null,
        end_date: end_date || null,
      })
      .select()
      .single();

    if (contractErr || !contract) {
      throw new Error(`Contract creation failed: ${contractErr?.message}`);
    }

    if (payment_mode === "milestone" && milestones && milestones.length > 0) {
      const milestoneRows = milestones.map((m) => ({
        contract_id: contract.id,
        title: m.title,
        description: m.description || null,
        amount: m.amount,
        due_date: m.due_date || null,
        order_index: m.order_index,
        status: "pending",
      }));
      const { error: msErr } = await db
        .from("milestones")
        .insert(milestoneRows);
      if (msErr) throw new Error(`Milestone creation failed: ${msErr.message}`);
    }

    await db
      .from("contracts")
      .update({ status: "active" })
      .eq("id", contract.id);

    await db
      .from("jobs")
      .update({ status: "in_progress" })
      .eq("id", job_id);

    if (chatRoom) {
      await db
        .from("chat_rooms")
        .update({ contract_id: contract.id })
        .eq("id", chatRoom.id);

      await db.from("messages").insert({
        room_id: chatRoom.id,
        sender_id: userId,
        content: `✅ Contract created for "${job.title}". Total: ₦${total_price.toLocaleString()}. Mode: ${payment_mode}.`,
        message_type: "system",
        metadata: { contract_id: contract.id },
      });
    }

    await sendNotification(db, {
      user_id: worker_id,
      type: "contract_created",
      title: "New Contract Created",
      body: `A contract has been created for "${job.title}" worth ₦${total_price.toLocaleString()}`,
      data: { contract_id: contract.id, job_id },
      action_url: `/contracts/${contract.id}`,
    });

    await logAudit(db, {
      user_id: userId,
      action: "contract_created",
      table_name: "contracts",
      record_id: contract.id,
      new_data: { contract_id: contract.id, total_price, payment_mode },
      edge_fn_name: "create-contract-from-chat",
    });

    return successResponse(
      { contract_id: contract.id, status: "active", net_amount },
      201
    );
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "contract_creation_failed",
      edge_fn_name: "create-contract-from-chat",
      success: false,
      error_msg: (err as Error).message,
    });
    console.error("create-contract-from-chat error:", err);
    return errorResponse("Internal server error", 500);
  }
});