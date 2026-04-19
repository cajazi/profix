import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore, useNotificationStore } from "../../store/auth.store";
import {
  BriefcaseBusiness, DollarSign, MessageCircle, FileText,
  TrendingUp, Plus, ArrowRight, Bell, CheckCircle,
  ShieldAlert, Loader2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../../lib/utils";

const CONTRACT_STATUS_COLORS: Record<string, string> = {
  draft: "text-slate-400 bg-slate-800",
  active: "text-emerald-400 bg-emerald-400/10",
  completed: "text-blue-400 bg-blue-400/10",
  cancelled: "text-red-400 bg-red-400/10",
  disputed: "text-amber-400 bg-amber-400/10",
};

export function DashboardPage() {
  const { profile } = useAuthStore();
  const { notifications, unreadCount } = useNotificationStore();
  const navigate = useNavigate();
  const isOwner = profile?.role === "owner" || profile?.role === "admin";
  const isWorker = profile?.role === "worker";

  const { data: ownerStats } = useQuery({
    queryKey: ["owner-stats", profile?.id],
    enabled: !!profile?.id && isOwner,
    queryFn: async () => {
      const [jobs, contracts, txns] = await Promise.all([
        supabase.from("jobs").select("id, status", { count: "exact" }).eq("owner_id", profile!.id),
        supabase.from("contracts").select("id, status, total_price").eq("owner_id", profile!.id),
        supabase.from("transactions").select("amount, type").eq("user_id", profile!.id).eq("status", "success"),
      ]);
      const totalEscrowed = (txns.data || []).filter((t) => t.type === "funding").reduce((s, t) => s + t.amount, 0);
      return {
        totalJobs: jobs.count || 0,
        activeJobs: (jobs.data || []).filter((j) => ["open", "in_progress"].includes(j.status)).length,
        activeContracts: (contracts.data || []).filter((c) => c.status === "active").length,
        totalEscrowed,
      };
    },
  });

  const { data: workerStats } = useQuery({
    queryKey: ["worker-stats", profile?.id],
    enabled: !!profile?.id && isWorker,
    queryFn: async () => {
      const [apps, contracts, txns] = await Promise.all([
        supabase.from("applications").select("id, status", { count: "exact" }).eq("worker_id", profile!.id),
        supabase.from("contracts").select("id, status").eq("worker_id", profile!.id),
        supabase.from("transactions").select("amount").eq("user_id", profile!.id).eq("type", "release").eq("status", "success"),
      ]);
      const totalEarned = (txns.data || []).reduce((s, t) => s + t.amount, 0);
      return {
        totalApplications: apps.count || 0,
        activeContracts: (contracts.data || []).filter((c) => c.status === "active").length,
        completedContracts: (contracts.data || []).filter((c) => c.status === "completed").length,
        totalEarned,
      };
    },
  });

  const { data: recentContracts, isLoading: contractsLoading } = useQuery({
    queryKey: ["recent-contracts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const field = isOwner ? "owner_id" : "worker_id";
      const { data } = await supabase
        .from("contracts")
        .select("*, job:jobs(title), owner:users!contracts_owner_id_fkey(full_name), worker:users!contracts_worker_id_fkey(full_name)")
        .eq(field, profile!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const { data: recentJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["dashboard-jobs", profile?.id, isOwner],
    enabled: !!profile?.id,
    queryFn: async () => {
      let q = supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(6);
      if (isOwner) q = q.eq("owner_id", profile!.id);
      else q = q.eq("status", "open");
      const { data } = await q;
      return data || [];
    },
  });

  const { data: chatRooms } = useQuery({
    queryKey: ["chat-rooms", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const field = isOwner ? "owner_id" : "worker_id";
      const { data } = await supabase
        .from("chat_rooms")
        .select("*, job:jobs(title), owner:users!chat_rooms_owner_id_fkey(full_name), worker:users!chat_rooms_worker_id_fkey(full_name)")
        .eq(field, profile!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const stats = isOwner
    ? [
        { label: "Total Jobs", value: ownerStats?.totalJobs ?? "—", icon: BriefcaseBusiness, color: "text-indigo-400", bg: "bg-indigo-400/10" },
        { label: "Active Jobs", value: ownerStats?.activeJobs ?? "—", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-400/10" },
        { label: "Active Contracts", value: ownerStats?.activeContracts ?? "—", icon: FileText, color: "text-violet-400", bg: "bg-violet-400/10" },
        { label: "Total Escrowed", value: `₦${(ownerStats?.totalEscrowed ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-amber-400", bg: "bg-amber-400/10" },
      ]
    : [
        { label: "Applications", value: workerStats?.totalApplications ?? "—", icon: BriefcaseBusiness, color: "text-indigo-400", bg: "bg-indigo-400/10" },
        { label: "Active Contracts", value: workerStats?.activeContracts ?? "—", icon: FileText, color: "text-emerald-400", bg: "bg-emerald-400/10" },
        { label: "Completed Jobs", value: workerStats?.completedContracts ?? "—", icon: CheckCircle, color: "text-blue-400", bg: "bg-blue-400/10" },
        { label: "Total Earned", value: `₦${(workerStats?.totalEarned ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-amber-400", bg: "bg-amber-400/10" },
      ];

  const recentNotifs = notifications.slice(0, 6);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold">
            Welcome, {profile?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {isOwner ? "Manage your projects and secure payments" : "Track your applications and earnings"}
          </p>
        </div>
        {!profile?.email_verified && (
          <Link
            to="/profile"
            className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-4 py-2.5 rounded-xl hover:bg-amber-500/20 transition"
          >
            <ShieldAlert className="w-4 h-4" />
            Verify email to enable payments
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", bg)}>
              <Icon className={cn("w-5 h-5", color)} />
            </div>
            <p className="text-white text-2xl font-bold">{value}</p>
            <p className="text-slate-400 text-sm">{label}</p>
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: contracts + jobs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contracts */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" /> Recent Contracts
              </h2>
            </div>
            {contractsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : (recentContracts || []).length === 0 ? (
              <div className="px-6 py-10 text-center">
                <FileText className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No contracts yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {(recentContracts || []).map((c: any) => (
                  <Link
                    key={c.id}
                    to={`/contracts/${c.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-slate-800/40 transition"
                  >
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{c.job?.title}</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        {isOwner ? `Worker: ${c.worker?.full_name}` : `Owner: ${c.owner?.full_name}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <span className="text-white text-sm font-semibold hidden sm:block">
                        ₦{c.total_price?.toLocaleString()}
                      </span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", CONTRACT_STATUS_COLORS[c.status])}>
                        {c.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Jobs */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <BriefcaseBusiness className="w-5 h-5 text-indigo-400" />
                {isOwner ? "Your Jobs" : "Open Opportunities"}
              </h2>
              <div className="flex items-center gap-2">
                {isOwner && (
                  <button
                    onClick={() => navigate("/jobs/post")}
                    className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition"
                  >
                    <Plus className="w-3 h-3" /> Post Job
                  </button>
                )}
                <Link to="/jobs" className="text-indigo-400 text-sm hover:text-indigo-300 flex items-center gap-1">
                  All <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            {jobsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : (recentJobs || []).length === 0 ? (
              <div className="px-6 py-10 text-center">
                <BriefcaseBusiness className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">
                  {isOwner ? "Post your first job" : "No open jobs right now"}
                </p>
                {isOwner && (
                  <button
                    onClick={() => navigate("/jobs/post")}
                    className="mt-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition"
                  >
                    Post a Job
                  </button>
                )}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
                {(recentJobs || []).slice(0, 4).map((job: any) => (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    className="block px-5 py-4 hover:bg-slate-800/40 transition border-b border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full">
                        {job.category}
                      </span>
                      <span className={cn("text-xs font-medium", job.status === "open" ? "text-emerald-400" : "text-slate-500")}>
                        {job.status}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium line-clamp-1">{job.title}</p>
                    {(job.budget_min || job.budget_max) && (
                      <p className="text-emerald-400 text-xs mt-1">
                        ₦{(job.budget_min || job.budget_max)?.toLocaleString()}
                        {job.budget_max ? ` – ₦${job.budget_max?.toLocaleString()}` : ""}
                      </p>
                    )}
                    <p className="text-slate-500 text-xs mt-1">
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: notifications + chats */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-400" /> Notifications
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </h2>
            </div>
            {recentNotifs.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Bell className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">All caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
                {recentNotifs.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "px-5 py-3 cursor-pointer hover:bg-slate-800/50 transition",
                      !n.is_read && "border-l-2 border-indigo-500"
                    )}
                    onClick={() => n.action_url && navigate(n.action_url)}
                  >
                    <p className={cn("text-sm font-medium", n.is_read ? "text-slate-300" : "text-white")}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-slate-600 text-xs mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-indigo-400" /> Recent Chats
              </h2>
            </div>
            {(chatRooms || []).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <MessageCircle className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No chats yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {(chatRooms || []).map((room: any) => {
                  const other = isOwner ? room.worker : room.owner;
                  return (
                    <Link
                      key={room.id}
                      to={`/chat/${room.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/50 transition"
                    >
                      <div className="w-9 h-9 flex-shrink-0 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-sm">
                        {other?.full_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{other?.full_name}</p>
                        <p className="text-slate-400 text-xs truncate">{room.job?.title}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}