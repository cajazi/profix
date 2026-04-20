import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  Sun, Moon, Monitor, Lock, Bell, Shield,
  ChevronRight, Check, Loader2, Eye, EyeOff,
  Smartphone, Globe, LogOut
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

type Theme = "system" | "light" | "dark";

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("profix_theme") as Theme) || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    localStorage.setItem("profix_theme", theme);
  }, [theme]);

  return { theme, setTheme };
}

function ChangePINSection() {
  const [step, setStep] = useState<"idle" | "form">("idle");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { profile } = useAuthStore();

  const hashPIN = async (pin: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + "profix_salt_2026");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleChange = async () => {
    if (currentPin.length !== 6) { setError("Enter your current 6-digit PIN"); return; }
    if (newPin.length !== 6) { setError("New PIN must be 6 digits"); return; }
    if (newPin !== confirmPin) { setError("PINs do not match"); return; }
    if (/^(\d)\1{5}$/.test(newPin)) { setError("PIN cannot be all same digits"); return; }

    setLoading(true);
    try {
      const currentHash = await hashPIN(currentPin);
      const { data: user } = await supabase
        .from("users")
        .select("pin_hash")
        .eq("id", profile!.id)
        .single();

      if (!user || user.pin_hash !== currentHash) {
        setError("Current PIN is incorrect");
        return;
      }

      const newHash = await hashPIN(newPin);
      await supabase.from("users").update({ pin_hash: newHash }).eq("id", profile!.id);
      await supabase.auth.updateUser({ password: newHash });

      toast.success("Login PIN changed!");
      setStep("idle");
      setCurrentPin(""); setNewPin(""); setConfirmPin(""); setError("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const PINRow = ({ label, value, onChange }: {
    label: string; value: string; onChange: (v: string) => void;
  }) => (
    <div>
      <p className="text-slate-400 text-xs mb-2">{label}</p>
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <input
            key={i}
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            maxLength={1}
            value={value[i] || ""}
            onChange={(e) => {
              if (!/^\d*$/.test(e.target.value)) return;
              const digits = value.split("");
              digits[i] = e.target.value.slice(-1);
              onChange(digits.join(""));
              setError("");
            }}
            className="w-10 h-10 text-center text-sm font-bold rounded-xl border-2 bg-slate-800 text-white focus:outline-none border-slate-700 focus:border-indigo-500 transition"
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {step === "idle" ? (
        <button
          onClick={() => setStep("form")}
          className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center">
              <Lock className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-white text-sm font-medium">Change Login PIN</p>
              <p className="text-slate-500 text-xs">Update your 6-digit login PIN</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>
      ) : (
        <div className="bg-slate-800 rounded-2xl p-5 space-y-4">
          <h4 className="text-white font-medium text-sm">Change Login PIN</h4>
          <PINRow label="Current PIN" value={currentPin} onChange={setCurrentPin} />
          <PINRow label="New PIN" value={newPin} onChange={setNewPin} />
          <PINRow label="Confirm new PIN" value={confirmPin} onChange={setConfirmPin} />
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition"
          >
            {showPin ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
          </button>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setStep("idle"); setError(""); setCurrentPin(""); setNewPin(""); setConfirmPin(""); }}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-xl transition text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleChange}
              disabled={loading || currentPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { profile, setSession } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    jobs: true,
    payments: true,
    disputes: true,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    navigate("/login");
    toast.success("Logged out successfully");
  };

  const themes: { value: Theme; label: string; icon: any; desc: string }[] = [
    { value: "light", label: "Light", icon: Sun, desc: "Always light" },
    { value: "dark", label: "Dark", icon: Moon, desc: "Always dark" },
    { value: "system", label: "System", icon: Monitor, desc: "Follow device" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage your app preferences</p>
      </div>

      <div className="space-y-6">

        {/* Appearance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-400" /> Appearance
          </h2>
          <p className="text-slate-400 text-xs mb-4">Choose how ProFix looks on your device</p>
          <div className="grid grid-cols-3 gap-3">
            {themes.map(({ value, label, icon: Icon, desc }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                  theme === value
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-700 hover:border-slate-600"
                )}
              >
                <Icon className={cn("w-5 h-5", theme === value ? "text-indigo-400" : "text-slate-400")} />
                <span className={cn("text-xs font-medium", theme === value ? "text-white" : "text-slate-400")}>
                  {label}
                </span>
                <span className="text-slate-500 text-xs text-center">{desc}</span>
                {theme === value && <Check className="w-3 h-3 text-indigo-400" />}
              </button>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> Security
          </h2>
          <div className="space-y-3">
            <ChangePINSection />
            <button
              onClick={() => navigate("/forgot-pin")}
              className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <Lock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-left">
                  <p className="text-white text-sm font-medium">Forgot PIN</p>
                  <p className="text-slate-500 text-xs">Reset via email verification</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={() => navigate("/profile")}
              className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-500/10 rounded-xl flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-violet-400" />
                </div>
                <div className="text-left">
                  <p className="text-white text-sm font-medium">Transaction PIN</p>
                  <p className="text-slate-500 text-xs">Manage your 4-digit payment PIN</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-400" /> Notifications
          </h2>
          <div className="space-y-3">
            {([
              { key: "email", label: "Email notifications", desc: "Receive updates via email" },
              { key: "push", label: "Push notifications", desc: "In-app alerts" },
              { key: "jobs", label: "Job alerts", desc: "New job opportunities" },
              { key: "payments", label: "Payment alerts", desc: "Escrow and wallet updates" },
              { key: "disputes", label: "Dispute updates", desc: "Dispute status changes" },
            ] as { key: keyof typeof notifications; label: string; desc: string }[]).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-white text-sm font-medium">{label}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
                <button
                  onClick={() => setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                    notifications[key] ? "bg-indigo-600" : "bg-slate-700"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                    notifications[key] ? "translate-x-5" : "translate-x-0.5"
                  )} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* About */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-400" /> About
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">App version</span>
              <span className="text-white">v1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Account</span>
              <span className="text-white truncate max-w-48">{profile?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Role</span>
              <span className="text-white capitalize">{profile?.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Privacy Policy</span>
              <button onClick={() => navigate("/privacy")} className="text-indigo-400 hover:text-indigo-300 transition text-xs">View →</button>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Terms of Service</span>
              <button onClick={() => navigate("/terms")} className="text-indigo-400 hover:text-indigo-300 transition text-xs">View →</button>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 py-4 rounded-2xl transition font-medium"
        >
          <LogOut className="w-5 h-5" /> Sign Out
        </button>

        <p className="text-center text-slate-600 text-xs pb-4">
          ProFix © 2026 · Made with ❤️ in Nigeria
        </p>
      </div>
    </div>
  );
}