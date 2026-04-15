import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  ShieldCheck, ShieldAlert, Clock, Loader2,
  CheckCircle, XCircle, Upload
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const kycSchema = z.object({
  full_name: z.string().min(2, "Full name required"),
  date_of_birth: z.string().min(1, "Date of birth required"),
  id_type: z.enum(["nin", "bvn", "passport", "drivers_license"], {
    required_error: "ID type required",
  }),
  id_number: z.string().min(5, "ID number required"),
});

type KYCForm = z.infer<typeof kycSchema>;

export function KYCPage() {
  const { profile } = useAuthStore();

  const { data: kyc, isLoading } = useQuery({
    queryKey: ["kyc", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("kyc_verifications")
        .select("*")
        .eq("user_id", profile!.id)
        .maybeSingle();
      return data;
    },
  });

  const { register, handleSubmit, formState: { errors } } = useForm<KYCForm>({
    resolver: zodResolver(kycSchema),
    defaultValues: {
      full_name: profile?.full_name || "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: KYCForm) => {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-kyc`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: () => {
      toast.success("KYC submitted! We will review within 24 hours.");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const STATUS_CONFIG = {
    pending: {
      label: "Under Review",
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      border: "border-amber-500/30",
      icon: Clock,
      desc: "Your documents are being reviewed. This takes up to 24 hours.",
    },
    verified: {
      label: "Verified",
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
      border: "border-emerald-500/30",
      icon: CheckCircle,
      desc: "Your identity has been verified. You have full access to ProFix.",
    },
    rejected: {
      label: "Rejected",
      color: "text-red-400",
      bg: "bg-red-400/10",
      border: "border-red-500/30",
      icon: XCircle,
      desc: "Your KYC was rejected. Please resubmit with correct documents.",
    },
    expired: {
      label: "Expired",
      color: "text-slate-400",
      bg: "bg-slate-800",
      border: "border-slate-700",
      icon: Clock,
      desc: "Your KYC has expired. Please resubmit.",
    },
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const status = kyc?.status as keyof typeof STATUS_CONFIG | undefined;
  const config = status ? STATUS_CONFIG[status] : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-indigo-400" />
          KYC Verification
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Verify your identity to unlock all ProFix features including
          payments and withdrawals
        </p>
      </div>

      {/* What KYC unlocks */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <p className="text-white font-medium mb-3">KYC unlocks:</p>
        <div className="space-y-2">
          {[
            "✅ Post and accept jobs",
            "✅ Receive payments to your wallet",
            "✅ Withdraw earnings to your bank",
            "✅ Higher transaction limits",
          ].map((item) => (
            <p key={item} className="text-slate-300 text-sm">{item}</p>
          ))}
        </div>
      </div>

      {/* Current status */}
      {kyc && config && (
        <div className={cn(
          "flex items-start gap-3 rounded-xl p-4 border",
          config.bg, config.border
        )}>
          <config.icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.color)} />
          <div>
            <p className={cn("font-semibold text-sm", config.color)}>
              KYC Status: {config.label}
            </p>
            <p className="text-slate-400 text-sm mt-0.5">{config.desc}</p>
            {kyc.rejection_reason && (
              <p className="text-red-400 text-xs mt-1">
                Reason: {kyc.rejection_reason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Show form if not verified or pending */}
      {(!kyc || kyc.status === "rejected" || kyc.status === "expired") && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-5">
            Submit Verification Documents
          </h2>

          <form
            onSubmit={handleSubmit((d) => submitMutation.mutate(d))}
            className="space-y-5"
          >
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Full name (as on ID) *
              </label>
              <input
                {...register("full_name")}
                placeholder="John Adeyemi"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.full_name && (
                <p className="text-red-400 text-xs mt-1">
                  {errors.full_name.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Date of birth *
              </label>
              <input
                {...register("date_of_birth")}
                type="date"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.date_of_birth && (
                <p className="text-red-400 text-xs mt-1">
                  {errors.date_of_birth.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                ID type *
              </label>
              <select
                {...register("id_type")}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select ID type</option>
                <option value="nin">NIN (National ID Number)</option>
                <option value="bvn">BVN (Bank Verification Number)</option>
                <option value="passport">International Passport</option>
                <option value="drivers_license">Driver's License</option>
              </select>
              {errors.id_type && (
                <p className="text-red-400 text-xs mt-1">
                  {errors.id_type.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                ID number *
              </label>
              <input
                {...register("id_number")}
                placeholder="Enter your ID number"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.id_number && (
                <p className="text-red-400 text-xs mt-1">
                  {errors.id_number.message}
                </p>
              )}
            </div>

            <div className="bg-slate-800 border border-dashed border-slate-600 rounded-xl p-4 text-center">
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">
                Document upload coming soon
              </p>
              <p className="text-slate-500 text-xs mt-1">
                For now submit your ID details above
              </p>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-blue-400 text-xs">
                🔒 Your information is encrypted and stored securely.
                We only use it for identity verification purposes.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Submit for Verification
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Verified state */}
      {kyc?.status === "verified" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-3" />
          <h2 className="text-white text-xl font-bold mb-2">
            Identity Verified ✅
          </h2>
          <p className="text-slate-400 text-sm">
            Your identity has been verified. You have full access to
            all ProFix features.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <div className="bg-slate-800 rounded-xl p-3">
              <p className="text-slate-400 text-xs">ID Type</p>
              <p className="text-white text-sm font-medium capitalize">
                {kyc.id_type?.replace("_", " ")}
              </p>
            </div>
            <div className="bg-slate-800 rounded-xl p-3">
              <p className="text-slate-400 text-xs">KYC Level</p>
              <p className="text-white text-sm font-medium">
                Level {kyc.level}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending state */}
      {kyc?.status === "pending" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <Clock className="w-16 h-16 text-amber-400 mx-auto mb-3 animate-pulse" />
          <h2 className="text-white text-xl font-bold mb-2">
            Under Review
          </h2>
          <p className="text-slate-400 text-sm">
            Your KYC documents are being reviewed. This typically takes
            up to 24 hours. We will notify you once completed.
          </p>
        </div>
      )}
    </div>
  );
}