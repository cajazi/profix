import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import { Loader2, Mail, ArrowLeft, Shield, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

// ─── OTP Input ────────────────────────────────────────────────
function OTPInput({ length = 6, value, onChange, disabled }: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (i: number, v: string) => {
    if (!/^\d*$/.test(v)) return;
    const digits = value.split("");
    digits[i] = v.slice(-1);
    onChange(digits.join(""));
    if (v && i < length - 1) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted);
    inputs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            "w-12 h-14 text-center text-xl font-bold rounded-2xl border-2 transition-all",
            "bg-slate-800 text-white focus:outline-none",
            value[i]
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
              : "border-slate-700 focus:border-indigo-500",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
      ))}
    </div>
  );
}

// ─── Security helpers ─────────────────────────────────────────
function getDeviceFingerprint(): string {
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
  ].join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  const browser =
    ua.includes("Chrome") ? "Chrome" :
    ua.includes("Firefox") ? "Firefox" :
    ua.includes("Safari") ? "Safari" :
    ua.includes("Edge") ? "Edge" : "Unknown";
  const os =
    ua.includes("Windows") ? "Windows" :
    ua.includes("Mac") ? "macOS" :
    ua.includes("Linux") ? "Linux" :
    ua.includes("Android") ? "Android" :
    ua.includes("iPhone") || ua.includes("iPad") ? "iOS" : "Unknown";
  return { browser, os, device_name: `${browser} on ${os}` };
}

async function logAuthAttempt(
  email: string,
  type: "login" | "otp_request" | "otp_verify",
  success: boolean,
  reason?: string
) {
  try {
    await supabase.from("auth_attempts").insert({
      email,
      device_fingerprint: getDeviceFingerprint(),
      attempt_type: type,
      success,
      failure_reason: reason || null,
    });
  } catch { /* non-blocking */ }
}

async function checkRateLimit(email: string): Promise<{
  blocked: boolean;
  remaining: number;
  retryAfter: number;
}> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("auth_attempts")
    .select("success, created_at")
    .eq("email", email)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const failures = (data || []).filter((a) => !a.success).length;
  const MAX = 5;

  if (failures >= MAX) {
    const oldest = (data || []).filter((a) => !a.success).pop();
    const lockUntil = oldest
      ? new Date(oldest.created_at).getTime() + 15 * 60 * 1000
      : Date.now() + 15 * 60 * 1000;
    const retryAfter = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
    return { blocked: true, remaining: 0, retryAfter };
  }

  return { blocked: false, remaining: MAX - failures, retryAfter: 0 };
}

// ─── Shared lock warning ──────────────────────────────────────
function LockWarning({ locked, lockTimer, attempts }: {
  locked: boolean;
  lockTimer: number;
  attempts: number;
}) {
  if (locked) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-center">
        <p className="text-red-400 font-semibold text-sm">🔒 Account Temporarily Locked</p>
        <p className="text-red-300 text-xs mt-1">
          Too many failed attempts. Try again in{" "}
          <span className="font-bold text-red-200">
            {Math.floor(lockTimer / 60)}:{String(lockTimer % 60).padStart(2, "0")}
          </span>
        </p>
      </div>
    );
  }
  if (attempts > 0 && attempts < 5) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-center">
        <p className="text-amber-400 text-xs">
          ⚠️ {5 - attempts} attempt{5 - attempts !== 1 ? "s" : ""} remaining before lockout
        </p>
      </div>
    );
  }
  return null;
}

// ─── Gradient Header ──────────────────────────────────────────
function AuthHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 pt-14 pb-12">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
            <span className="text-white font-black text-lg">P</span>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">ProFix</span>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Auth Footer ──────────────────────────────────────────────
