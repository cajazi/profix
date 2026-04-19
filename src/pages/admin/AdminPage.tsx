import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  ShieldCheck, Users, Briefcase, AlertTriangle,
  CheckCircle, XCircle, Loader2, Eye, Ban,
  TrendingUp, DollarSign, Flag
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

type Tab = "overview" | "kyc" | "disputes" | "users" | "fraud";

export function AdminPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  // Redirect non-admins
  if (profile?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-white font-semibold">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Manage users, KYC, disputes and platform activity
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 overflow-x-auto">
        {([
          { key: "overview", label: "Overview", icon: TrendingUp },
          { key: "kyc", label: "KYC", icon: ShieldCheck },
          { key: "disputes", label: "Disputes", icon: AlertTriangle },
          { key: "users", label: "Users", icon: Users },
          { key: "fraud", label: "Fraud Flags", icon: Flag },
        ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0",
              tab === key
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab />}
      {tab === "kyc" && <KYCTab queryClient={queryClient} />}
      {tab === "disputes" && <DisputesTab queryClient={queryClient} />}
      {tab === "users" && <UsersTab queryClient={queryClient} />}
      {tab === "fraud" && <FraudTab queryClient={queryClient} />}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────
function OverviewTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, jobs, kyc, disputes, transactions] = await Promise.all([
        supabase.from("users").select("id, role, created_at", { count: "exact" }),
        supabase.from("jobs").select("id, status", { count: "exact" }),
        supabase.from("kyc_verifications").select("id, status", { count: "exact" }),
        supabase.from("disputes").select("id, status", { count: "exact" }),
        supabase.from("transactions").select("amount, status, type"),
      ]);

      const totalRevenue = (transactions.data || [])
        .filter((t) => t.type === "release")
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const totalCommission = Math.floor(totalRevenue * 0.05);

      return {
        totalUsers: users.count || 0,
        totalJobs: jobs.count || 0,
        openJobs: (jobs.data || []).filter((j) => j.status === "open").length,
        pendingKYC: (kyc.data || []).filter((k) => k.status === "pending").length,
        openDisputes: (disputes.data || []).filter((d) => d.status === "open").length,
        totalRevenue,
        totalCommission,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {[
        { label: "Total Users", value: stats?.totalUsers || 0, icon: Users, color: "text-indigo-400", bg: "bg-indigo-400/10" },
        { label: "Total Jobs", value: stats?.totalJobs || 0, icon: Briefcase, color: "text-emerald-400", bg: "bg-emerald-400/10" },
        { label: "Open Jobs", value: stats?.openJobs || 0, icon: Briefcase, color: "text-blue-400", bg: "bg-blue-400/10" },
        { label: "Pending KYC", value: stats?.pendingKYC || 0, icon: ShieldCheck, color: "text-amber-400", bg: "bg-amber-400/10" },
        { label: "Open Disputes", value: stats?.openDisputes || 0, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/10" },
        { label: "Total Revenue", value: `₦${(stats?.totalRevenue || 0).toLocaleString()}`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-400/10" },
{ label: "Platform Commission", value: `₦${(stats?.totalCommission || 0).toLocaleString()}`, icon: DollarSign, color: "text-indigo-400", bg: "bg-indigo-400/10" },
      ].map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", bg)}>
            <Icon className={cn("w-5 h-5", color)} />
          </div>
          <p className={cn("text-2xl font-bold", color)}>{value}</p>
          <p className="text-slate-400 text-sm mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── KYC Tab ──────────────────────────────────────────────────
function KYCTab({ queryClient }: { queryClient: any }) {
  const [filter, setFilter] = useState("pending");

  const { data: kycs, isLoading } = useQuery({
    queryKey: ["admin-kyc", filter],
    queryFn: async () => {
      const { data } = await supabase
        .from("kyc_verifications")
        .select("*, user:users!kyc_verifications_user_id_fkey(id, email, full_name)")
        .eq("status", filter)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (kycId: string) => {
      const { data: kyc } = await supabase
        .from("kyc_verifications")
        .select("user_id")
        .eq("id", kycId)
        .single();

      await supabase
        .from("kyc_verifications")
        .update({ status: "verified", verified_at: new Date().toISOString() })
        .eq("id", kycId);

      await supabase
        .from("users")
        .update({ kyc_level: 1, kyc_status: "approved" })
        .eq("id", kyc!.user_id);
    },
    onSuccess: () => {
      toast.success("KYC approved!");
      queryClient.invalidateQueries({ queryKey: ["admin-kyc"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ kycId, reason }: { kycId: string; reason: string }) => {
      const { data: kyc } = await supabase
        .from("kyc_verifications")
        .select("user_id")
        .eq("id", kycId)
        .single();

      await supabase
        .from("kyc_verifications")
        .update({ status: "rejected", rejection_reason: reason })
        .eq("id", kycId);

      await supabase
        .from("users")
        .update({ kyc_status: "rejected" })
        .eq("id", kyc!.user_id);
    },
    onSuccess: () => {
      toast.success("KYC rejected");
      queryClient.invalidateQueries({ queryKey: ["admin-kyc"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div>
      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {["pending", "verified", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition capitalize",
              filter === s ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (kycs || []).length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No {filter} KYC submissions</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(kycs || []).map((kyc: any) => (
            <div key={kyc.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-white font-semibold">{kyc.full_name}</p>
                  <p className="text-slate-400 text-sm">{kyc.user?.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full uppercase">
                      {kyc.id_type}
                    </span>
                    <span className="text-slate-500 text-xs">{kyc.id_number}</span>
                  </div>
                </div>
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full font-medium flex-shrink-0",
                  kyc.status === "verified" ? "bg-emerald-500/10 text-emerald-400" :
                  kyc.status === "pending" ? "bg-amber-500/10 text-amber-400" :
                  "bg-red-500/10 text-red-400"
                )}>
                  {kyc.status}
                </span>
              </div>

              {/* Document previews */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {kyc.selfie_url && (
                  <a href={kyc.selfie_url} target="_blank" rel="noopener noreferrer">
                    <div className="aspect-video bg-slate-800 rounded-lg overflow-hidden hover:opacity-80 transition">
                      <img src={kyc.selfie_url} alt="selfie" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-slate-500 text-xs mt-1 text-center">Selfie</p>
                  </a>
                )}
                {kyc.id_front_url && (
                  <a href={kyc.id_front_url} target="_blank" rel="noopener noreferrer">
                    <div className="aspect-video bg-slate-800 rounded-lg overflow-hidden hover:opacity-80 transition">
                      <img src={kyc.id_front_url} alt="id front" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-slate-500 text-xs mt-1 text-center">ID Front</p>
                  </a>
                )}
                {kyc.id_back_url && (
                  <a href={kyc.id_back_url} target="_blank" rel="noopener noreferrer">
                    <div className="aspect-video bg-slate-800 rounded-lg overflow-hidden hover:opacity-80 transition">
                      <img src={kyc.id_back_url} alt="id back" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-slate-500 text-xs mt-1 text-center">ID Back</p>
                  </a>
                )}
              </div>

              <p className="text-slate-500 text-xs mb-4">
                DOB: {kyc.date_of_birth} · Submitted {formatDistanceToNow(new Date(kyc.created_at), { addSuffix: true })}
              </p>

              {kyc.status === "pending" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const reason = prompt("Rejection reason:");
                      if (reason) rejectMutation.mutate({ kycId: kyc.id, reason });
                    }}
                    disabled={rejectMutation.isPending}
                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 rounded-xl transition text-sm font-medium"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => approveMutation.mutate(kyc.id)}
                    disabled={approveMutation.isPending}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl transition text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {approveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Approve
                  </button>
                </div>
              )}

              {kyc.rejection_reason && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-3">
                  <p className="text-red-300 text-xs">Rejection reason: {kyc.rejection_reason}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Disputes Tab ─────────────────────────────────────────────
function DisputesTab({ queryClient }: { queryClient: any }) {
  const { data: disputes, isLoading } = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("disputes")
        .select(`
          *,
          raised_by_user:users!disputes_raised_by_fkey(full_name, email),
          contract:contracts!disputes_contract_id_fkey(id, total_price, status)
        `)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ disputeId, resolution }: { disputeId: string; resolution: string }) => {
      await supabase
        .from("disputes")
        .update({
          status: "resolved",
          resolution,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", disputeId);
    },
    onSuccess: () => {
      toast.success("Dispute resolved!");
      queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(disputes || []).length === 0 ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No disputes found</p>
        </div>
      ) : (
        (disputes || []).map((dispute: any) => (
          <div key={dispute.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-white font-semibold">{dispute.title || "Dispute"}</p>
                <p className="text-slate-400 text-sm">
                  Raised by: {dispute.raised_by_user?.full_name}
                </p>
              </div>
              <span className={cn(
                "text-xs px-2 py-1 rounded-full font-medium flex-shrink-0",
                dispute.status === "open" ? "bg-red-500/10 text-red-400" :
                dispute.status === "resolved" ? "bg-emerald-500/10 text-emerald-400" :
                "bg-amber-500/10 text-amber-400"
              )}>
                {dispute.status}
              </span>
            </div>

            {dispute.description && (
              <p className="text-slate-400 text-sm mb-3 leading-relaxed">
                {dispute.description}
              </p>
            )}

            <div className="flex items-center justify-between">
              <p className="text-slate-500 text-xs">
                {formatDistanceToNow(new Date(dispute.created_at), { addSuffix: true })}
              </p>
              {dispute.status === "open" && (
                <button
                  onClick={() => {
                    const resolution = prompt("Resolution notes:");
                    if (resolution) resolveMutation.mutate({ disputeId: dispute.id, resolution });
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-lg transition"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────
function UsersTab({ queryClient }: { queryClient: any }) {
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: async () => {
      let query = supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (search.trim()) query = query.ilike("email", `%${search.trim()}%`);
      const { data } = await query;
      return data || [];
    },
  });

  const banMutation = useMutation({
    mutationFn: async ({ userId, ban }: { userId: string; ban: boolean }) => {
      await supabase
        .from("users")
        .update({ is_banned: ban })
        .eq("id", userId);
    },
    onSuccess: (_, { ban }) => {
      toast.success(ban ? "User banned" : "User unbanned");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div>
      <div className="relative mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email…"
          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-800">
            {(users || []).map((user: any) => (
              <div key={user.id} className="flex items-center justify-between px-5 py-4 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {user.full_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{user.full_name}</p>
                    <p className="text-slate-400 text-xs truncate">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full capitalize",
                    user.role === "admin" ? "bg-indigo-500/10 text-indigo-400" :
                    user.role === "owner" ? "bg-blue-500/10 text-blue-400" :
                    "bg-slate-800 text-slate-400"
                  )}>
                    {user.role}
                  </span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    user.kyc_level >= 1 ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-500"
                  )}>
                    {user.kyc_level >= 1 ? "KYC ✓" : "No KYC"}
                  </span>
                  {user.is_banned && (
                    <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">
                      Banned
                    </span>
                  )}
                  <button
                    onClick={() => banMutation.mutate({ userId: user.id, ban: !user.is_banned })}
                    disabled={banMutation.isPending}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-lg transition font-medium",
                      user.is_banned
                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    )}
                  >
                    {user.is_banned ? "Unban" : "Ban"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fraud Tab ────────────────────────────────────────────────
function FraudTab({ queryClient }: { queryClient: any }) {
  const { data: flags, isLoading } = useQuery({
    queryKey: ["admin-fraud"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fraud_flags")
        .select("*, user:users!fraud_flags_user_id_fkey(full_name, email)")
        .eq("is_resolved", false)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (flagId: string) => {
      await supabase
        .from("fraud_flags")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", flagId);
    },
    onSuccess: () => {
      toast.success("Flag resolved");
      queryClient.invalidateQueries({ queryKey: ["admin-fraud"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(flags || []).length === 0 ? (
        <div className="text-center py-12">
          <Flag className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No unresolved fraud flags</p>
        </div>
      ) : (
        (flags || []).map((flag: any) => (
          <div key={flag.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-white font-semibold">{flag.user?.full_name}</p>
                <p className="text-slate-400 text-sm">{flag.user?.email}</p>
              </div>
              <span className={cn(
                "text-xs px-2 py-1 rounded-full font-medium flex-shrink-0",
                flag.severity === "critical" ? "bg-red-500/20 text-red-400" :
                flag.severity === "high" ? "bg-orange-500/10 text-orange-400" :
                flag.severity === "medium" ? "bg-amber-500/10 text-amber-400" :
                "bg-slate-800 text-slate-400"
              )}>
                {flag.severity}
              </span>
            </div>
            <p className="text-slate-300 text-sm mb-1 capitalize">
              {flag.flag_type.replace(/_/g, " ")}
            </p>
            <p className="text-slate-500 text-xs mb-4">{flag.description}</p>
            <div className="flex items-center justify-between">
              <p className="text-slate-600 text-xs">
                {formatDistanceToNow(new Date(flag.created_at), { addSuffix: true })}
              </p>
              <button
                onClick={() => resolveMutation.mutate(flag.id)}
                disabled={resolveMutation.isPending}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs px-4 py-2 rounded-lg transition"
              >
                Mark Resolved
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}