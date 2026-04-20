import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  User, Star, Briefcase, ShieldCheck, Edit2,
  Save, X, Loader2, CheckCircle, MapPin,
  Phone, Mail, Trash2
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";
import { format } from "date-fns";

const profileSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().max(500, "Bio must be under 500 characters").optional(),
  skills: z.string().optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

function TransactionPINSection() {
  const { profile } = useAuthStore();
  const [step, setStep] = useState<"idle" | "set" | "change">("idle");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasPin = !!(profile as any)?.transaction_pin_hash;

  const hashPIN = async (p: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(p + "profix_txn_salt_2026");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const validatePIN = (p: string): string | null => {
    if (p.length !== 4) return "PIN must be 4 digits";
    if (/^(\d)\1{3}$/.test(p)) return "PIN cannot be all same digits";
    if (/^(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)$/.test(p))
      return "PIN cannot be sequential";
    return null;
  };

  const savePin = async () => {
    const err = validatePIN(pin);
    if (err) { setError(err); return; }
    if (pin !== confirmPin) { setError("PINs do not match"); return; }

    if (hasPin && step === "change") {
      const currentHash = await hashPIN(currentPin);
      if (currentHash !== (profile as any).transaction_pin_hash) {
        setError("Current PIN is incorrect");
        return;
      }
    }

    setLoading(true);
    try {
      const pinHash = await hashPIN(pin);
      const { error: dbErr } = await supabase
        .from("users")
        .update({ transaction_pin_hash: pinHash })
        .eq("id", profile!.id);
      if (dbErr) throw dbErr;
      toast.success(hasPin ? "Transaction PIN updated!" : "Transaction PIN set!");
      setStep("idle");
      setPin(""); setConfirmPin(""); setCurrentPin(""); setError("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold">Transaction PIN</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            {hasPin ? "4-digit PIN for approving payments" : "Set a PIN to secure your transactions"}
          </p>
        </div>
        {step === "idle" && (
          <button
            onClick={() => setStep(hasPin ? "change" : "set")}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-xl transition"
          >
            {hasPin ? "Change PIN" : "Set PIN"}
          </button>
        )}
      </div>

      {step !== "idle" && (
        <div className="space-y-4">
          {hasPin && step === "change" && (
            <div>
              <p className="text-slate-400 text-xs text-center mb-3">Enter current PIN</p>
              <div className="flex gap-2 justify-center">
                {Array.from({ length: 4 }).map((_, i) => (
                  <input
                    key={i}
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={1}
                    value={currentPin[i] || ""}
                    onChange={(e) => {
                      if (!/^\d*$/.test(e.target.value)) return;
                      const digits = currentPin.split("");
                      digits[i] = e.target.value.slice(-1);
                      setCurrentPin(digits.join(""));
                    }}
                    className="w-12 h-12 text-center text-lg font-bold rounded-xl border-2 bg-slate-800 text-white focus:outline-none border-slate-700 focus:border-indigo-500"
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-slate-400 text-xs text-center mb-3">
              {hasPin ? "Enter new PIN" : "Create 4-digit PIN"}
            </p>
            <div className="flex gap-2 justify-center">
              {Array.from({ length: 4 }).map((_, i) => (
                <input
                  key={i}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={1}
                  value={pin[i] || ""}
                  onChange={(e) => {
                    if (!/^\d*$/.test(e.target.value)) return;
                    const digits = pin.split("");
                    digits[i] = e.target.value.slice(-1);
                    setPin(digits.join(""));
                  }}
                  className={cn(
                    "w-12 h-12 text-center text-lg font-bold rounded-xl border-2 bg-slate-800 text-white focus:outline-none transition",
                    pin[i] ? "border-indigo-500" : "border-slate-700 focus:border-indigo-500"
                  )}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-xs text-center mb-3">Confirm PIN</p>
            <div className="flex gap-2 justify-center">
              {Array.from({ length: 4 }).map((_, i) => (
                <input
                  key={i}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={1}
                  value={confirmPin[i] || ""}
                  onChange={(e) => {
                    if (!/^\d*$/.test(e.target.value)) return;
                    const digits = confirmPin.split("");
                    digits[i] = e.target.value.slice(-1);
                    setConfirmPin(digits.join(""));
                    setError("");
                  }}
                  className={cn(
                    "w-12 h-12 text-center text-lg font-bold rounded-xl border-2 bg-slate-800 text-white focus:outline-none transition",
                    confirmPin[i] && pin[i] === confirmPin[i] ? "border-emerald-500" : "border-slate-700 focus:border-indigo-500"
                  )}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="w-full text-center text-slate-500 hover:text-slate-300 text-xs transition"
          >
            {showPin ? "Hide PIN" : "Show PIN"}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setStep("idle"); setPin(""); setConfirmPin(""); setCurrentPin(""); setError(""); }}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl transition text-sm"
            >
              Cancel
            </button>
            <button
              onClick={savePin}
              disabled={loading || pin.length !== 4 || confirmPin.length !== 4}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save PIN"}
            </button>
          </div>
        </div>
      )}

      {step === "idle" && hasPin && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <CheckCircle className="w-4 h-4" />
          Transaction PIN is set and active
        </div>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { profile, fetchProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["profile-stats", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [jobs, applications, contracts] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact" }).eq("owner_id", profile!.id),
        supabase.from("applications").select("id", { count: "exact" }).eq("worker_id", profile!.id),
        supabase.from("contracts").select("id, status").or(`owner_id.eq.${profile!.id},worker_id.eq.${profile!.id}`),
      ]);
      return {
        jobsPosted: jobs.count || 0,
        applications: applications.count || 0,
        completedContracts: (contracts.data || []).filter((c) => c.status === "completed").length,
        activeContracts: (contracts.data || []).filter((c) => c.status === "active").length,
      };
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name || "",
      phone: profile?.phone || "",
      location: profile?.location || "",
      bio: profile?.bio || "",
      skills: profile?.skills?.join(", ") || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const { error } = await supabase
        .from("users")
        .update({
          full_name: data.full_name.trim(),
          phone: data.phone?.trim() || null,
          location: data.location?.trim() || null,
          bio: data.bio?.trim() || null,
          skills: data.skills
            ? data.skills.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated!");
      setIsEditing(false);
      fetchProfile();
      queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const cancelEdit = () => {
    setIsEditing(false);
    reset({
      full_name: profile?.full_name || "",
      phone: profile?.phone || "",
      location: profile?.location || "",
      bio: profile?.bio || "",
      skills: profile?.skills?.join(", ") || "",
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">My Profile</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Manage your personal information and account settings
        </p>
      </div>

      <div className="space-y-5">
        {/* Profile card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                {profile?.full_name?.[0]?.toUpperCase() || "?"}
              </div>
              <div>
                <h2 className="text-white text-xl font-bold">{profile?.full_name}</h2>
                <p className="text-slate-400 text-sm capitalize">{profile?.role}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-amber-400 text-sm">
                    <Star className="w-4 h-4" />
                    {profile?.rating?.toFixed(1) || "0.0"}
                  </span>
                  <span className="text-slate-500 text-xs">
                    {profile?.total_jobs || 0} completed jobs
                  </span>
                </div>
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl transition text-sm"
              >
                <Edit2 className="w-4 h-4" /> Edit
              </button>
            )}
          </div>

          {/* KYC status */}
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm mb-5",
            profile?.kyc_level && profile.kyc_level >= 1
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          )}>
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            {profile?.kyc_level && profile.kyc_level >= 1 ? (
              <span>KYC Verified ✅</span>
            ) : (
              <span>
                KYC not verified —{" "}
                <Link to="/kyc" className="underline font-medium">
                  Verify now
                </Link>
              </span>
            )}
          </div>

          {/* Profile info / edit form */}
          {isEditing ? (
            <form
              onSubmit={handleSubmit((d) => updateMutation.mutate(d))}
              className="space-y-4"
            >
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Full name <span className="text-red-400">*</span>
                </label>
                <input
                  {...register("full_name")}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                {errors.full_name && (
                  <p className="text-red-400 text-xs mt-1">{errors.full_name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Phone number
                  </label>
                  <input
                    {...register("phone")}
                    placeholder="+234 800 000 0000"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Location
                  </label>
                  <input
                    {...register("location")}
                    placeholder="Lagos, Nigeria"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Bio
                  <span className="text-slate-500 font-normal ml-1">(max 500 chars)</span>
                </label>
                <textarea
                  {...register("bio")}
                  rows={4}
                  placeholder="Tell clients about yourself, your experience, and what makes you great at your work…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
                />
                {errors.bio && (
                  <p className="text-red-400 text-xs mt-1">{errors.bio.message}</p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Skills
                  <span className="text-slate-500 font-normal ml-1">(comma-separated)</span>
                </label>
                <input
                  {...register("skills")}
                  placeholder="Plumbing, Electrical, Tiling…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-6 rounded-xl transition text-sm flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <><Save className="w-4 h-4" /> Save Changes</>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-slate-300">{profile?.email}</span>
                {profile?.email_verified && (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                )}
              </div>
              {(profile as any)?.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-slate-300">{(profile as any).phone}</span>
                </div>
              )}
              {(profile as any)?.location && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-slate-300">{(profile as any).location}</span>
                </div>
              )}
              {(profile as any)?.bio && (
                <div className="pt-2">
                  <p className="text-slate-400 text-sm leading-relaxed">
                    {(profile as any).bio}
                  </p>
                </div>
              )}
              {profile?.skills && profile.skills.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {profile.skills.map((skill: string) => (
                    <span
                      key={skill}
                      className="bg-indigo-500/10 text-indigo-400 text-xs px-3 py-1 rounded-full"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
              {!(profile as any)?.bio && !(profile as any)?.phone && (
                <p className="text-slate-500 text-sm italic">
                  No additional info added yet. Click Edit to complete your profile.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Jobs Posted", value: stats?.jobsPosted || 0, icon: Briefcase, color: "text-indigo-400" },
            { label: "Applications", value: stats?.applications || 0, icon: User, color: "text-blue-400" },
            { label: "Active Contracts", value: stats?.activeContracts || 0, icon: CheckCircle, color: "text-amber-400" },
            { label: "Completed", value: stats?.completedContracts || 0, icon: Star, color: "text-emerald-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <Icon className={cn("w-5 h-5 mx-auto mb-2", color)} />
              <p className={cn("text-2xl font-bold", color)}>{value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Account info */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Account Information</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Member since</span>
              <span className="text-white">
                {profile?.created_at
                  ? format(new Date(profile.created_at), "MMMM d, yyyy")
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Account type</span>
              <span className="text-white capitalize">{profile?.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Email verified</span>
              <span className={profile?.email_verified ? "text-emerald-400" : "text-red-400"}>
                {profile?.email_verified ? "Yes ✓" : "No"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">KYC level</span>
              <span className={profile?.kyc_level && profile.kyc_level >= 1 ? "text-emerald-400" : "text-amber-400"}>
                Level {profile?.kyc_level || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-slate-900 border border-red-500/20 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-2">Danger Zone</h3>
          <p className="text-slate-400 text-sm mb-4">
            Permanently delete your account and all associated data.
          </p>
          <Link
            to="/delete-account"
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2.5 rounded-xl transition text-sm font-medium w-fit"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </Link>
        </div>
      </div>
    </div>
  );
}