function AuthFooter({ showTerms }: { showTerms?: boolean }) {
  return (
    <div className="px-6 py-6 text-center space-y-2">
      {showTerms && (
        <p className="text-slate-600 text-xs">By creating an account you agree to our</p>
      )}
      <div className="flex items-center justify-center gap-4 text-xs text-slate-600">
        <Link to="/privacy" className="hover:text-slate-400 transition">Privacy Policy</Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-slate-400 transition">Terms of Service</Link>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────
export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer((p) => p - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  useEffect(() => {
    if (lockTimer > 0) {
      const t = setTimeout(() => setLockTimer((p) => p - 1), 1000);
      return () => clearTimeout(t);
    } else if (locked && lockTimer === 0) {
      setLocked(false);
      setAttempts(0);
    }
  }, [lockTimer, locked]);

  const handleLockout = (newAttempts: number, retryAfter = 15 * 60) => {
    if (newAttempts >= 5) {
      setLocked(true);
      setLockTimer(retryAfter);
      toast.error("Too many attempts. Account locked for 15 minutes.");
    } else {
      toast.error(`Failed. ${5 - newAttempts} attempt${5 - newAttempts !== 1 ? "s" : ""} remaining.`);
    }
  };

  const sendOTP = async () => {
    if (!email.trim()) return toast.error("Enter your email address");
    if (locked) return toast.error(`Locked. Try again in ${Math.ceil(lockTimer / 60)}m`);

    const { blocked, retryAfter } = await checkRateLimit(email.trim());
    if (blocked) {
      setLocked(true);
      setLockTimer(retryAfter);
      toast.error(`Account locked. Try again in ${Math.ceil(retryAfter / 60)} minutes.`);
      return;
    }

    setLoading(true);
    try {
      // Check if email is registered
      const { data: exists } = await supabase.rpc("check_email_exists", {
        p_email: email.trim(),
      });
      if (!exists) {
        // Generic message to prevent enumeration but block login
        await logAuthAttempt(email.trim(), "login", false, "Email not registered");
        setSent(true);
        setResendTimer(60);
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      await logAuthAttempt(email.trim(), "otp_request", true);
      setSent(true);
      setResendTimer(60);
      toast.success("Code sent!");
    } catch (err) {
      const n = attempts + 1;
      setAttempts(n);
      await logAuthAttempt(email.trim(), "otp_request", false, (err as Error).message);
      handleLockout(n);
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (otp.length !== 6 || verifying) return;
    if (locked) return toast.error(`Locked. Try again in ${Math.ceil(lockTimer / 60)}m`);
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "magiclink",
      });
      if (error) throw error;
      await logAuthAttempt(email.trim(), "otp_verify", true);

      // Log device session
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { browser, os, device_name } = getDeviceInfo();
        await supabase.from("device_sessions").upsert({
          user_id: user.id,
          device_fingerprint: getDeviceFingerprint(),
          device_name,
          browser,
          os,
          last_seen: new Date().toISOString(),
        }, { onConflict: "user_id,device_fingerprint" });
      }

      toast.success("Welcome back! 👋");
      navigate("/dashboard");
    } catch {
      const n = attempts + 1;
      setAttempts(n);
      await logAuthAttempt(email.trim(), "otp_verify", false, "Invalid OTP");

      if (n >= 5) {
        setLocked(true);
        setLockTimer(15 * 60);
        toast.error("Too many failed attempts. Locked for 15 minutes.");
        setOtp("");
        setSent(false);
      } else {
        const delay = Math.min(n * 2, 10);
        toast.error(`Invalid code. ${5 - n} attempt${5 - n !== 1 ? "s" : ""} remaining.`);
        setTimeout(() => setOtp(""), delay * 1000);
      }
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (otp.length === 6) verifyOTP();
  }, [otp]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <AuthHeader>
        {sent ? (
          <>
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white text-2xl font-bold mb-1">Check your email</h1>
            <p className="text-white/70 text-sm">
              Code sent to <span className="text-white font-medium">{email}</span>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-white text-3xl font-bold mb-2">Welcome back</h1>
            <p className="text-white/70">Sign in with your email address</p>
          </>
        )}
      </AuthHeader>

      <div className="flex-1 px-6 -mt-6">
        <div className="max-w-md mx-auto bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8">
          {!sent ? (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendOTP()}
                    placeholder="you@example.com"
                    disabled={locked}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm disabled:opacity-50"
                    autoComplete="email"
                  />
                </div>
              </div>

              <LockWarning locked={locked} lockTimer={lockTimer} attempts={attempts} />

              <button
                onClick={sendOTP}
                disabled={loading || !email.trim() || locked}
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
              >
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending code…</>
                  : "Send verification code →"
                }
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-slate-600 text-xs">New to ProFix?</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              <Link
                to="/register"
                className="block w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-4 rounded-2xl transition text-center text-sm"
              >
                Create an account
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-slate-400 text-sm text-center">
                Enter the 6-digit code sent to your email
              </p>

              <OTPInput value={otp} onChange={setOtp} disabled={verifying || locked} />

              <LockWarning locked={locked} lockTimer={lockTimer} attempts={attempts} />

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                </div>
              )}

              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-slate-500 text-sm">
                    Resend in <span className="text-white font-medium">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    onClick={() => { setOtp(""); setAttempts(0); sendOTP(); }}
                    disabled={locked}
                    className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition disabled:opacity-50"
                  >
                    Resend code
                  </button>
                )}
              </div>

              <button
                onClick={() => { setSent(false); setOtp(""); setAttempts(0); }}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm transition"
              >
                <ArrowLeft className="w-4 h-4" /> Use different email
              </button>
            </div>
          )}
        </div>

        <div className="max-w-md mx-auto mt-5 flex items-center justify-center gap-2 text-slate-600 text-xs">
          <Shield className="w-3.5 h-3.5" />
          256-bit SSL encrypted · Your data is safe
        </div>
      </div>

      <AuthFooter />
    </div>
  );
}

