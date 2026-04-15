import {
  Outlet, Link, useLocation, useNavigate, Navigate
} from "react-router-dom";
import { useAuthStore, useNotificationStore } from "../../store/auth.store";
import {
  Bell, BriefcaseBusiness, LayoutDashboard,
  LogOut, ShieldCheck, Loader2, Wallet, Menu, X
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

export function Layout() {
  const { profile, signOut } = useAuthStore();
  const { unreadCount, notifications, markAllRead } = useNotificationStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const navLinks = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
    { to: "/wallet", label: "Wallet", icon: Wallet },
    ...(profile?.role === "admin"
      ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }]
      : []),
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const recentNotifs = notifications.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* ─── Top navbar ─────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 h-16">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          {/* Logo */}
          <Link
            to="/dashboard"
            className="flex items-center gap-2 flex-shrink-0"
          >
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">P</span>
            </div>
            <span className="text-white font-bold text-lg tracking-tight hidden sm:block">
              ProFix
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition",
                  location.pathname.startsWith(to) && to !== "/dashboard"
                    ? "bg-indigo-600 text-white"
                    : location.pathname === to && to === "/dashboard"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* KYC badge */}
            {(profile?.kyc_level || 0) < 1 && (
              <Link
                to="/kyc"
                className="hidden sm:flex items-center gap-1 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-full hover:bg-amber-500/20 transition"
              >
                <ShieldCheck className="w-3 h-3" />
                Verify KYC
              </Link>
            )}

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setMobileMenuOpen(false);
                }}
                className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                    <span className="text-white font-semibold text-sm">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-indigo-400 text-xs hover:text-indigo-300 transition"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800">
                    {recentNotifs.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <Bell className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">
                          All caught up!
                        </p>
                      </div>
                    ) : (
                      recentNotifs.map((n) => (
                        <div
                          key={n.id}
                          className={cn(
                            "px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition",
                            !n.is_read && "border-l-2 border-indigo-500"
                          )}
                          onClick={() => {
                            setNotifOpen(false);
                            if (n.action_url) navigate(n.action_url);
                          }}
                        >
                          <p
                            className={cn(
                              "text-sm font-medium",
                              n.is_read ? "text-slate-300" : "text-white"
                            )}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">
                              {n.body}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile */}
            <Link
              to="/profile"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition"
              onClick={() => setNotifOpen(false)}
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {profile?.full_name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-white text-sm font-medium leading-none truncate max-w-24">
                  {profile?.full_name}
                </p>
                <p className="text-slate-400 text-xs capitalize mt-0.5">
                  {profile?.role}
                </p>
              </div>
            </Link>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => {
                setMobileMenuOpen(!mobileMenuOpen);
                setNotifOpen(false);
              }}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 space-y-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
                  location.pathname.startsWith(to)
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
            <Link
              to="/kyc"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-amber-400 hover:bg-slate-800 transition"
            >
              <ShieldCheck className="w-4 h-4" />
              KYC Verification
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </nav>

      {/* ─── Page content ──────────────────────────────── */}
      <main className="pt-16 min-h-screen">
        <Outlet />
      </main>

      {/* ─── Footer links (Play Store compliance) ──────── */}
      <footer className="border-t border-slate-800 bg-slate-900/50 py-6 mt-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-500 rounded-md flex items-center justify-center">
              <span className="text-white font-black text-xs">P</span>
            </div>
            <span className="text-slate-400 text-sm">
              © 2025 ProFix. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <Link to="/privacy" className="hover:text-slate-300 transition">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-slate-300 transition">
              Terms of Service
            </Link>
            <Link
              to="/delete-account"
              className="hover:text-slate-300 transition"
            >
              Delete Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Protected Route ──────────────────────────────────────────
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-slate-400 text-sm">Loading ProFix...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// ─── Role Guard ───────────────────────────────────────────────
export function RoleGuard({ allowedRoles }: { allowedRoles: string[] }) {
  const { profile } = useAuthStore();

  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      <div className="flex items-center justify-center min-h-64 px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-white font-semibold text-lg">Access Denied</p>
          <p className="text-slate-400 text-sm mt-1">
            You don't have permission to view this page.
          </p>
          <Link
            to="/dashboard"
            className="inline-block mt-4 bg-slate-800 hover:bg-slate-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <Outlet />;
}