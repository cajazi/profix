import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  ShieldCheck, CheckCircle, Loader2,
  Upload, X, AlertTriangle, Image as ImageIcon
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const kycSchema = z.object({
  full_name: z.string().min(2, "Full name required"),
  date_of_birth: z.string().min(1, "Date of birth required"),
  id_type: z.enum(["nin", "bvn", "passport", "drivers_license"]),
  id_number: z.string().min(5, "ID number required"),
});
type KYCForm = z.infer<typeof kycSchema>;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function KYCPage() {
  const { profile, fetchProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const [selfie, setSelfie] = useState<File | null>(null);
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const { data: kyc, isLoading } = useQuery({
    queryKey: ["kyc", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("kyc_verifications")
        .select("*")
        .eq("user_id", profile!.id)
        .maybeSingle();
      return data;
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<KYCForm>({
    resolver: zodResolver(kycSchema),
    defaultValues: {
      full_name: profile?.full_name || "",
      id_type: "nin",
    },
  });

  const idType = watch("id_type");

  const validateFile = (file: File, field: string): boolean => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileErrors((p) => ({ ...p, [field]: "Only JPG, PNG, WEBP allowed" }));
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileErrors((p) => ({ ...p, [field]: "File must be under 5MB" }));
      return false;
    }
    setFileErrors((p) => ({ ...p, [field]: "" }));
    return true;
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: File | null) => void,
    field: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (validateFile(file, field)) setter(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const { error } = await supabase.storage
      .from("kyc-documents")
      .upload(path, file, { upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data } = await supabase.storage
      .from("kyc-documents")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (!data?.signedUrl) throw new Error("Could not get file URL");
    return data.signedUrl;
  };

  const submitMutation = useMutation({
    mutationFn: async (data: KYCForm) => {
      setSubmitError("");

      // Validate required files
      if (!selfie) throw new Error("Selfie photo is required. Please upload a photo of yourself holding your ID.");
      if (!idFront) throw new Error("ID front photo is required. Please upload the front of your ID.");

      setUploadProgress(10);
      const uid = profile!.id;
      const ts = Date.now();

      // Upload selfie
      const selfieExt = selfie.name.split(".").pop();
      const selfieUrl = await uploadFile(selfie, `${uid}/${ts}_selfie.${selfieExt}`);
      setUploadProgress(35);

      // Upload ID front
      const frontExt = idFront.name.split(".").pop();
      const idFrontUrl = await uploadFile(idFront, `${uid}/${ts}_id_front.${frontExt}`);
      setUploadProgress(60);

      // Upload ID back (optional)
      let idBackUrl = "";
      if (idBack) {
        const backExt = idBack.name.split(".").pop();
        idBackUrl = await uploadFile(idBack, `${uid}/${ts}_id_back.${backExt}`);
      }
      setUploadProgress(80);

      // Submit to edge function
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Session expired. Please log in again.");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-kyc`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...data,
            selfie_url: selfieUrl,
            id_front_url: idFrontUrl,
            id_back_url: idBackUrl || null,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submission failed. Please try again.");
      setUploadProgress(100);
      return json;
    },
    onSuccess: () => {
      toast.success("KYC submitted! Review takes up to 24 hours.");
      setSubmitError("");
      fetchProfile();
      queryClient.invalidateQueries({ queryKey: ["kyc"] });
    },
    onError: (err) => {
      setUploadProgress(0);
      const msg = (err as Error).message;
      setSubmitError(msg);
      toast.error(msg);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">KYC Verification</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Verify your identity to unlock all ProFix features including payments and withdrawals
        </p>
      </div>

      {/* Status banner */}
      {kyc && (
        <div className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 mb-6 border",
          kyc.status === "verified" ? "bg-emerald-500/10 border-emerald-500/30" :
          kyc.status === "pending" ? "bg-amber-500/10 border-amber-500/30" :
          "bg-red-500/10 border-red-500/30"
        )}>
          {kyc.status === "verified" && <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
          {kyc.status === "pending" && <Loader2 className="w-5 h-5 text-amber-400 animate-spin flex-shrink-0" />}
          {kyc.status === "rejected" && <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />}
          <div>
            <p className={cn("font-semibold text-sm",
              kyc.status === "verified" ? "text-emerald-400" :
              kyc.status === "pending" ? "text-amber-400" : "text-red-400"
            )}>
              {kyc.status === "verified" && "KYC Verified ✅"}
              {kyc.status === "pending" && "Under Review — check back in 24 hours"}
              {kyc.status === "rejected" && "KYC Rejected — please resubmit below"}
            </p>
            {kyc.rejection_reason && (
              <p className="text-red-300 text-xs mt-0.5">{kyc.rejection_reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Benefits */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          KYC unlocks:
        </h3>
        <div className="space-y-2">
          {[
            "Post and accept jobs",
            "Receive payments to your wallet",
            "Withdraw earnings to your bank",
            "Higher transaction limits",
          ].map((b) => (
            <div key={b} className="flex items-center gap-2 text-sm text-slate-400">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              {b}
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      {(!kyc || kyc.status === "rejected") && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
          <h2 className="text-white font-semibold mb-5">
            Submit Verification Documents
          </h2>

          <form
            onSubmit={handleSubmit((d) => submitMutation.mutate(d))}
            className="space-y-4"
          >
            {/* Full name */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Full legal name <span className="text-red-400">*</span>
              </label>
              <input
                {...register("full_name")}
                placeholder="As it appears on your ID"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              {errors.full_name && (
                <p className="text-red-400 text-xs mt-1">{errors.full_name.message}</p>
              )}
            </div>

            {/* Date of birth */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Date of birth <span className="text-red-400">*</span>
              </label>
              <input
                {...register("date_of_birth")}
                type="date"
                max={new Date().toISOString().split("T")[0]}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              {errors.date_of_birth && (
                <p className="text-red-400 text-xs mt-1">{errors.date_of_birth.message}</p>
              )}
            </div>

            {/* ID type + number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  ID type <span className="text-red-400">*</span>
                </label>
                <select
                  {...register("id_type")}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="nin">National ID (NIN)</option>
                  <option value="bvn">BVN</option>
                  <option value="passport">International Passport</option>
                  <option value="drivers_license">Driver's License</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  ID number <span className="text-red-400">*</span>
                </label>
                <input
                  {...register("id_number")}
                  placeholder={
                    idType === "nin" || idType === "bvn" ? "11 digits" : "Enter number"
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                {errors.id_number && (
                  <p className="text-red-400 text-xs mt-1">{errors.id_number.message}</p>
                )}
              </div>
            </div>

            {/* Selfie upload */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Selfie photo <span className="text-red-400">*</span>
                <span className="text-slate-500 font-normal ml-1">(hold your ID)</span>
              </label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition",
                  selfie
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-slate-700 hover:border-slate-600"
                )}
                onClick={() => document.getElementById("selfie-upload")?.click()}
              >
                <input
                  id="selfie-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => handleFileChange(e, setSelfie, "selfie")}
                />
                {selfie ? (
                  <div className="flex items-center justify-between text-left">
                    <div className="flex items-center gap-3">
                      <img
                        src={URL.createObjectURL(selfie)}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        alt="selfie preview"
                      />
                      <div>
                        <p className="text-emerald-400 text-sm font-medium">Photo uploaded ✓</p>
                        <p className="text-slate-500 text-xs truncate max-w-40">{selfie.name}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelfie(null); }}
                      className="w-7 h-7 bg-red-500/20 hover:bg-red-500/30 rounded-full flex items-center justify-center transition flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">Click to upload selfie</p>
                    <p className="text-slate-500 text-xs mt-1">JPG, PNG, WEBP — max 5MB</p>
                  </>
                )}
              </div>
              {fileErrors.selfie && (
                <p className="text-red-400 text-xs mt-1 text-center">{fileErrors.selfie}</p>
              )}
            </div>

            {/* ID front */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                ID front <span className="text-red-400">*</span>
              </label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition",
                  idFront
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-slate-700 hover:border-slate-600"
                )}
                onClick={() => document.getElementById("id-front-upload")?.click()}
              >
                <input
                  id="id-front-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => handleFileChange(e, setIdFront, "idFront")}
                />
                {idFront ? (
                  <div className="flex items-center justify-between text-left">
                    <div className="flex items-center gap-3">
                      <img
                        src={URL.createObjectURL(idFront)}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        alt="id front preview"
                      />
                      <div>
                        <p className="text-emerald-400 text-sm font-medium">ID front uploaded ✓</p>
                        <p className="text-slate-500 text-xs truncate max-w-40">{idFront.name}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setIdFront(null); }}
                      className="w-7 h-7 bg-red-500/20 hover:bg-red-500/30 rounded-full flex items-center justify-center transition flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">Click to upload ID front</p>
                    <p className="text-slate-500 text-xs mt-1">JPG, PNG, WEBP — max 5MB</p>
                  </>
                )}
              </div>
              {fileErrors.idFront && (
                <p className="text-red-400 text-xs mt-1 text-center">{fileErrors.idFront}</p>
              )}
            </div>

            {/* ID back (optional) */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                ID back
                <span className="text-slate-500 font-normal ml-1">(optional)</span>
              </label>
              <div
                className={cn(
                  "border border-dashed rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition",
                  idBack
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-slate-700 hover:border-slate-600"
                )}
                onClick={() => document.getElementById("id-back-upload")?.click()}
              >
                <input
                  id="id-back-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => handleFileChange(e, setIdBack, "idBack")}
                />
                <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center flex-shrink-0">
                  <Upload className="w-4 h-4 text-slate-400" />
                </div>
                <p className={cn("text-sm flex-1 truncate",
                  idBack ? "text-emerald-400" : "text-slate-400"
                )}>
                  {idBack ? `${idBack.name} ✓` : "Upload ID back (optional)"}
                </p>
                {idBack && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIdBack(null); }}
                    className="w-7 h-7 bg-red-500/20 hover:bg-red-500/30 rounded-full flex items-center justify-center transition flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
              {fileErrors.idBack && (
                <p className="text-red-400 text-xs mt-1 text-center">{fileErrors.idBack}</p>
              )}
            </div>

            {/* ── Error message — centered and readable ── */}
            {submitError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-4 text-center">
                <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                <p className="text-red-400 font-semibold text-sm">Submission Failed</p>
                <p className="text-red-300 text-xs mt-1 leading-relaxed">{submitError}</p>
              </div>
            )}

            {/* Upload progress */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Uploading documents…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Privacy note */}
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-indigo-300 text-xs text-center leading-relaxed">
              🔒 Your documents are encrypted and stored securely. Only our verification
              team can access them. We never share your data with third parties.
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              {submitMutation.isPending ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
              ) : (
                <><ShieldCheck className="w-5 h-5" /> Submit for Verification</>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}