// ─── Register Page ────────────────────────────────────────────
export function RegisterPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<"details" | "verify">("details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "worker" | null>(null);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer((p) => p - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const sendOTP = async () => {
    if (!fullName.trim()) return toast.error("Enter your full name");
    if (!email.trim()) return toast.error("Enter your email address");
    if (!role) return toast.error("Select your account type");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { data: { full_name: fullName.trim(), role } },
      });
      if (error) throw error;
      await logAuthAttempt(email.trim(), "otp_request", true);
      setStep("verify");
      setResendTimer(60);
      toast.success("Verification code sent!");
    } catch (err) {
      await logAuthAttempt(email.trim(), "otp_request", false, (err as Error).message);
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (otp.length !== 6 || verifying) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "signup",
      });
      if (error) throw error;
      await logAuthAttempt(email.trim(), "otp_verify", true);

      // Log device session
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { browser, os, device_name } = getDeviceInfo();
        await supabase.from("device_sessions").upsert({
          user_id: user.id,
          device_fingerprint: getDeviceFingerprint(),
          device_name,
          browser,
          os,
          last_seen: new Date().toISOString(),
        }, { onConflict: "user_id,device_fingerprint" });
      }

      toast.success("Account created! Welcome to ProFix 🎉");
      navigate("/dashboard");
    } catch {
      toast.error("Invalid or expired code. Try again.");
      setOtp("");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (otp.length === 6) verifyOTP();
  }, [otp]);

  const roles = [
    { value: "owner" as const, label: "Hire Workers", desc: "Post jobs & manage projects", icon: "🏠", activeColor: "border-indigo-500 bg-indigo-500/10" },
    { value: "worker" as const, label: "Find Work", desc: "Apply for jobs & earn money", icon: "🔧", activeColor: "border-emerald-500 bg-emerald-500/10" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <AuthHeader>
        {step === "details" ? (
          <>
            <h1 className="text-white text-3xl font-bold mb-2">Create account</h1>
            <p className="text-white/70">Join thousands of professionals</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white text-2xl font-bold mb-1">Verify your email</h1>
            <p className="text-white/70 text-sm">
              Code sent to <span className="text-white font-medium">{email}</span>
            </p>
          </>
        )}
      </AuthHeader>

      <div className="flex-1 px-6 -mt-6">
        <div className="max-w-md mx-auto bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8">
          {step === "details" ? (
            <div className="space-y-4">
              {/* Full name */}
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ifeanyichukwu Cosmas"
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">I want to…</label>
                <div className="grid grid-cols-2 gap-3">
                  {roles.map(({ value, label, desc, icon, activeColor }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center",
                        role === value ? activeColor : "border-slate-700 hover:border-slate-600"
                      )}
                    >
                      <span className="text-2xl">{icon}</span>
                      <div>
                        <p className={cn("font-semibold text-sm", role === value ? "text-white" : "text-slate-300")}>
                          {label}
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
                      </div>
                      {role === value && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={sendOTP}
                disabled={loading || !fullName.trim() || !email.trim() || !role}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
              >
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating account…</>
                  : "Create account →"
                }
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-slate-600 text-xs">Already have an account?</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              <Link
                to="/login"
                className="block w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-4 rounded-2xl transition text-center text-sm"
              >
                Sign in instead
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-slate-400 text-sm text-center">
                Enter the 6-digit code to verify your email
              </p>
              <OTPInput value={otp} onChange={setOtp} disabled={verifying} />

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating your account…
                </div>
              )}

              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-slate-500 text-sm">
                    Resend in <span className="text-white font-medium">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    onClick={() => { setOtp(""); sendOTP(); }}
                    className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition"
                  >
                    Resend code
                  </button>
                )}
              </div>

              <button
                onClick={() => { setStep("details"); setOtp(""); }}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm transition"
              >
                <ArrowLeft className="w-4 h-4" /> Go back
              </button>
            </div>
          )}
        </div>

        <div className="max-w-md mx-auto mt-5 flex items-center justify-center gap-2 text-slate-600 text-xs">
          <Shield className="w-3.5 h-3.5" />
          256-bit SSL encrypted · Your data is safe
        </div>
      </div>

      <AuthFooter showTerms />
    </div>
  );
}

// ─── Verify OTP Page ──────────────────────────────────────────
export function VerifyOTPPage() {
  const navigate = useNavigate();
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const email = new URLSearchParams(window.location.search).get("email") || "";

  const verify = async () => {
    if (otp.length !== 6 || verifying) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "magiclink",
      });
      if (error) throw error;
      navigate("/dashboard");
    } catch {
      toast.error("Invalid code. Please try again.");
      setOtp("");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (otp.length === 6) verify();
  }, [otp]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-indigo-400" />
        </div>
        <h1 className="text-white text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-slate-400 text-sm mb-8">Enter the 6-digit code we sent you</p>
        <OTPInput value={otp} onChange={setOtp} disabled={verifying} />
        {verifying && (
          <div className="flex justify-center mt-4">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        )}
        <button
          onClick={() => navigate("/login")}
          className="mt-8 w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to login
        </button>
      </div>
    </div>
  );
}