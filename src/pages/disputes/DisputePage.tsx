import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import { AlertTriangle, Loader2, Shield } from "lucide-react";
import toast from "react-hot-toast";

const schema = z.object({
  milestone_id: z.string().optional(),
  reason: z.string().min(20, "Please describe the dispute in at least 20 characters"),
});
type DisputeForm = z.infer<typeof schema>;

export function DisputePage() {
  const { id: contractId } = useParams<{ id: string }>();
  const { profile } = useAuthStore();
  const navigate = useNavigate();

  const { data: contract } = useQuery({
    queryKey: ["contract-dispute", contractId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("*, milestones(*), job:jobs(title)")
        .eq("id", contractId!)
        .single();
      return data;
    },
    enabled: !!contractId,
  });

  const { register, handleSubmit, formState: { errors } } = useForm<DisputeForm>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: async (data: DisputeForm) => {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-dispute`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contract_id: contractId,
            milestone_id: data.milestone_id || undefined,
            reason: data.reason,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: () => {
      toast.success("Dispute raised. Funds are frozen pending review.");
      navigate(`/contracts/${contractId}`);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (!contract) return null;

  const isParty =
    profile &&
    (contract.owner_id === profile.id || contract.worker_id === profile.id);

  if (!isParty) {
    return <div className="p-8 text-red-400">Access denied</div>;
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="bg-slate-900 border border-red-500/30 rounded-2xl overflow-hidden">
        <div className="bg-red-500/10 px-6 py-5 border-b border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-white font-bold">Raise a Dispute</h1>
              <p className="text-slate-400 text-sm">{contract.job?.title}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-amber-300 flex items-center gap-2">
              <Shield className="w-4 h-4" /> What happens when you dispute:
            </p>
            <ul className="text-amber-400/80 text-xs ml-6 list-disc space-y-0.5">
              <li>All funds in escrow are immediately frozen</li>
              <li>No further payments can be made or released</li>
              <li>An admin will review and resolve within 48–72 hours</li>
            </ul>
          </div>

          <form
            onSubmit={handleSubmit((d) => mutation.mutate(d))}
            className="space-y-4"
          >
            {contract.milestones?.length > 0 && (
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Which milestone is this about? (optional)
                </label>
                <select
                  {...register("milestone_id")}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Entire contract</option>
                  {contract.milestones.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.title} — ₦{m.amount?.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Describe the issue *
              </label>
              <textarea
                {...register("reason")}
                rows={5}
                placeholder="Explain clearly what went wrong, what was agreed, and what actually happened…"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              {errors.reason && (
                <p className="text-red-400 text-xs mt-1">{errors.reason.message}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl transition text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                {mutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Raise Dispute"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}