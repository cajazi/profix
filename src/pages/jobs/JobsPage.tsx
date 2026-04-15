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
  Briefcase, Filter
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const JOB_CATEGORIES = [
  "All", "Plumbing", "Electrical", "Carpentry", "Painting",
  "Cleaning", "Landscaping", "Roofing", "HVAC", "Security", "Tech",
];

// ─── Jobs List Page ───────────────────────────────────────────
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

      if (search.trim()) {
        query = query.ilike("title", `%${search.trim()}%`);
      }
      if (category !== "All") {
        query = query.eq("category", category);
      }
      if (isRemote) {
        query = query.eq("is_remote", true);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { jobs: data || [], total: count || 0 };
    },
    placeholderData: (prev: any) => prev,
  });

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
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
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition font-medium text-sm w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            Post a Job
          </button>
        )}
      </div>

      {/* Search + Filters */}
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

        {/* Category filters */}
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

        {/* Remote filter */}
        <div className="flex items-center gap-2">
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
      </div>

      {/* Job grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (data?.jobs || []).length === 0 ? (
        <div className="text-center py-16">
          <Briefcase className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 text-lg font-medium">No jobs found</p>
          <p className="text-slate-500 text-sm mt-1">
            Try adjusting your search or filters
          </p>
          {profile?.role === "owner" && (
            <button
              onClick={() => navigate("/jobs/post")}
              className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-5 py-2.5 rounded-xl transition"
            >
              Post the first job
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data!.jobs.map((job: any) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/50 active:scale-[0.99] transition-all group flex flex-col"
            >
              {/* Category + time */}
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
                    {formatDistanceToNow(new Date(job.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-white font-semibold text-base mb-2 group-hover:text-indigo-300 transition line-clamp-2 flex-1">
                {job.title}
              </h3>

              {/* Description */}
              <p className="text-slate-400 text-sm mb-4 line-clamp-2 leading-relaxed">
                {job.description}
              </p>

              {/* Footer */}
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

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-slate-400 text-sm">
            {page + 1} / {totalPages}
          </span>
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

// ─── Post Job Schema (no fixed budgets) ───────────────────────
const postSchema = z.object({
  title: z.string()
    .min(5, "Title must be at least 5 characters")
    .max(200, "Title too long"),
  description: z.string()
    .min(20, "Description must be at least 20 characters"),
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

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PostForm>({
    resolver: zodResolver(postSchema),
    defaultValues: { is_remote: false },
  });

  const descriptionValue = watch("description") || "";

  const postMutation = useMutation({
    mutationFn: async (data: PostForm) => {
      // Security: only owners can post jobs
      if (profile?.role !== "owner") {
        throw new Error("Only job owners can post jobs");
      }

      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          owner_id: profile.id,
          title: data.title.trim(),
          description: data.description.trim(),
          category: data.category,
          budget_min: null, // deprecated — price negotiated via chat
          budget_max: null, // deprecated — price negotiated via chat
          location: data.location?.trim() || null,
          is_remote: data.is_remote,
          skills_needed: data.skills_needed
            ? data.skills_needed
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        })
        .select()
        .single();

      if (error) throw error;
      return job;
    },
    onSuccess: (job) => {
      toast.success("Job posted successfully! 🎉");
      navigate(`/jobs/${job.id}`);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
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
        {/* KYC warning */}
        {(profile?.kyc_level || 0) < 1 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-5 flex items-start gap-2">
            <span className="text-amber-400 text-sm flex-shrink-0">⚠️</span>
            <p className="text-amber-300 text-sm">
              Complete{" "}
              <Link to="/kyc" className="underline font-medium">
                KYC verification
              </Link>{" "}
              to post jobs and receive payments.
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit((d) => postMutation.mutate(d))}
          className="space-y-5"
        >
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
            {errors.title && (
              <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>
            )}
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
              {errors.description ? (
                <p className="text-red-400 text-xs">{errors.description.message}</p>
              ) : (
                <span />
              )}
              <span className="text-slate-500 text-xs">
                {descriptionValue.length} chars
              </span>
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
              {errors.category && (
                <p className="text-red-400 text-xs mt-1">
                  {errors.category.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Location
              </label>
              <input
                {...register("location")}
                placeholder="e.g. Lagos, Nigeria"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
              />
            </div>
          </div>

          {/* Price negotiation notice */}
          <div className="flex items-start gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageCircle className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-indigo-300 text-sm font-medium">
                Price negotiated via chat
              </p>
              <p className="text-indigo-400/70 text-xs mt-0.5 leading-relaxed">
                Workers will propose their price. You negotiate and agree
                before a contract is created. No upfront commitment.
              </p>
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Skills needed
            </label>
            <input
              {...register("skills_needed")}
              placeholder="e.g. Plumbing, Tiling, Painting (comma-separated)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
            />
          </div>

          {/* Remote toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                {...register("is_remote")}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-slate-700 peer-checked:bg-indigo-600 rounded-full transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </div>
            <div>
              <p className="text-slate-300 text-sm font-medium">Remote job</p>
              <p className="text-slate-500 text-xs">
                This job can be done from anywhere
              </p>
            </div>
          </label>

          {/* Submit */}
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
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm"
            >
              {postMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Posting…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Post Job
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}