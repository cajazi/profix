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

function calculateCommission(amount: number): {
  gross_amount: number;
  commission_amount: number;
  commission_rate: number;
  net_amount: number;
} {
  let commission_rate: number;

  if (amount <= 100000) {
    commission_rate = 0.05;
  } else if (amount <= 500000) {
    commission_rate = 0.035;
  } else if (amount <= 1000000) {
    commission_rate = 0.025;
  } else {
    commission_rate = 0.01;
  }

  const commission_amount = Math.floor(amount * commission_rate);
  const net_amount = amount - commission_amount;

  return {
    gross_amount: amount,
    commission_amount,
    commission_rate,
    net_amount,
  };
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

    const body: {
      amount: number;
      contract_id: string;
      milestone_id?: string;
    } = await req.json();

    const { amount, contract_id, milestone_id } = body;

    if (!amount || !contract_id) {
      return errorResponse("amount and contract_id required");
    }

    if (amount <= 0) {
      return errorResponse("amount must be positive");
    }

    // Verify contract exists and user is a party
    const { data: contract } = await db
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (!contract) return errorResponse("Contract not found", 404);
    if (
      contract.owner_id !== userId &&
      contract.worker_id !== userId
    ) {
      return errorResponse("You are not a party to this contract", 403);
    }

    const commission = calculateCommission(amount);

    // Update transaction with commission details if milestone
    if (milestone_id) {
      await db
        .from("transactions")
        .update({
          gross_amount: commission.gross_amount,
          commission_amount: commission.commission_amount,
          commission_rate: commission.commission_rate,
        })
        .eq("milestone_id", milestone_id)
        .eq("status", "success");
    }

    // Credit worker wallet with net amount
    const { data: wallet } = await db
      .from("wallets")
      .select("*")
      .eq("user_id", contract.worker_id)
      .single();

    if (wallet) {
      const newBalance = wallet.pending_balance + commission.net_amount;

      await db
        .from("wallets")
        .update({
          pending_balance: newBalance,
          total_earned: wallet.total_earned + commission.net_amount,
        })
        .eq("user_id", contract.worker_id);

      // Log wallet transaction
      await db.from("wallet_transactions").insert({
        wallet_id: wallet.id,
        user_id: contract.worker_id,
        type: "escrow_credit",
        amount: commission.net_amount,
        balance_before: wallet.pending_balance,
        balance_after: newBalance,
        reference: `comm_${contract_id}_${Date.now()}`,
        description: `Payment received after ${commission.commission_rate * 100}% commission`,
        contract_id,
        milestone_id: milestone_id || null,
        metadata: { commission },
      });

      // Log commission debit
      await db.from("wallet_transactions").insert({
        wallet_id: wallet.id,
        user_id: contract.worker_id,
        type: "commission_debit",
        amount: commission.commission_amount,
        balance_before: newBalance,
        balance_after: newBalance,
        reference: `fee_${contract_id}_${Date.now()}`,
        description: `ProFix platform commission (${commission.commission_rate * 100}%)`,
        contract_id,
        milestone_id: milestone_id || null,
        metadata: { commission },
      });

      // Notify worker
      await sendNotification(db, {
        user_id: contract.worker_id,
        type: "payment_released",
        title: "Payment Added to Wallet 💰",
        body: `₦${commission.net_amount.toLocaleString()} added to your wallet after ${commission.commission_rate * 100}% platform fee.`,
        data: { contract_id, commission },
        action_url: `/contracts/${contract_id}`,
      });
    }

    await logAudit(db, {
      user_id: userId,
      action: "commission_calculated",
      record_id: contract_id,
      new_data: commission,
      edge_fn_name: "calculate-commission",
    });

    return successResponse({
      ...commission,
      breakdown: {
        gross: `₦${commission.gross_amount.toLocaleString()}`,
        commission: `₦${commission.commission_amount.toLocaleString()} (${commission.commission_rate * 100}%)`,
        net: `₦${commission.net_amount.toLocaleString()}`,
      },
    });
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "commission_calculation_failed",
      edge_fn_name: "calculate-commission",
      success: false,
      error_msg: (err as Error).message,
    });
    return errorResponse("Internal server error", 500);
  }
});