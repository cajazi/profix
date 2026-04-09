import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";
import type { User, Notification } from "../types/database";
import { supabase } from "../lib/supabase";

interface AuthState {
  user: SupabaseUser | null;
  profile: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: User | null) => void;
  fetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,

      setSession: (session) => {
        set({
          session,
          user: session?.user ?? null,
          isAuthenticated: !!session,
          isLoading: false,
        });
        if (session) get().fetchProfile();
      },

      setProfile: (profile) => set({ profile }),

      fetchProfile: async () => {
        const { user } = get();
        if (!user) return;
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single();
        if (data) set({ profile: data });
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({
          user: null,
          profile: null,
          session: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "profix-auth",
      partialize: (state) => ({ session: state.session }),
    }
  )
);

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (n: Notification[]) => void;
  addNotification: (n: Notification) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.is_read).length,
    }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.is_read ? 0 : 1),
    })),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    })),
}));