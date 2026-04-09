import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  getAuthUser,
  logAudit,
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

    const idempotencyKey = req.headers.get("x-idempotency-key");
    if (!idempotencyKey)
      return errorResponse("x-idempotency-key header required");

    const body: {
      contract_id: string;
      milestone_id?: string;
      type: "fund_milestone" | "fund_contract";
    } = await req.json();

    const { contract_id, milestone_id, type } = body;

    if (!contract_id || !type) {
      return errorResponse("Missing required fields: contract_id, type");
    }

    const { data: profile, error: profileErr } = await db
      .from("users")
      .select("role, kyc_level, email_verified, email, full_name, is_banned")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) return errorResponse("User not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);
    if (profile.role !== "owner")
      return errorResponse("Only job owners can initiate payments", 403);
    if (!profile.email_verified) {
      return errorResponse(
        "Email verification required before making payments",
        403
      );
    }

    const { data: contract, error: contractErr } = await db
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (contractErr || !contract)
      return errorResponse("Contract not found", 404);
    if (contract.owner_id !== userId)
      return errorResponse("You are not the owner of this contract", 403);
    if (contract.status !== "active")
      return errorResponse("Contract must be active to accept payments");

    const existingIdempotencyKey = `pi_${contract_id}_${idempotencyKey}`;

    const { data: existingTx } = await db
      .from("transactions")
      .select("id, paystack_reference, status")
      .eq("idempotency_key", existingIdempotencyKey)
      .maybeSingle();

    if (existingTx) {
      if (existingTx.status === "success") {
        return errorResponse("This payment has already been completed", 409);
      }
      if (existingTx.status === "pending") {
        return successResponse({
          message: "Payment already initiated",
          reference: existingTx.paystack_reference,
          transaction_id: existingTx.id,
          is_existing: true,
        });
      }
    }

    let amount: number;

    if (type === "fund_milestone") {
      if (!milestone_id)
        return errorResponse("milestone_id required for milestone funding");
      if (contract.payment_mode !== "milestone") {
        return errorResponse("Contract is not in milestone mode");
      }

      const { data: milestone, error: msErr } = await db
        .from("milestones")
        .select("*")
        .eq("id", milestone_id)
        .eq("contract_id", contract_id)
        .single();

      if (msErr || !milestone)
        return errorResponse("Milestone not found", 404);
      if (milestone.status !== "pending") {
        return errorResponse(
          `Milestone cannot be funded in status: ${milestone.status}`
        );
      }
      amount = milestone.amount;
    } else if (type === "fund_contract") {
      if (contract.payment_mode !== "full") {
        return errorResponse(
          "This endpoint funds full-payment contracts only"
        );
      }
      amount = contract.total_price;
    } else {
      return errorResponse("Invalid payment type");
    }

    const amountKobo = Math.round(amount * 100);
    const paystackRef = `pf_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const paystackPayload = {
      email: profile.email,
      amount: amountKobo,
      reference: paystackRef,
      currency: "NGN",
      metadata: {
        contract_id,
        milestone_id: milestone_id || null,
        user_id: userId,
        type,
        platform: "profix",
      },
      callback_url: `${Deno.env.get("APP_URL")}/payment/callback`,
    };

    const paystackRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paystackPayload),
      }
    );

    const paystackData = await paystackRes.json();
    if (!paystackData.status) {
      throw new Error(`Paystack error: ${paystackData.message}`);
    }

    const { data: transaction, error: txErr } = await db
      .from("transactions")
      .insert({
        user_id: userId,
        contract_id,
        milestone_id: milestone_id || null,
        paystack_reference: paystackRef,
        idempotency_key: existingIdempotencyKey,
        amount,
        fee: 0,
        type: "funding",
        status: "pending",
        metadata: {
          paystack_authorization_url: paystackData.data.authorization_url,
          type,
        },
      })
      .select("id")
      .single();

    if (txErr) throw new Error(`Transaction record failed: ${txErr.message}`);

    await logAudit(db, {
      user_id: userId,
      action: "payment_intent_created",
      table_name: "transactions",
      record_id: transaction.id,
      new_data: { reference: paystackRef, amount, type },
      edge_fn_name: "create-payment-intent",
    });

    return successResponse({
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: paystackRef,
      transaction_id: transaction.id,
      amount,
      is_existing: false,
    });
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "payment_intent_failed",
      edge_fn_name: "create-payment-intent",
      success: false,
      error_msg: (err as Error).message,
    });
    console.error("create-payment-intent error:", err);
    return errorResponse("Internal server error", 500);
  }
});