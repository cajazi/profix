import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import type { Milestone } from "../../types/database";
import {
  CheckCircle, Clock, AlertTriangle, DollarSign,
  FileText, Loader2, Shield, TrendingUp
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const MILESTONE_STATUS_CONFIG = {
  pending:     { label: "Pending",          color: "text-slate-400 bg-slate-800",        icon: Clock },
  funded:      { label: "Funded",           color: "text-blue-400 bg-blue-400/10",       icon: DollarSign },
  in_progress: { label: "In Progress",      color: "text-yellow-400 bg-yellow-400/10",   icon: TrendingUp },
  submitted:   { label: "Awaiting Review",  color: "text-orange-400 bg-orange-400/10",   icon: Clock },
  approved:    { label: "Approved",         color: "text-emerald-400 bg-emerald-400/10", icon: CheckCircle },
  released:    { label: "Paid Out",         color: "text-emerald-500 bg-emerald-500/10", icon: CheckCircle },
  disputed:    { label: "Disputed",         color: "text-red-400 bg-red-400/10",         icon: AlertTriangle },
  refunded:    { label: "Refunded",         color: "text-purple-400 bg-purple-400/10",   icon: DollarSign },
};

export function ContractPage() {
  const { id: rawId } = useParams<{ id: string }>();
const id = rawId?.replace(/['"]/g, "");
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: contract, isLoading } = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select(`
          *,
          job:jobs(*),
          owner:users!contracts_owner_id_fkey(id, full_name, avatar_url, email),
          worker:users!contracts_worker_id_fkey(id, full_name, avatar_url, email),
          milestones(*),
          escrow_wallet:escrow_wallets(*)
        `)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!profile,
    refetchInterval: 10000,
  });

  const isOwner = profile?.id === contract?.owner_id;
  const isWorker = profile?.id === contract?.worker_id;

  const submitMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-milestone-complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ milestone_id: milestoneId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Milestone submitted for review!");
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const releaseMutation = useMutation({
    mutationFn: async (milestoneId?: string) => {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/release-payment`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contract_id: id, milestone_id: milestoneId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Release failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`₦${data.amount?.toLocaleString()} released successfully!`);
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!contract) {
    return <div className="p-8 text-slate-400">Contract not found</div>;
  }

  const wallet = contract.escrow_wallet;
  const progressPct = wallet
    ? Math.round(((wallet.released_total || 0) / contract.total_price) * 100)
    : 0;

  const sortedMilestones = [...(contract.milestones || [])].sort(
    (a: Milestone, b: Milestone) => a.order_index - b.order_index
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  contract.status === "active"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : contract.status === "completed"
                    ? "bg-blue-500/10 text-blue-400"
                    : contract.status === "disputed"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-slate-700 text-slate-400"
                )}
              >
                {contract.status.toUpperCase()}
              </span>
              <span className="text-slate-500 text-xs">v{contract.version}</span>
            </div>
            <h1 className="text-white text-2xl font-bold">{contract.job?.title}</h1>
            <p className="text-slate-400 text-sm mt-1">
              {contract.payment_mode === "milestone"
                ? "🎯 Milestone payments"
                : "💎 Full payment"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-sm">Total value</p>
            <p className="text-white text-3xl font-bold">
              ₦{contract.total_price.toLocaleString()}
            </p>
            <p className="text-slate-500 text-xs">
              Platform fee: ₦{contract.platform_fee.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Parties */}
        <div className="flex gap-4 mb-4">
          {[
            { label: "Owner", user: contract.owner, isYou: isOwner },
            { label: "Worker", user: contract.worker, isYou: isWorker },
          ].map(({ label, user, isYou }) => (
            <div
              key={label}
              className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                {user?.full_name?.[0]}
              </div>
              <div>
                <p className="text-slate-400 text-xs">{label}</p>
                <p className="text-white text-sm font-medium">
                  {user?.full_name}{" "}
                  {isYou && (
                    <span className="text-indigo-400 text-xs">(You)</span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Payment progress</span>
            <span>{progressPct}% released</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Escrow Wallet */}
      {wallet && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Escrow Balance", value: wallet.balance, color: "text-blue-400", icon: "🔒" },
            { label: "Total Released", value: wallet.released_total, color: "text-emerald-400", icon: "✅" },
            { label: "Total Refunded", value: wallet.refunded_total, color: "text-purple-400", icon: "↩️" },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">{icon} {label}</p>
              <p className={cn("text-xl font-bold", color)}>
                ₦{(value || 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Milestones */}
      {sortedMilestones.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" /> Milestones
            </h2>
            {isOwner && contract.status === "active" && (
              <button
                onClick={() => navigate(`/contracts/${id}/pay`)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-1.5 rounded-lg transition"
              >
                Fund Milestone
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-800">
            {sortedMilestones.map((milestone: Milestone, idx: number) => {
              const config = MILESTONE_STATUS_CONFIG[milestone.status];
              const Icon = config.icon;
              return (
                <div
                  key={milestone.id}
                  className="px-6 py-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 text-sm font-bold">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{milestone.title}</p>
                      {milestone.description && (
                        <p className="text-slate-400 text-sm truncate">{milestone.description}</p>
                      )}
                      {milestone.due_date && (
                        <p className="text-slate-500 text-xs mt-0.5">
                          Due: {format(new Date(milestone.due_date), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="text-white font-semibold">
                      ₦{milestone.amount.toLocaleString()}
                    </p>
                    <span className={cn("flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full", config.color)}>
                      <Icon className="w-3 h-3" /> {config.label}
                    </span>
                    {isWorker && milestone.status === "funded" && (
                      <button
                        onClick={() => submitMilestoneMutation.mutate(milestone.id)}
                        disabled={submitMilestoneMutation.isPending}
                        className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1.5 rounded-lg transition"
                      >
                        Submit
                      </button>
                    )}
                    {isOwner && milestone.status === "submitted" && (
                      <button
                        onClick={() => releaseMutation.mutate(
  contract.payment_mode === "milestone" ? milestone.id : undefined
)}
                        disabled={releaseMutation.isPending}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                      >
                        {releaseMutation.isPending && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        Approve & Pay
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {(isOwner || isWorker) && contract.status === "active" && (
          <button
            onClick={() => navigate(`/contracts/${id}/dispute`)}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2.5 rounded-xl transition border border-red-500/20"
          >
            <AlertTriangle className="w-4 h-4" /> Raise Dispute
          </button>
        )}
        {isOwner && contract.status === "active" && (
          <button
            onClick={() => navigate(`/contracts/${id}/pay`)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl transition"
          >
            <Shield className="w-4 h-4" /> Fund Escrow
          </button>
        )}
      </div>

      {/* Terms */}
      {contract.terms && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-3">Contract Terms</h3>
          <p className="text-slate-400 text-sm whitespace-pre-wrap leading-relaxed">
            {contract.terms}
          </p>
        </div>
      )}
    </div>
  );
}