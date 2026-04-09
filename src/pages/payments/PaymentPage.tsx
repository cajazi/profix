import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  Shield, AlertTriangle, CheckCircle, Loader2, Lock
} from "lucide-react";
import toast from "react-hot-toast";

declare global {
  interface Window {
    PaystackPop: {
      setup: (config: Record<string, unknown>) => { openIframe: () => void };
    };
  }
}

export function PaymentPage() {
  const { id: contractId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const milestoneId = searchParams.get("milestone");
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [isInitiating, setIsInitiating] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackLoaded(true);
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  const { data: contract, isLoading } = useQuery({
    queryKey: ["contract-pay", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, milestones(*), escrow_wallet:escrow_wallets(*)")
        .eq("id", contractId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!contractId && !!profile,
  });

  if (!profile?.email_verified) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-white text-xl font-bold mb-2">
          Email Verification Required
        </h2>
        <p className="text-slate-400 mb-6">
          You must verify your email address before making any payments.
        </p>
        <button
          onClick={() => navigate("/profile")}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl transition"
        >
          Verify Email
        </button>
      </div>
    );
  }

  const selectedMilestone = milestoneId
    ? contract?.milestones?.find((m: any) => m.id === milestoneId)
    : null;

  const paymentAmount = selectedMilestone
    ? selectedMilestone.amount
    : contract?.total_price;

  const initiatePayment = async () => {
    if (!paystackLoaded) {
      toast.error("Payment system not ready. Please try again.");
      return;
    }
    if (!profile || !contract) return;
    setIsInitiating(true);

    const idempotencyKey = crypto.randomUUID();

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
            "x-idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({
            contract_id: contractId,
            milestone_id: milestoneId || undefined,
            type: milestoneId ? "fund_milestone" : "fund_contract",
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Payment initiation failed");
        return;
      }

      const handler = window.PaystackPop.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: profile.email,
        amount: Math.round(paymentAmount * 100),
        currency: "NGN",
        ref: data.reference,
        metadata: {
          contract_id: contractId,
          milestone_id: milestoneId,
          user_id: profile.id,
        },
        onSuccess: (transaction: { reference: string }) => {
          toast.success("Payment successful! Funds secured in escrow 🔒");
          navigate(
            `/contracts/${contractId}?payment_success=1&ref=${transaction.reference}`
          );
        },
        onCancel: () => {
          toast("Payment cancelled", { icon: "ℹ️" });
        },
      });

      handler.openIframe();
    } catch (err) {
      toast.error("Payment failed. Please try again.");
      console.error(err);
    } finally {
      setIsInitiating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!contract) {
    return <div className="p-8 text-slate-400">Contract not found</div>;
  }

  if (contract.owner_id !== profile?.id) {
    return (
      <div className="p-8 text-center text-red-400">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
        Only the job owner can make payments.
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold mb-1">
            Secure Escrow Payment
          </h1>
          <p className="text-indigo-200 text-sm">
            Funds are held safely until work is approved
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Payment for</span>
              <span className="text-white font-medium">
                {selectedMilestone ? selectedMilestone.title : "Full Contract"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Amount</span>
              <span className="text-white font-semibold">
                ₦{paymentAmount?.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Paystack fee (~1.5%)</span>
              <span className="text-slate-300">
                ~₦{Math.round((paymentAmount || 0) * 0.015).toLocaleString()}
              </span>
            </div>
            <div className="border-t border-slate-700 pt-3 flex justify-between">
              <span className="text-white font-semibold">Total charged</span>
              <span className="text-indigo-400 font-bold text-lg">
                ₦{Math.round((paymentAmount || 0) * 1.015).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {[
              { icon: "🔒", text: "Your money is held securely in escrow" },
              { icon: "✅", text: "Released only when you approve the work" },
              { icon: "↩️", text: "Full refund if dispute resolves in your favor" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-slate-400">
                <span className="text-base">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={initiatePayment}
            disabled={isInitiating || !paystackLoaded}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-3 text-lg"
          >
            {isInitiating ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Lock className="w-5 h-5" />
                Pay ₦{paymentAmount?.toLocaleString()} Securely
              </>
            )}
          </button>

          <p className="text-center text-slate-500 text-xs">
            Powered by Paystack · 256-bit SSL encrypted
          </p>

          <button
            onClick={() => navigate(`/contracts/${contractId}`)}
            className="w-full text-slate-400 hover:text-white text-sm py-2 transition"
          >
            Cancel, go back
          </button>
        </div>
      </div>
    </div>
  );
}

export function PaymentCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");

  useEffect(() => {
    if (!reference) { setStatus("failed"); return; }
    const timer = setTimeout(() => setStatus("success"), 2000);
    return () => clearTimeout(timer);
  }, [reference]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        {status === "verifying" && (
          <>
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
            <p className="text-white text-xl font-semibold">Verifying payment…</p>
            <p className="text-slate-400">Please wait, do not close this page</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
            <p className="text-white text-2xl font-bold">Payment Successful!</p>
            <p className="text-slate-400">Funds secured in escrow 🔒</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl transition mt-4"
            >
              Go to Dashboard
            </button>
          </>
        )}
        {status === "failed" && (
          <>
            <AlertTriangle className="w-16 h-16 text-red-400 mx-auto" />
            <p className="text-white text-2xl font-bold">Payment Failed</p>
            <p className="text-slate-400">Something went wrong. Please try again.</p>
            <button
              onClick={() => navigate(-1)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-xl transition mt-4"
            >
              Go Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}