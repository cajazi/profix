import { useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { supabase } from "./lib/supabase";
import { useAuthStore, useNotificationStore } from "./store/auth.store";
import { Loader2 } from "lucide-react";

import { LoginPage, RegisterPage, VerifyOTPPage } from "./pages/auth/AuthPages";
import { ProtectedRoute, RoleGuard, Layout } from "./components/layout/Layout";

const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const JobsPage = lazy(() => import("./pages/jobs/JobsPage").then((m) => ({ default: m.JobsPage })));
const PostJobPage = lazy(() => import("./pages/jobs/JobsPage").then((m) => ({ default: m.PostJobPage })));
const JobDetailPage = lazy(() => import("./pages/jobs/JobDetailPage").then((m) => ({ default: m.JobDetailPage })));
const ChatPage = lazy(() => import("./pages/chat/ChatPage").then((m) => ({ default: m.ChatPage })));
const ContractPage = lazy(() => import("./pages/contracts/ContractPage").then((m) => ({ default: m.ContractPage })));
const PaymentPage = lazy(() => import("./pages/payments/PaymentPage").then((m) => ({ default: m.PaymentPage })));
const PaymentCallbackPage = lazy(() => import("./pages/payments/PaymentPage").then((m) => ({ default: m.PaymentCallbackPage })));
const DisputePage = lazy(() => import("./pages/disputes/DisputePage").then((m) => ({ default: m.DisputePage })));
const WalletPage = lazy(() => import("./pages/wallet/WalletPage").then((m) => ({ default: m.WalletPage })));
const KYCPage = lazy(() => import("./pages/kyc/KYCPage").then((m) => ({ default: m.KYCPage })));
const PrivacyPolicyPage = lazy(() => import("./pages/legal/LegalPages").then((m) => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = lazy(() => import("./pages/legal/LegalPages").then((m) => ({ default: m.TermsOfServicePage })));
const AccountDeletionPage = lazy(() => import("./pages/legal/LegalPages").then((m) => ({ default: m.AccountDeletionPage })));
const AdminPage = lazy(() => import("./pages/admin/AdminPage").then((m) => ({ default: m.AdminPage })));
const ProfilePage = lazy(() => import("./pages/profile/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: (failureCount, error: any) => {
        if ([401, 403, 404].includes(error?.status)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { setSession, profile } = useAuthStore();
  const { addNotification, setNotifications } = useNotificationStore();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { if (mounted) setSession(session); }
    );
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [setSession]);

  useEffect(() => {
    if (!profile?.id) return;
    let mounted = true;

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => { if (mounted && data) setNotifications(data as any); });

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => { if (mounted) addNotification(payload.new as any); })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") console.error("Notification channel error");
      });

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [profile?.id, addNotification, setNotifications]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-otp" element={<VerifyOTPPage />} />
            <Route path="/payment/callback" element={<PaymentCallbackPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/jobs/:id" element={<JobDetailPage />} />
                <Route path="/chat/:roomId" element={<ChatPage />} />
                <Route path="/contracts/:id" element={<ContractPage />} />
                <Route path="/contracts/:id/pay" element={<PaymentPage />} />
                <Route path="/contracts/:id/dispute" element={<DisputePage />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/kyc" element={<KYCPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/delete-account" element={<AccountDeletionPage />} />
                <Route element={<RoleGuard allowedRoles={["owner", "admin"]} />}>
                  <Route path="/jobs/post" element={<PostJobPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>

      <Toaster
        position="top-right"
        containerStyle={{ top: 70 }}
        toastOptions={{
          duration: 4000,
          style: {
            background: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid #334155",
            borderRadius: "12px",
            fontSize: "14px",
            maxWidth: "380px",
          },
          success: { iconTheme: { primary: "#10b981", secondary: "#fff" } },
          error: { iconTheme: { primary: "#ef4444", secondary: "#fff" } },
        }}
      />
    </QueryClientProvider>
  );
}