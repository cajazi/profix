import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import { Loader2, Mail, ArrowLeft, Shield, Eye, EyeOff, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

// ─── OTP Input Component ──────────────────────────────────────
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
    const next = digits.join("");
    onChange(next);
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
    const nextIndex = Math.min(pasted.length, length - 1);
    inputs.current[nextIndex]?.focus();
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

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const sendOTP = async () => {
    if (!email.trim()) return toast.error("Enter your email address");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      setSent(true);
      setResendTimer(60);
      toast.success("Code sent to your email!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (otp.length !== 6) return toast.error("Enter the 6-digit code");
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "magiclink",
      });
      if (error) throw error;
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (err) {
      toast.error("Invalid or expired code. Try again.");
      setOtp("");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (otp.length === 6) verifyOTP();
  }, [otp]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 pt-16 pb-12">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <span className="text-white font-black text-lg">P</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">ProFix</span>
          </div>
          {sent ? (
            <>
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
                <Mail className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-white text-2xl font-bold mb-1">Check your email</h1>
              <p className="text-white/70 text-sm">
                We sent a 6-digit code to{" "}
                <span className="text-white font-medium">{email}</span>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-white text-3xl font-bold mb-2">Welcome back</h1>
              <p className="text-white/70">Sign in with your email address</p>
            </>
          )}
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 px-6 -mt-6">
        <div className="max-w-md mx-auto bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8">
          {!sent ? (
            <div className="space-y-5">
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-sm"
                    autoComplete="email"
                  />
                </div>
              </div>

              <button
                onClick={sendOTP}
                disabled={loading || !email.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Sending code…</>
                ) : (
                  "Send verification code →"
                )}
              </button>

              <div className="flex items-center gap-3 py-2">
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
            <div className="space-y-6">
              <div>
                <p className="text-slate-400 text-sm text-center mb-6">
                  Enter the 6-digit code sent to your email
                </p>
                <OTPInput
                  value={otp}
                  onChange={setOtp}
                  disabled={verifying}
                />
              </div>

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying…
                </div>
              )}

              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-slate-500 text-sm">
                    Resend code in <span className="text-white font-medium">{resendTimer}s</span>
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
                onClick={() => { setSent(false); setOtp(""); }}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm transition"
              >
                <ArrowLeft className="w-4 h-4" /> Use different email
              </button>
            </div>
          )}
        </div>

        {/* Security badge */}
        <div className="max-w-md mx-auto mt-6 flex items-center justify-center gap-2 text-slate-600 text-xs">
          <Shield className="w-3.5 h-3.5" />
          256-bit SSL encrypted · Your data is safe
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-4 text-xs text-slate-600">
          <Link to="/privacy" className="hover:text-slate-400 transition">Privacy Policy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-slate-400 transition">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}

// ─── Register Page ────────────────────────────────────────────
export function RegisterPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<"details" | "verify">(  "details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "worker" | null>(null);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
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
        options: {
          data: { full_name: fullName.trim(), role },
        },
      });
      if (error) throw error;
      setStep("verify");
      setResendTimer(60);
      toast.success("Verification code sent!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (otp.length !== 6) return toast.error("Enter the 6-digit code");
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "signup",
      });
      if (error) throw error;
      toast.success("Account created! Welcome to ProFix 🎉");
      navigate("/dashboard");
    } catch (err) {
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
    {
      value: "owner" as const,
      label: "Hire Workers",
      desc: "Post jobs & manage projects",
      icon: "🏠",
      color: "border-indigo-500 bg-indigo-500/10",
      inactive: "border-slate-700 hover:border-slate-600",
    },
    {
      value: "worker" as const,
      label: "Find Work",
      desc: "Apply for jobs & earn money",
      icon: "🔧",
      color: "border-emerald-500 bg-emerald-500/10",
      inactive: "border-slate-700 hover:border-slate-600",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 pt-16 pb-12">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <span className="text-white font-black text-lg">P</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">ProFix</span>
          </div>
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
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 px-6 -mt-6">
        <div className="max-w-md mx-auto bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8">
          {step === "details" ? (
            <div className="space-y-5">
              {/* Full name */}
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">
                  Full Name
                </label>
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
                <label className="block text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">
                  Email Address
                </label>
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

              {/* Role selection */}
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-3 uppercase tracking-wider">
                  I want to…
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {roles.map(({ value, label, desc, icon, color, inactive }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center",
                        role === value ? color : inactive
                      )}
                    >
                      <span className="text-2xl">{icon}</span>
                      <div>
                        <p className={cn(
                          "font-semibold text-sm",
                          role === value ? "text-white" : "text-slate-300"
                        )}>
                          {label}
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
                      </div>
                      {role === value && (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={sendOTP}
                disabled={loading || !fullName.trim() || !email.trim() || !role}
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Creating account…</>
                ) : (
                  "Create account →"
                )}
              </button>

              <div className="flex items-center gap-3 py-2">
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
            <div className="space-y-6">
              <div>
                <p className="text-slate-400 text-sm text-center mb-6">
                  Enter the 6-digit code to verify your email
                </p>
                <OTPInput
                  value={otp}
                  onChange={setOtp}
                  disabled={verifying}
                />
              </div>

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating your account…
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

        {/* Security badge */}
        <div className="max-w-md mx-auto mt-6 flex items-center justify-center gap-2 text-slate-600 text-xs">
          <Shield className="w-3.5 h-3.5" />
          256-bit SSL encrypted · Your data is safe
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-6 text-center">
        <p className="text-slate-600 text-xs mb-2">
          By creating an account you agree to our
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-slate-600">
          <Link to="/privacy" className="hover:text-slate-400 transition">Privacy Policy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-slate-400 transition">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}

// ─── Verify OTP Page (standalone) ────────────────────────────
export function VerifyOTPPage() {
  const navigate = useNavigate();
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const email = new URLSearchParams(window.location.search).get("email") || "";

  const verify = async () => {
    if (otp.length !== 6) return;
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
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-white text-2xl font-bold">Check your email</h1>
          <p className="text-slate-400 text-sm mt-2">Enter the 6-digit code we sent you</p>
        </div>
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