import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import { Loader2, Mail, ArrowLeft, Shield, CheckCircle, Phone, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

// ─── PIN Input ────────────────────────────────────────────────
function PINInput({ length = 6, value, onChange, disabled, masked = true }: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  masked?: boolean;
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
    <div className="flex gap-2 sm:gap-3 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type={masked ? "password" : "text"}
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            "w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-2xl border-2 transition-all",
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

// ─── OTP Input (same as PIN but always visible) ───────────────
function OTPInput({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return <PINInput value={value} onChange={onChange} disabled={disabled} masked={false} />;
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

async function hashPIN(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "profix_salt_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function logAuthAttempt(
  identifier: string,
  type: "login" | "otp_request" | "otp_verify" | "pin_login",
  success: boolean,
  reason?: string
) {
  try {
    await supabase.from("auth_attempts").insert({
      email: identifier,
      device_fingerprint: getDeviceFingerprint(),
      attempt_type: type,
      success,
      failure_reason: reason || null,
    });
  } catch { /* non-blocking */ }
}

async function checkRateLimit(identifier: string): Promise<{
  blocked: boolean;
  remaining: number;
  retryAfter: number;
}> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("auth_attempts")
    .select("success, created_at")
    .eq("email", identifier)
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

async function trustDevice(userId: string) {
  const { browser, os, device_name } = getDeviceInfo();
  await supabase.from("device_sessions").upsert({
    user_id: userId,
    device_fingerprint: getDeviceFingerprint(),
    device_name,
    browser,
    os,
    last_seen: new Date().toISOString(),
  }, { onConflict: "user_id,device_fingerprint" });
}

// ─── Shared Components ────────────────────────────────────────
function LockWarning({ locked, lockTimer, attempts }: {
  locked: boolean; lockTimer: number; attempts: number;
}) {
  if (locked) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-center">
        <p className="text-red-400 font-semibold text-sm">🔒 Account Temporarily Locked</p>
        <p className="text-red-300 text-xs mt-1">
          Try again in{" "}
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
          ⚠️ {5 - attempts} attempt{5 - attempts !== 1 ? "s" : ""} remaining
        </p>
      </div>
    );
  }
  return null;
}

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
type LoginStep = "identifier" | "pin" | "otp";

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<LoginStep>("identifier");
  const [identifier, setIdentifier] = useState(""); // email or phone
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const [showPin, setShowPin] = useState(false);
  const [userEmail, setUserEmail] = useState(""); // resolved email for OTP
  const [userId, setUserId] = useState("");

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

  const handleLockout = (n: number) => {
    if (n >= 5) {
      setLocked(true);
      setLockTimer(15 * 60);
      toast.error("Too many attempts. Locked for 15 minutes.");
    } else {
      toast.error(`Incorrect. ${5 - n} attempt${5 - n !== 1 ? "s" : ""} remaining.`);
    }
  };

  // Step 1: Check identifier and go to PIN
  const handleIdentifier = async () => {
    if (!identifier.trim()) return toast.error("Enter your email or phone number");
    if (locked) return toast.error(`Locked. Try again in ${Math.ceil(lockTimer / 60)}m`);

    const { blocked, retryAfter } = await checkRateLimit(identifier.trim());
    if (blocked) {
      setLocked(true);
      setLockTimer(retryAfter);
      toast.error(`Account locked. Try in ${Math.ceil(retryAfter / 60)}m`);
      return;
    }

    setLoading(true);
    try {
      // Check if user exists
      const { data: exists } = await supabase.rpc("check_email_exists", {
        p_email: identifier.trim(),
      });

      // Always proceed to PIN (prevent enumeration)
      setStep("pin");
      if (exists) {
        // Fetch email if phone used
        const { data: user } = await supabase
          .from("users")
          .select("id, email")
          .or(`email.eq.${identifier.trim()},phone_number.eq.${identifier.trim()}`)
          .single();
        if (user) {
          setUserEmail(user.email);
          setUserId(user.id);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify PIN
  const handlePIN = async () => {
    if (pin.length !== 6) return toast.error("Enter your 6-digit PIN");
    if (locked) return toast.error(`Locked. Try again in ${Math.ceil(lockTimer / 60)}m`);
    setVerifying(true);
    try {
      const pinHash = await hashPIN(pin);
      const fingerprint = getDeviceFingerprint();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pin-login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: identifier.trim(),
            pin_hash: pinHash,
            device_fingerprint: fingerprint,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        const n = attempts + 1;
        setAttempts(n);
        await logAuthAttempt(identifier.trim(), "pin_login", false, data.error);
        setPin("");
        handleLockout(n);
        return;
      }

      await logAuthAttempt(identifier.trim(), "pin_login", true);

      if (data.trusted && data.token) {
        // Trusted device — verify token directly, no OTP needed
        const { error } = await supabase.auth.verifyOtp({
          email: data.email,
          token: data.token,
          type: "magiclink",
        });

        if (error) {
          // Fallback to OTP if token verification fails
          await supabase.auth.signInWithOtp({ email: data.email });
          setUserEmail(data.email);
          setStep("otp");
          setResendTimer(60);
          toast.success("Check your email for the login code.");
        } else {
          await trustDevice((await supabase.auth.getUser()).data.user!.id);
          toast.success("Welcome back! 👋");
          navigate("/dashboard");
        }
      } else {
        // New device — require OTP
        setUserEmail(data.email);
        await supabase.auth.signInWithOtp({ email: data.email });
        setStep("otp");
        setResendTimer(60);
        toast.success("New device detected! Check your email to verify.");
      }
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  // Step 3: Verify OTP
  const handleOTP = async () => {
    if (otp.length !== 6 || verifying) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: otp,
        type: "magiclink",
      });
      if (error) throw error;

      await logAuthAttempt(identifier.trim(), "otp_verify", true);

      // Trust this device
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await trustDevice(user.id);

      toast.success("Welcome back! 👋");
      navigate("/dashboard");
    } catch {
      const n = attempts + 1;
      setAttempts(n);
      await logAuthAttempt(identifier.trim(), "otp_verify", false, "Invalid OTP");
      handleLockout(n);
      setOtp("");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (pin.length === 6 && step === "pin") handlePIN();
  }, [pin]);

  useEffect(() => {
    if (otp.length === 6 && step === "otp") handleOTP();
  }, [otp]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <AuthHeader>
        {step === "identifier" && (
          <>
            <h1 className="text-white text-3xl font-bold mb-2">Welcome back</h1>
            <p className="text-white/70">Sign in with your email or phone</p>
          </>
        )}
        {step === "pin" && (
          <>
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white text-2xl font-bold mb-1">Enter your PIN</h1>
            <p className="text-white/70 text-sm">{identifier}</p>
          </>
        )}
        {step === "otp" && (
          <>
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white text-2xl font-bold mb-1">Check your email</h1>
            <p className="text-white/70 text-sm">
              Code sent to <span className="text-white font-medium">{userEmail}</span>
            </p>
          </>
        )}
      </AuthHeader>

      <div className="flex-1 px-6 -mt-6">
        <div className="max-w-md mx-auto bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8">

          {/* Step 1 — Identifier */}
          {step === "identifier" && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">
                  Email or Phone Number
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleIdentifier()}
                    placeholder="email@example.com or 08012345678"
                    disabled={locked}
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm disabled:opacity-50"
                    autoComplete="username"
                  />
                </div>
              </div>

              <LockWarning locked={locked} lockTimer={lockTimer} attempts={attempts} />

              <button
                onClick={handleIdentifier}
                disabled={loading || !identifier.trim() || locked}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
              >
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Checking…</>
                  : "Continue →"
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
          )}

          {/* Step 2 — PIN */}
          {step === "pin" && (
            <div className="space-y-5">
              <p className="text-slate-400 text-sm text-center">
                Enter your 6-digit PIN to continue
              </p>

              <div className="relative">
                <PINInput
                  value={pin}
                  onChange={setPin}
                  disabled={verifying || locked}
                  masked={!showPin}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition"
                >
                  {showPin
                    ? <><EyeOff className="w-3 h-3" /> Hide PIN</>
                    : <><Eye className="w-3 h-3" /> Show PIN</>
                  }
                </button>
              </div>

              <div className="mt-8">
                <LockWarning locked={locked} lockTimer={lockTimer} attempts={attempts} />
              </div>

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying PIN…
                </div>
              )}

              <button
                onClick={() => { setStep("identifier"); setPin(""); setAttempts(0); }}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm transition"
              >
                <ArrowLeft className="w-4 h-4" /> Use different account
              </button>
            </div>
          )}

          {/* Step 3 — OTP */}
          {step === "otp" && (
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
                    onClick={async () => {
                      setOtp("");
                      await supabase.auth.signInWithOtp({ email: userEmail });
                      setResendTimer(60);
                      toast.success("New code sent!");
                    }}
                    disabled={locked}
                    className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition"
                  >
                    Resend code
                  </button>
                )}
              </div>

              <button
                onClick={() => { setStep("pin"); setOtp(""); setAttempts(0); }}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm transition"
              >
                <ArrowLeft className="w-4 h-4" /> Back
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
type RegisterStep = "details" | "pin" | "verify";

export function RegisterPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<RegisterStep>("details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"owner" | "worker" | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer((p) => p - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const validatePIN = (p: string): string | null => {
    if (p.length !== 6) return "PIN must be 6 digits";
    if (/^(\d)\1{5}$/.test(p)) return "PIN cannot be all same digits (e.g. 111111)";
    if (/^(012345|123456|234567|345678|456789|567890|098765|987654|876543|765432|654321|543210)$/.test(p))
      return "PIN cannot be a sequential number";
    return null;
  };

  const handleDetails = () => {
    if (!fullName.trim()) return toast.error("Enter your full name");
    if (!email.trim()) return toast.error("Enter your email address");
    if (!phone.trim()) return toast.error("Enter your phone number");
    if (!role) return toast.error("Select your account type");
    setStep("pin");
  };

  const handlePINSetup = () => {
    const err = validatePIN(pin);
    if (err) { setPinError(err); return; }
    if (pin !== confirmPin) { setPinError("PINs do not match"); return; }
    setPinError("");
    sendOTP();
  };

  const sendOTP = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { data: { full_name: fullName.trim(), role, phone_number: phone.trim() } },
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
        type: "email",
      });
      if (error) throw error;

      // Save PIN hash and phone to user record
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const pinHash = await hashPIN(pin);
        await supabase.from("users").update({
          pin_hash: pinHash,
          phone_number: phone.trim(),
        }).eq("id", user.id);

        await trustDevice(user.id);
        await logAuthAttempt(email.trim(), "otp_verify", true);
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
        {step === "details" && (
          <>
            <h1 className="text-white text-3xl font-bold mb-2">Create account</h1>
            <p className="text-white/70">Join thousands of professionals</p>
          </>
        )}
        {step === "pin" && (
          <>
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white text-2xl font-bold mb-1">Create your PIN</h1>
            <p className="text-white/70 text-sm">You'll use this to log in quickly</p>
          </>
        )}
        {step === "verify" && (
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

      {/* Progress indicator */}
      <div className="px-6 -mt-3 mb-2">
        <div className="max-w-md mx-auto flex gap-2">
          {["details", "pin", "verify"].map((s, i) => (
            <div
              key={s}
              className={cn(
                "flex-1 h-1 rounded-full transition-all",
                ["details", "pin", "verify"].indexOf(step) >= i
                  ? "bg-indigo-500"
                  : "bg-slate-800"
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 mt-4">
        <div className="max-w-md mx-auto bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8">

          {/* Step 1 — Details */}
          {step === "details" && (
            <div className="space-y-4">
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

              <div>
                <label className="block text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08012345678"
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
                    autoComplete="tel"
                  />
                </div>
              </div>

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
                onClick={handleDetails}
                disabled={!fullName.trim() || !email.trim() || !phone.trim() || !role}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition text-sm"
              >
                Continue →
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
          )}

          {/* Step 2 — Create PIN */}
          {step === "pin" && (
            <div className="space-y-6">
              <div className="space-y-5">
                <div>
                  <p className="text-slate-400 text-sm text-center mb-4">
                    Create a 6-digit PIN you'll remember
                  </p>
                  <PINInput
                    value={pin}
                    onChange={(v) => { setPin(v); setPinError(""); }}
                    masked={!showPin}
                  />
                </div>

                <div>
                  <p className="text-slate-400 text-sm text-center mb-4">
                    Confirm your PIN
                  </p>
                  <PINInput
                    value={confirmPin}
                    onChange={(v) => { setConfirmPin(v); setPinError(""); }}
                    masked={!showPin}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="w-full flex items-center justify-center gap-1 text-slate-500 hover:text-slate-300 text-xs transition"
                >
                  {showPin
                    ? <><EyeOff className="w-3 h-3" /> Hide PIN</>
                    : <><Eye className="w-3 h-3" /> Show PIN</>
                  }
                </button>

                {pinError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                    <p className="text-red-400 text-xs">{pinError}</p>
                  </div>
                )}

                <div className="bg-slate-800 rounded-xl p-3 space-y-1">
                  <p className="text-slate-400 text-xs font-medium">PIN requirements:</p>
                  <p className={cn("text-xs", pin.length === 6 ? "text-emerald-400" : "text-slate-500")}>
                    ✓ Exactly 6 digits
                  </p>
                  <p className={cn("text-xs", pin && !/^(\d)\1{5}$/.test(pin) ? "text-emerald-400" : "text-slate-500")}>
                    ✓ No repeated digits (e.g. 111111)
                  </p>
                  <p className={cn("text-xs", pin === confirmPin && pin.length === 6 ? "text-emerald-400" : "text-slate-500")}>
                    ✓ PINs match
                  </p>
                </div>
              </div>

              <button
                onClick={handlePINSetup}
                disabled={loading || pin.length !== 6 || confirmPin.length !== 6}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
              >
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating account…</>
                  : "Create Account →"
                }
              </button>

              <button
                onClick={() => { setStep("details"); setPin(""); setConfirmPin(""); }}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm transition"
              >
                <ArrowLeft className="w-4 h-4" /> Go back
              </button>
            </div>
          )}

          {/* Step 3 — Verify OTP */}
          {step === "verify" && (
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
                onClick={() => { setStep("pin"); setOtp(""); }}
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