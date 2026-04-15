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

    const idempotencyKey = req.headers.get("x-idempotency-key");
    if (!idempotencyKey) {
      return errorResponse("x-idempotency-key header required");
    }

    const body: {
      amount: number;
      bank_code: string;
      account_number: string;
      account_name: string;
    } = await req.json();

    const { amount, bank_code, account_number, account_name } = body;

    if (!amount || amount <= 0) return errorResponse("Valid amount required");
    if (!bank_code) return errorResponse("bank_code required");
    if (!account_number) return errorResponse("account_number required");
    if (!account_name) return errorResponse("account_name required");

    // Minimum withdrawal
    if (amount < 1000) {
      return errorResponse("Minimum withdrawal amount is ₦1,000");
    }

    // Get user profile
    const { data: profile } = await db
      .from("users")
      .select("role, email_verified, kyc_level, is_banned")
      .eq("id", userId)
      .single();

    if (!profile) return errorResponse("User not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);
    if (!profile.email_verified) {
      return errorResponse("Email verification required before withdrawal", 403);
    }
    if (profile.kyc_level < 1) {
      return errorResponse("KYC verification required before withdrawal", 403);
    }

    // Check for fraud flags
    const { data: fraudFlags } = await db
      .from("fraud_flags")
      .select("id, severity")
      .eq("user_id", userId)
      .eq("is_resolved", false)
      .in("severity", ["high", "critical"]);

    if (fraudFlags && fraudFlags.length > 0) {
      return errorResponse(
        "Your account has been flagged. Contact support.",
        403
      );
    }

    // Idempotency check
    const { data: existingWithdrawal } = await db
      .from("withdrawal_requests")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingWithdrawal) {
      return successResponse({
        message: "Withdrawal already requested",
        withdrawal_id: existingWithdrawal.id,
        status: existingWithdrawal.status,
        is_existing: true,
      });
    }

    // Get wallet
    const { data: wallet } = await db
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!wallet) return errorResponse("Wallet not found", 404);
    if (wallet.is_frozen) {
      return errorResponse("Wallet is frozen. Contact support.", 403);
    }
    if (wallet.available_balance < amount) {
      return errorResponse(
        `Insufficient balance. Available: ₦${wallet.available_balance.toLocaleString()}`
      );
    }

    // Rapid withdrawal fraud check
    const { data: recentWithdrawals } = await db
      .from("withdrawal_requests")
      .select("id, amount, created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 3600000).toISOString())
      .eq("status", "completed");

    const recentTotal = (recentWithdrawals || []).reduce(
      (s, w) => s + w.amount,
      0
    );

    if (recentTotal + amount > 500000) {
      // Flag for review
      await db.from("fraud_flags").insert({
        user_id: userId,
        flag_type: "rapid_withdrawal",
        severity: "medium",
        description: `Rapid withdrawal detected: ₦${(recentTotal + amount).toLocaleString()} in 1 hour`,
        metadata: { amount, recent_total: recentTotal },
      });
    }

    // Deduct from wallet immediately
    const newBalance = wallet.available_balance - amount;
    const newLocked = wallet.locked_balance + amount;

    await db
      .from("wallets")
      .update({
        available_balance: newBalance,
        locked_balance: newLocked,
      })
      .eq("id", wallet.id);

    // Create withdrawal request
    const { data: withdrawal, error: withdrawalErr } = await db
      .from("withdrawal_requests")
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        amount,
        bank_code,
        account_number,
        account_name,
        status: "pending",
        idempotency_key: idempotencyKey,
      })
      .select()
      .single();

    if (withdrawalErr) throw new Error(withdrawalErr.message);

    // Log wallet transaction
    await db.from("wallet_transactions").insert({
      wallet_id: wallet.id,
      user_id: userId,
      type: "withdrawal",
      amount,
      balance_before: wallet.available_balance,
      balance_after: newBalance,
      reference: `withdrawal_${withdrawal.id}`,
      description: `Withdrawal to ${account_name} - ${bank_code} ${account_number}`,
      metadata: { withdrawal_id: withdrawal.id },
    });

    // Initiate Paystack transfer
    const paystackRes = await fetch(
      "https://api.paystack.co/transfer",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "balance",
          amount: Math.round(amount * 100),
          recipient: account_number,
          reason: `ProFix withdrawal - ${account_name}`,
          reference: `withdrawal_${withdrawal.id}`,
        }),
      }
    );

    const paystackData = await paystackRes.json();

    // Update withdrawal with Paystack reference
    await db
      .from("withdrawal_requests")
      .update({
        status: "processing",
        paystack_ref: paystackData?.data?.transfer_code || null,
      })
      .eq("id", withdrawal.id);

    // Notify user
    await sendNotification(db, {
      user_id: userId,
      type: "payment_released",
      title: "Withdrawal Processing 💸",
      body: `₦${amount.toLocaleString()} withdrawal is being processed to ${account_name}.`,
      data: { withdrawal_id: withdrawal.id, amount },
      action_url: `/wallet`,
    });

    await logAudit(db, {
      user_id: userId,
      action: "withdrawal_initiated",
      record_id: withdrawal.id,
      new_data: { amount, bank_code, account_number: account_number.slice(-4) },
      edge_fn_name: "process-withdrawal",
    });

    return successResponse({
      withdrawal_id: withdrawal.id,
      amount,
      status: "processing",
      message: "Withdrawal initiated successfully",
    });
  } catch (err) {
    await logAudit(db, {
      user_id: userId,
      action: "withdrawal_failed",
      edge_fn_name: "process-withdrawal",
      success: false,
      error_msg: (err as Error).message,
    });
    return errorResponse("Internal server error", 500);
  }
});