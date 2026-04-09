import { Outlet, Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuthStore, useNotificationStore } from "../../store/auth.store";
import {
  Bell, BriefcaseBusiness, LayoutDashboard,
  MessageCircle, LogOut, ShieldCheck, Loader2
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

export function Layout() {
  const { profile, signOut } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  const navLinks = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
    ...(profile?.role === "admin"
      ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }]
      : []),
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 h-16">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">P</span>
            </div>
            <span className="text-white font-bold text-lg tracking-tight hidden sm:block">
              ProFix
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition",
                  location.pathname.startsWith(to)
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:block">{label}</span>
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <Link
              to="/profile"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                {profile?.full_name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-white text-sm font-medium leading-none">
                  {profile?.full_name}
                </p>
                <p className="text-slate-400 text-xs capitalize">
                  {profile?.role}
                </p>
              </div>
            </Link>

            <button
              onClick={handleSignOut}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-16 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function RoleGuard({ allowedRoles }: { allowedRoles: string[] }) {
  const { profile } = useAuthStore();

  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-64">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-white font-semibold">Access Denied</p>
          <p className="text-slate-400 text-sm mt-1">
            You don't have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}