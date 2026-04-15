import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  DollarSign, ArrowUpRight, ArrowDownLeft,
  Wallet, Lock, TrendingUp, Loader2, AlertTriangle
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";
import { formatDistanceToNow } from "date-fns";

const withdrawSchema = z.object({
  amount: z.coerce.number().min(1000, "Minimum withdrawal is ₦1,000"),
  bank_code: z.string().min(1, "Bank code required"),
  account_number: z.string().length(10, "Account number must be 10 digits"),
  account_name: z.string().min(2, "Account name required"),
});

type WithdrawForm = z.infer<typeof withdrawSchema>;

const NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank" },
  { code: "050", name: "EcoBank" },
  { code: "011", name: "First Bank" },
  { code: "214", name: "First City Monument Bank" },
  { code: "070", name: "Fidelity Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "030", name: "Heritage Bank" },
  { code: "301", name: "Jaiz Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "526", name: "Moniepoint" },
  { code: "076", name: "Polaris Bank" },
  { code: "101", name: "Providus Bank" },
  { code: "221", name: "Stanbic IBTC" },
  { code: "068", name: "Standard Chartered" },
  { code: "232", name: "Sterling Bank" },
  { code: "100", name: "Suntrust Bank" },
  { code: "032", name: "Union Bank" },
  { code: "033", name: "United Bank for Africa" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
  { code: "999", name: "OPay" },
  { code: "998", name: "Palmpay" },
  { code: "50515", name: "Kuda Bank" },
];

export function WalletPage() {
  const { profile } = useAuthStore();
  const [showWithdraw, setShowWithdraw] = useState(false);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", profile!.id)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ["wallet-transactions", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const { data: withdrawals } = useQuery({
    queryKey: ["withdrawals", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } =
    useForm<WithdrawForm>({
      resolver: zodResolver(withdrawSchema),
    });

  const withdrawMutation = useMutation({
    mutationFn: async (data: WithdrawForm) => {
      const session = (await supabase.auth.getSession()).data.session;
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-withdrawal`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
            "x-idempotency-key": idempotencyKey,
          },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: () => {
      toast.success("Withdrawal initiated successfully!");
      setShowWithdraw(false);
      reset();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const TX_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    escrow_credit: { label: "Payment Received", color: "text-emerald-400", icon: ArrowDownLeft },
    commission_debit: { label: "Platform Fee", color: "text-red-400", icon: ArrowUpRight },
    withdrawal: { label: "Withdrawal", color: "text-amber-400", icon: ArrowUpRight },
    refund_credit: { label: "Refund", color: "text-blue-400", icon: ArrowDownLeft },
    platform_fee: { label: "Platform Fee", color: "text-red-400", icon: ArrowUpRight },
    reversal: { label: "Reversal", color: "text-violet-400", icon: ArrowDownLeft },
  };

  if (walletLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">My Wallet</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Manage your earnings and withdrawals
        </p>
      </div>

      {/* Wallet frozen warning */}
      {wallet?.is_frozen && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">
            Your wallet is frozen. Please contact support.
          </p>
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Available Balance",
            value: wallet?.available_balance || 0,
            color: "text-emerald-400",
            bg: "bg-emerald-400/10",
            icon: Wallet,
            desc: "Ready to withdraw",
          },
          {
            label: "Pending Balance",
            value: wallet?.pending_balance || 0,
            color: "text-amber-400",
            bg: "bg-amber-400/10",
            icon: TrendingUp,
            desc: "Awaiting release",
          },
          {
            label: "Locked Balance",
            value: wallet?.locked_balance || 0,
            color: "text-blue-400",
            bg: "bg-blue-400/10",
            icon: Lock,
            desc: "In escrow",
          },
        ].map(({ label, value, color, bg, icon: Icon, desc }) => (
          <div
            key={label}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5"
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", bg)}>
              <Icon className={cn("w-5 h-5", color)} />
            </div>
            <p className={cn("text-2xl font-bold", color)}>
              ₦{value.toLocaleString()}
            </p>
            <p className="text-white text-sm font-medium mt-0.5">{label}</p>
            <p className="text-slate-500 text-xs">{desc}</p>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-1">Total Earned</p>
          <p className="text-white text-xl font-bold">
            ₦{(wallet?.total_earned || 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-400 text-xs mb-1">Total Withdrawn</p>
          <p className="text-white text-xl font-bold">
            ₦{(wallet?.total_withdrawn || 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Withdraw button */}
      {!wallet?.is_frozen && (
        <button
          onClick={() => setShowWithdraw(!showWithdraw)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl transition font-semibold"
        >
          <ArrowUpRight className="w-5 h-5" />
          Withdraw Funds
        </button>
      )}

      {/* Withdraw form */}
      {showWithdraw && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Withdraw Funds</h2>

          {!profile?.email_verified && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 text-amber-400 text-sm">
              ⚠️ Email verification required before withdrawal
            </div>
          )}

          {(profile?.kyc_level || 0) < 1 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 text-amber-400 text-sm">
              ⚠️ KYC verification required before withdrawal.{" "}
              <a href="/kyc" className="underline">Complete KYC →</a>
            </div>
          )}

          <form
            onSubmit={handleSubmit((d) => withdrawMutation.mutate(d))}
            className="space-y-4"
          >
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Amount (₦)
              </label>
              <input
                {...register("amount")}
                type="number"
                placeholder="Minimum ₦1,000"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.amount && (
                <p className="text-red-400 text-xs mt-1">{errors.amount.message}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Bank
              </label>
              <select
                {...register("bank_code")}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select your bank</option>
                {NIGERIAN_BANKS.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.name}
                  </option>
                ))}
              </select>
              {errors.bank_code && (
                <p className="text-red-400 text-xs mt-1">{errors.bank_code.message}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Account Number
              </label>
              <input
                {...register("account_number")}
                placeholder="0123456789"
                maxLength={10}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.account_number && (
                <p className="text-red-400 text-xs mt-1">{errors.account_number.message}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Account Name
              </label>
              <input
                {...register("account_name")}
                placeholder="John Adeyemi"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.account_name && (
                <p className="text-red-400 text-xs mt-1">{errors.account_name.message}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowWithdraw(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl transition text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={withdrawMutation.isPending}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                {withdrawMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Withdraw"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction history */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-indigo-400" />
            Transaction History
          </h2>
        </div>
        {txLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        ) : (transactions || []).length === 0 ? (
          <div className="px-6 py-10 text-center">
            <DollarSign className="w-10 h-10 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {(transactions || []).map((tx: any) => {
              const config =
                TX_TYPE_CONFIG[tx.type] || {
                  label: tx.type,
                  color: "text-slate-400",
                  icon: DollarSign,
                };
              const Icon = config.icon;
              const isCredit = ["escrow_credit", "refund_credit", "reversal"].includes(tx.type);

              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center",
                      isCredit ? "bg-emerald-400/10" : "bg-red-400/10"
                    )}>
                      <Icon className={cn("w-4 h-4", config.color)} />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{config.label}</p>
                      <p className="text-slate-500 text-xs">
                        {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-semibold", isCredit ? "text-emerald-400" : "text-red-400")}>
                      {isCredit ? "+" : "-"}₦{tx.amount.toLocaleString()}
                    </p>
                    <p className="text-slate-500 text-xs">
                      Balance: ₦{tx.balance_after.toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}