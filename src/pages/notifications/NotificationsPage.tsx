import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import { useNotificationStore } from "../../store/auth.store";
import {
  Bell, CheckCheck, Trash2, Loader2,
  BriefcaseBusiness, MessageCircle, ShieldCheck,
  DollarSign, AlertTriangle, Info
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const NOTIF_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  job_posted: { icon: BriefcaseBusiness, color: "text-indigo-400", bg: "bg-indigo-400/10" },
  job_application: { icon: BriefcaseBusiness, color: "text-blue-400", bg: "bg-blue-400/10" },
  application_accepted: { icon: CheckCheck, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  application_rejected: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/10" },
  contract_created: { icon: ShieldCheck, color: "text-violet-400", bg: "bg-violet-400/10" },
  payment_released: { icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  payment_funded: { icon: DollarSign, color: "text-blue-400", bg: "bg-blue-400/10" },
  dispute_created: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/10" },
  dispute_resolved: { icon: CheckCheck, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  message_received: { icon: MessageCircle, color: "text-amber-400", bg: "bg-amber-400/10" },
  kyc_approved: { icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  kyc_rejected: { icon: ShieldCheck, color: "text-red-400", bg: "bg-red-400/10" },
  default: { icon: Info, color: "text-slate-400", bg: "bg-slate-800" },
};

export function NotificationsPage() {
  const { profile } = useAuthStore();
  const { markAllRead } = useNotificationStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["all-notifications", profile?.id, filter],
    enabled: !!profile?.id,
    queryFn: async () => {
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter === "unread") {
        query = query.eq("is_read", false);
      }

      const { data } = await query;
      return data || [];
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", profile!.id)
        .eq("is_read", false);
    },
    onSuccess: () => {
      markAllRead();
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      toast.success("All notifications marked as read");
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notifId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await supabase
        .from("notifications")
        .delete()
        .eq("user_id", profile!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      toast.success("All notifications cleared");
    },
  });

  const handleNotifClick = async (notif: any) => {
    if (!notif.is_read) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.action_url) {
      navigate(notif.action_url);
    }
  };

  const unreadCount = (notifications || []).filter((n) => !n.is_read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Notifications</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "All caught up!"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl transition"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
          {(notifications || []).length > 0 && (
            <button
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
              className="flex items-center gap-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-xl transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition capitalize",
              filter === f
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white"
            )}
          >
            {f}
            {f === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs w-4 h-4 rounded-full inline-flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (notifications || []).length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-slate-700" />
          </div>
          <p className="text-slate-400 font-medium">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {filter === "unread"
              ? "You are all caught up!"
              : "Activity from jobs, contracts and payments will appear here"}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-800">
            {(notifications || []).map((notif: any) => {
              const config = NOTIF_CONFIG[notif.type] || NOTIF_CONFIG.default;
              const Icon = config.icon;

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={cn(
                    "flex items-start gap-4 px-5 py-4 cursor-pointer transition hover:bg-slate-800/50",
                    !notif.is_read && "border-l-2 border-indigo-500"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                    config.bg
                  )}>
                    <Icon className={cn("w-5 h-5", config.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium leading-tight",
                      notif.is_read ? "text-slate-300" : "text-white"
                    )}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-slate-400 text-xs mt-0.5 leading-relaxed line-clamp-2">
                        {notif.body}
                      </p>
                    )}
                    <p className="text-slate-600 text-xs mt-1.5">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!notif.is_read && (
                    <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}