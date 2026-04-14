import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import toast from "react-hot-toast";
import { Mail, Phone, ArrowRight, Loader2 } from "lucide-react";

// ─── Login Page ───────────────────────────────────────────────
const loginSchema = z.object({
  identifier: z.string().min(3, "Enter a valid email or phone number"),
});
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [method, setMethod] = useState<"email" | "phone">("email");

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      let result;
      if (method === "email") {
        result = await supabase.auth.signInWithOtp({
          email: data.identifier,
          options: { shouldCreateUser: false },
        });
      } else {
        const phone = data.identifier.startsWith("+")
          ? data.identifier
          : `+234${data.identifier.replace(/^0/, "")}`;
        result = await supabase.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: false },
        });
      }

      if (result.error) {
        toast.error(result.error.message);
        return;
      }

      toast.success(`OTP sent to your ${method}!`);
      navigate("/verify-otp", {
        state: { identifier: data.identifier, method, flow: "login" },
      });
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-lg">P</span>
            </div>
            <span className="text-white font-bold text-2xl tracking-tight">ProFix</span>
          </div>
          <h1 className="text-white text-3xl font-bold mb-2">Welcome back</h1>
          <p className="text-slate-400">Sign in with a one-time passcode</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-8">
          <div className="flex bg-slate-800 rounded-xl p-1 mb-6">
            <button
              onClick={() => setMethod("email")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                method === "email"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Mail className="w-4 h-4" /> Email OTP
            </button>
            <button
              onClick={() => setMethod("phone")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                method === "phone"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Phone className="w-4 h-4" /> Phone OTP
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                {method === "email" ? "Email address" : "Phone number"}
              </label>
              <input
                {...register("identifier")}
                type={method === "email" ? "email" : "tel"}
                placeholder={
                  method === "email" ? "you@example.com" : "+234 800 000 0000"
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              {errors.identifier && (
                <p className="text-red-400 text-xs mt-1">
                  {errors.identifier.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>Send OTP <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          <p className="text-center text-slate-400 text-sm mt-6">
            Don't have an account?{" "}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Register Page ────────────────────────────────────────────
const registerSchema = z.object({
  full_name: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  role: z.enum(["owner", "worker"]),
});
type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: data.email,
        options: {
          data: { full_name: data.full_name, role: data.role },
          shouldCreateUser: true,
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("OTP sent! Check your email.");
      navigate("/verify-otp", {
        state: {
          identifier: data.email,
          method: "email",
          flow: "register",
        },
      });
    } catch {
      toast.error("Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-lg">P</span>
            </div>
            <span className="text-white font-bold text-2xl tracking-tight">ProFix</span>
          </div>
          <h1 className="text-white text-3xl font-bold mb-2">Create account</h1>
          <p className="text-slate-400">Join thousands of professionals</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Full name
              </label>
              <input
                {...register("full_name")}
                placeholder="John Adeyemi"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              {errors.full_name && (
                <p className="text-red-400 text-xs mt-1">{errors.full_name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Email address
              </label>
              <input
                {...register("email")}
                type="email"
                placeholder="you@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-3">
                I want to…
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(["owner", "worker"] as const).map((r) => (
                  <label
                    key={r}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-700 cursor-pointer hover:border-indigo-500 transition has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-500/10"
                  >
                    <input
                      type="radio"
                      {...register("role")}
                      value={r}
                      className="sr-only"
                    />
                    <span className="text-2xl">
                      {r === "owner" ? "🏠" : "🔧"}
                    </span>
                    <span className="text-white font-medium text-sm capitalize">
                      {r === "owner" ? "Hire workers" : "Find work"}
                    </span>
                    <span className="text-slate-400 text-xs text-center">
                      {r === "owner"
                        ? "Post jobs & manage projects"
                        : "Apply & earn money"}
                    </span>
                  </label>
                ))}
              </div>
              {errors.role && (
                <p className="text-red-400 text-xs mt-1">{errors.role.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>Create account <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-slate-400 text-sm mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Verify OTP Page ──────────────────────────────────────────
export function VerifyOTPPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { identifier, method, flow } = location.state || {};
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!identifier) navigate("/login");
  }, [identifier, navigate]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  const verify = async () => {
    if (otp.length < 6) {
      toast.error("Enter the 6-digit OTP");
      return;
    }
    setIsLoading(true);
    try {
      let result;
      if (method === "email") {
        result = await supabase.auth.verifyOtp({
        email: identifier,
        token: otp,
        type: "magiclink",
      });
      } else {
        result = await supabase.auth.verifyOtp({
          phone: identifier,
          token: otp,
          type: "sms",
        });
      }

      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Verified! Welcome to ProFix 🎉");
      navigate("/dashboard");
    } catch {
      toast.error("Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const resend = async () => {
    if (resendCooldown > 0) return;
    if (method === "email") {
      await supabase.auth.resend({
        type: flow === "register" ? "signup" : "magiclink",
        email: identifier,
      });
    } else {
      await supabase.auth.resend({ type: "sms", phone: identifier });
    }
    toast.success("OTP resent!");
    setResendCooldown(60);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 mb-8">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-lg">P</span>
          </div>
          <span className="text-white font-bold text-2xl tracking-tight">ProFix</span>
        </div>

        <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-8">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">{method === "email" ? "📧" : "📱"}</span>
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">
            Check your {method}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            We sent a 6-digit code to{" "}
            <strong className="text-white">{identifier}</strong>
          </p>

          <input
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
            maxLength={6}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white text-center text-2xl tracking-[1rem] font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition mb-4"
          />

          <button
            onClick={verify}
            disabled={isLoading || otp.length < 6}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Verify OTP"
            )}
          </button>

          <button
            onClick={resend}
            disabled={resendCooldown > 0}
            className="mt-4 text-slate-400 hover:text-indigo-400 text-sm transition disabled:opacity-50"
          >
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : "Resend code"}
          </button>
        </div>
      </div>
    </div>
  );
}