import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { supabase } from "./lib/supabase";
import { useAuthStore, useNotificationStore } from "./store/auth.store";

// Pages
import { LoginPage, RegisterPage, VerifyOTPPage } from "./pages/auth/AuthPages";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { JobsPage, PostJobPage } from "./pages/jobs/JobsPage";
import { ChatPage } from "./pages/chat/ChatPage";
import { ContractPage } from "./pages/contracts/ContractPage";
import { PaymentPage, PaymentCallbackPage } from "./pages/payments/PaymentPage";
import { DisputePage } from "./pages/disputes/DisputePage";

// Components
import { ProtectedRoute, RoleGuard, Layout } from "./components/layout/Layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function App() {
  const { setSession, profile } = useAuthStore();
  const { addNotification, setNotifications } = useNotificationStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    if (!profile?.id) return;

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setNotifications(data as any);
      });

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          addNotification(payload.new as any);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-otp" element={<VerifyOTPPage />} />
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/chat/:roomId" element={<ChatPage />} />
              <Route path="/contracts/:id" element={<ContractPage />} />
              <Route path="/contracts/:id/pay" element={<PaymentPage />} />
              <Route path="/contracts/:id/dispute" element={<DisputePage />} />

              {/* Owner only */}
              <Route element={<RoleGuard allowedRoles={["owner"]} />}>
                <Route path="/jobs/post" element={<PostJobPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#1a1a2e",
            color: "#e2e8f0",
            border: "1px solid #2d3748",
            borderRadius: "12px",
          },
        }}
      />
    </QueryClientProvider>
  );
}