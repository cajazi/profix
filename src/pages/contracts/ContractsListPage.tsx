import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  FileText, Loader2, CheckCircle, Clock,
  AlertTriangle, DollarSign
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../../lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-700 text-slate-300" },
  active: { label: "Active", color: "bg-emerald-500/10 text-emerald-400" },
  completed: { label: "Completed", color: "bg-blue-500/10 text-blue-400" },
  disputed: { label: "Disputed", color: "bg-red-500/10 text-red-400" },
  cancelled: { label: "Cancelled", color: "bg-slate-800 text-slate-500" },
};

export function ContractsListPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();

  const { data: contracts, isLoading } = useQuery({
    queryKey: ["contracts-list", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select(`
          *,
          job:jobs(title, category),
          owner:users!contracts_owner_id_fkey(full_name),
          worker:users!contracts_worker_id_fkey(full_name)
        `)
        .or(`owner_id.eq.${profile!.id},worker_id.eq.${profile!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">My Contracts</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {contracts?.length || 0} contract{contracts?.length !== 1 ? "s" : ""}
        </p>
      </div>

      {(contracts || []).length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No contracts yet</p>
          <p className="text-slate-500 text-sm mt-1">
            Contracts will appear here once created from a chat
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(contracts || []).map((contract: any) => {
            const isOwner = profile?.id === contract.owner_id;
            const config = STATUS_CONFIG[contract.status] || STATUS_CONFIG.draft;

            return (
              <div
                key={contract.id}
                onClick={() => navigate(`/contracts/${contract.id}`)}
                className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", config.color)}>
                        {config.label}
                      </span>
                      <span className="text-slate-500 text-xs">
                        {contract.payment_mode === "milestone" ? "🎯 Milestones" : "💎 Full payment"}
                      </span>
                    </div>
                    <h3 className="text-white font-semibold group-hover:text-indigo-300 transition truncate">
                      {contract.title || contract.job?.title || "Contract"}
                    </h3>
                    <p className="text-slate-400 text-sm mt-0.5">
                      {contract.job?.category} · {isOwner ? `Worker: ${contract.worker?.full_name}` : `Owner: ${contract.owner?.full_name}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white font-bold text-lg">
                      ₦{contract.total_price?.toLocaleString()}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" /> v{contract.version}
                  </span>
                  {contract.deadline && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Due {formatDistanceToNow(new Date(contract.deadline), { addSuffix: true })}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Fee: ₦{contract.platform_fee?.toLocaleString() || 0}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}