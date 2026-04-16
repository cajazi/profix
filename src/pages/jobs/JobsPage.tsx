import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  Search, MapPin, Plus, Loader2, Clock,
  MessageCircle, ChevronLeft, ChevronRight,
  Briefcase, Filter, Image as ImageIcon,
  Video as VideoIcon, X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const JOB_CATEGORIES = [
  "All", "Plumbing", "Electrical", "Carpentry", "Painting",
  "Cleaning", "Landscaping", "Roofing", "HVAC", "Security", "Tech",
];

export function JobsPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(0);
  const [isRemote, setIsRemote] = useState(false);
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery<{ jobs: any[]; total: number }>({
    queryKey: ["jobs", search, category, page, isRemote],
    queryFn: async () => {
      let query = supabase
        .from("jobs")
        .select(
          "*, owner:users!jobs_owner_id_fkey(id, full_name, avatar_url, rating)",
          { count: "exact" }
        )
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) query = query.ilike("title", `%${search.trim()}%`);
      if (category !== "All") query = query.eq("category", category);
      if (isRemote) query = query.eq("is_remote", true);

      const { data, error, count } = await query;
      if (error) throw error;
      return { jobs: data || [], total: count || 0 };
    },
  });

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Browse Jobs</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {data?.total || 0} open opportunities
          </p>
        </div>
        {profile?.role === "owner" && (
          <button
            onClick={() => navigate("/jobs/post")}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl transition font-medium text-sm w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" /> Post a Job
          </button>
        )}
      </div>

      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search jobs by title…"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
          {JOB_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setPage(0); }}
              className={cn(
                "flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition",
                category === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <button
          onClick={() => { setIsRemote(!isRemote); setPage(0); }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition border",
            isRemote
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
          )}
        >
          <Filter className="w-3 h-3" />
          Remote only
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (data?.jobs || []).length === 0 ? (
        <div className="text-center py-16">
          <Briefcase className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 text-lg font-medium">No jobs found</p>
          <p className="text-slate-500 text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data!.jobs.map((job: any) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/50 transition-all group flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                  {job.category}
                </span>
                <div className="flex items-center gap-1.5">
                  {job.is_remote && (
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">
                      Remote
                    </span>
                  )}
                  <span className="text-slate-500 text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>

              {/* Job images */}
              {job.metadata?.image_urls?.length > 0 && (
                <div className="mb-3 rounded-xl overflow-hidden aspect-video bg-slate-800">
                  <img
                    src={job.metadata.image_urls[0]}
                    alt={job.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}

              <h3 className="text-white font-semibold text-base mb-2 group-hover:text-indigo-300 transition line-clamp-2 flex-1">
                {job.title}
              </h3>

              <p className="text-slate-400 text-sm mb-4 line-clamp-2 leading-relaxed">
                {job.description}
              </p>

              <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  {job.location && (
                    <span className="flex items-center gap-1 text-slate-500 text-xs">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate max-w-20">{job.location}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-indigo-400 text-xs font-medium">
                    <MessageCircle className="w-3 h-3" />
                    Price via chat
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold">
                    {job.owner?.full_name?.[0]?.toUpperCase()}
                  </div>
                  <span className="text-slate-500 text-xs truncate max-w-16">
                    {job.owner?.full_name?.split(" ")[0]}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-slate-400 text-sm">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
            className="flex items-center gap-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition text-sm"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Post Job Schema ──────────────────────────────────────────
const postSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().min(20, "Description must be at least 20 characters"),
  category: z.string().min(1, "Please select a category"),
  location: z.string().optional(),
  is_remote: z.boolean().default(false),
  skills_needed: z.string().optional(),
});
type PostForm = z.infer<typeof postSchema>;

// ─── Post Job Page ────────────────────────────────────────────
export function PostJobPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [imageError, setImageError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImageError("");
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setImageError("Only JPG, PNG, and WEBP images allowed");
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setImageError("Each image must be under 5MB");
        return;
      }
    }
    const combined = [...images, ...files].slice(0, 4);
    setImages(combined);
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setVideoError("");
    if (!file) return;
    const allowed = ["video/mp4", "video/quicktime", "video/webm"];
    if (!allowed.includes(file.type)) {
      setVideoError("Only MP4, MOV, and WEBM videos allowed");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setVideoError("Video must be under 50MB");
      return;
    }
    setVideo(file);
  };

  const { register, handleSubmit, watch, formState: { errors } } = useForm<PostForm>({
    resolver: zodResolver(postSchema),
    defaultValues: { is_remote: false },
  });

  const descriptionValue = watch("description") || "";

  const postMutation = useMutation({
    mutationFn: async (data: PostForm) => {
      if (profile?.role !== "owner") throw new Error("Only owners can post jobs");
      if (images.length < 2) throw new Error("Please upload at least 2 photos");

      setUploadProgress(10);
      const imageUrls: string[] = [];

      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const ext = file.name.split(".").pop();
        const path = `${profile.id}/${Date.now()}_${i}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("job-media")
          .upload(path, file, { upsert: false });
        if (uploadErr) throw new Error(`Image upload failed: ${uploadErr.message}`);
        const { data: urlData } = supabase.storage
          .from("job-media")
          .getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
        setUploadProgress(10 + Math.round(((i + 1) / images.length) * 60));
      }

      let videoUrl: string | null = null;
      if (video) {
        const ext = video.name.split(".").pop();
        const path = `${profile.id}/${Date.now()}_video.${ext}`;
        const { error: videoErr } = await supabase.storage
          .from("job-media")
          .upload(path, video, { upsert: false });
        if (videoErr) throw new Error(`Video upload failed: ${videoErr.message}`);
        const { data: urlData } = supabase.storage
          .from("job-media")
          .getPublicUrl(path);
        videoUrl = urlData.publicUrl;
      }

      setUploadProgress(80);

      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          owner_id: profile.id,
          title: data.title.trim(),
          description: data.description.trim(),
          category: data.category,
          budget_min: null,
          budget_max: null,
          location: data.location?.trim() || null,
          is_remote: data.is_remote,
          metadata: { image_urls: imageUrls, video_url: videoUrl },
          skills_needed: data.skills_needed
            ? data.skills_needed.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        })
        .select()
        .single();

      if (error) throw error;
      setUploadProgress(100);
      return job;
    },
    onSuccess: (job) => {
      toast.success("Job posted successfully! 🎉");
      navigate(`/jobs/${job.id}`);
    },
    onError: (err) => {
      setUploadProgress(0);
      toast.error((err as Error).message);
    },
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <button
          onClick={() => navigate("/jobs")}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition text-sm mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Jobs
        </button>
        <h1 className="text-white text-2xl font-bold">Post a Job</h1>
        <p className="text-slate-400 text-sm mt-1">
          Find the right professional for your project
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
        {(profile?.kyc_level || 0) < 1 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-5 flex items-start gap-2">
            <span className="text-amber-400 flex-shrink-0">⚠️</span>
            <p className="text-amber-300 text-sm">
              Complete{" "}
              <Link to="/kyc" className="underline font-medium">KYC verification</Link>
              {" "}to post jobs and receive payments.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit((d) => postMutation.mutate(d))} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Job title <span className="text-red-400">*</span>
            </label>
            <input
              {...register("title")}
              placeholder="e.g. Fix leaking kitchen pipe"
              maxLength={200}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
            />
            {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              {...register("description")}
              rows={5}
              placeholder="Describe the job in detail — scope, materials needed, expected outcome, timeline…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none text-sm"
            />
            <div className="flex items-center justify-between mt-1">
              {errors.description
                ? <p className="text-red-400 text-xs">{errors.description.message}</p>
                : <span />
              }
              <span className="text-slate-500 text-xs">{descriptionValue.length} chars</span>
            </div>
          </div>

          {/* Category + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                {...register("category")}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
              >
                <option value="">Select category</option>
                {JOB_CATEGORIES.slice(1).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.category && <p className="text-red-400 text-xs mt-1">{errors.category.message}</p>}
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Location</label>
              <input
                {...register("location")}
                placeholder="e.g. Lagos, Nigeria"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
              />
            </div>
          </div>

          {/* Price notice */}
          <div className="flex items-start gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageCircle className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-indigo-300 text-sm font-medium">Price negotiated via chat</p>
              <p className="text-indigo-400/70 text-xs mt-0.5 leading-relaxed">
                Workers will propose their price. You negotiate and agree before a contract is created.
              </p>
            </div>
          </div>

          {/* Images */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Photos <span className="text-red-400">*</span>
              <span className="text-slate-500 font-normal ml-1">(2–4 required)</span>
            </label>
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer",
                images.length > 0
                  ? "border-indigo-500/50 bg-indigo-500/5"
                  : "border-slate-700 hover:border-slate-600"
              )}
              onClick={() => document.getElementById("image-upload")?.click()}
            >
              <input
                id="image-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={handleImageChange}
              />
              {images.length === 0 ? (
                <>
                  <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-2">
                    <ImageIcon className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-slate-400 text-sm">Click to upload photos</p>
                  <p className="text-slate-500 text-xs mt-1">JPG, PNG, WEBP — max 5MB each</p>
                </>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={URL.createObjectURL(img)}
                        className="w-full aspect-square object-cover rounded-lg"
                        alt={`upload ${i + 1}`}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImages(images.filter((_, idx) => idx !== i));
                        }}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {images.length < 4 && (
                    <div className="aspect-square border border-dashed border-slate-600 rounded-lg flex items-center justify-center">
                      <Plus className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                </div>
              )}
            </div>
            {imageError && <p className="text-red-400 text-xs mt-1">{imageError}</p>}
          </div>

          {/* Video */}
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">
              Video (optional — max 50MB)
            </label>
            <div
              className={cn(
                "border border-dashed rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition",
                video
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-slate-700 hover:border-slate-600"
              )}
              onClick={() => document.getElementById("video-upload")?.click()}
            >
              <input
                id="video-upload"
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="sr-only"
                onChange={handleVideoChange}
              />
              <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center flex-shrink-0">
                <VideoIcon className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                {video
                  ? <p className="text-emerald-400 text-sm truncate">{video.name}</p>
                  : <p className="text-slate-400 text-sm">Add a video walkthrough</p>
                }
              </div>
              {video && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setVideo(null); }}
                  className="text-red-400 hover:text-red-300 transition flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {videoError && <p className="text-red-400 text-xs mt-1">{videoError}</p>}
          </div>

          {/* Skills */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">Skills needed</label>
            <input
              {...register("skills_needed")}
              placeholder="e.g. Plumbing, Tiling, Painting (comma-separated)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
            />
          </div>

          {/* Remote toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" {...register("is_remote")} className="sr-only peer" />
              <div className="w-10 h-6 bg-slate-700 peer-checked:bg-indigo-600 rounded-full transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </div>
            <div>
              <p className="text-slate-300 text-sm font-medium">Remote job</p>
              <p className="text-slate-500 text-xs">This job can be done from anywhere</p>
            </div>
          </label>

          {/* Upload progress */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Uploading media…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => navigate("/jobs")}
              className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-6 rounded-xl transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={postMutation.isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm"
            >
              {postMutation.isPending ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Posting…</>
              ) : (
                <><Plus className="w-4 h-4" /> Post Job</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}