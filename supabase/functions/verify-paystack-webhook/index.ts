import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  verifyPaystackWebhookSignature,
  logAudit,
  sendNotification,
} from "../_shared/utils.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const db = createServiceClient();

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";

    const isValid = await verifyPaystackWebhookSignature(rawBody, signature);
    if (!isValid) {
      await logAudit(db, {
        action: "webhook_signature_invalid",
        edge_fn_name: "verify-paystack-webhook",
        success: false,
        error_msg: "Invalid HMAC signature",
      });
      return errorResponse("Invalid signature", 401);
    }

    const event = JSON.parse(rawBody);
    const { event: eventType, data } = event;

    await logAudit(db, {
      action: `webhook_received_${eventType}`,
      edge_fn_name: "verify-paystack-webhook",
      new_data: { reference: data?.reference, event: eventType },
    });

    switch (eventType) {
      case "charge.success":
        await handleChargeSuccess(db, data);
        break;
      case "transfer.success":
        await logAudit(db, {
          action: "transfer_success",
          edge_fn_name: "verify-paystack-webhook",
          new_data: { reference: data?.reference },
        });
        break;
      case "transfer.failed":
        await logAudit(db, {
          action: "transfer_failed",
          edge_fn_name: "verify-paystack-webhook",
          success: false,
          new_data: { reference: data?.reference },
        });
        break;
      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return successResponse({ received: true });
  } catch (err) {
    await logAudit(db, {
      action: "webhook_processing_error",
      edge_fn_name: "verify-paystack-webhook",
      success: false,
      error_msg: (err as Error).message,
    });
    console.error("Webhook error:", err);
    return successResponse({ received: true, error: "Processing error logged" });
  }
});

async function handleChargeSuccess(
  db: ReturnType<typeof createServiceClient>,
  data: Record<string, unknown>
) {
  const reference = data.reference as string;
  const amountKobo = data.amount as number;
  const amount = amountKobo / 100;

  const { data: tx, error: txErr } = await db
    .from("transactions")
    .select("*")
    .eq("paystack_reference", reference)
    .single();

  if (txErr || !tx) {
    await logAudit(db, {
      action: "webhook_transaction_not_found",
      edge_fn_name: "verify-paystack-webhook",
      success: false,
      error_msg: `No transaction for ref: ${reference}`,
    });
    return;
  }

  if (tx.status === "success") {
    console.log(`Transaction ${reference} already processed. Skipping.`);
    return;
  }

  const paystackFee = Math.round(amountKobo * 0.015 + 100) / 100;

  await db
    .from("transactions")
    .update({
      status: "success",
      fee: paystackFee,
      gateway_response: data.gateway_response as string,
      channel: data.channel as string,
    })
    .eq("id", tx.id);

  const contractId = tx.contract_id;
  const milestoneId = tx.milestone_id;

  const { data: wallet, error: walletErr } = await db
    .from("escrow_wallets")
    .select("*")
    .eq("contract_id", contractId)
    .single();

  if (walletErr || !wallet) {
    await logAudit(db, {
      action: "webhook_wallet_not_found",
      edge_fn_name: "verify-paystack-webhook",
      success: false,
      error_msg: `No wallet for contract: ${contractId}`,
    });
    return;
  }

  const ledgerRef = `deposit_${reference}`;

  const { data: existingLedger } = await db
    .from("escrow_ledger")
    .select("id")
    .eq("reference", ledgerRef)
    .maybeSingle();

  if (existingLedger) {
    console.log(`Ledger entry ${ledgerRef} already exists. Skipping.`);
    return;
  }

  const newBalance = wallet.balance + amount;

  await db
    .from("escrow_wallets")
    .update({ balance: newBalance })
    .eq("id", wallet.id);

  await db.from("escrow_ledger").insert({
    wallet_id: wallet.id,
    contract_id: contractId,
    milestone_id: milestoneId || null,
    entry_type: "deposit",
    amount,
    balance_before: wallet.balance,
    balance_after: newBalance,
    reference: ledgerRef,
    paystack_ref: reference,
    description: milestoneId ? "Milestone funded" : "Full contract funded",
    metadata: data,
  });

  if (milestoneId) {
    await db
      .from("milestones")
      .update({ status: "funded", funded_at: new Date().toISOString() })
      .eq("id", milestoneId)
      .eq("status", "pending");

    const { data: contract } = await db
      .from("contracts")
      .select("worker_id, jobs(title)")
      .eq("id", contractId)
      .single();

    if (contract) {
      await sendNotification(db, {
        user_id: contract.worker_id,
        type: "milestone_funded",
        title: "Milestone Funded 💰",
        body: "A milestone has been funded. You can now start working on it.",
        data: { contract_id: contractId, milestone_id: milestoneId },
        action_url: `/contracts/${contractId}`,
      });
    }
  }

  await logAudit(db, {
    action: "charge_success_processed",
    edge_fn_name: "verify-paystack-webhook",
    record_id: tx.id,
    new_data: { amount, reference, milestone_id: milestoneId },
  });
}