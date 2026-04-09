import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import { Search, MapPin, DollarSign, Plus, Loader2, Clock } from "lucide-react";
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
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", search, category, page],
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

      if (search) query = query.ilike("title", `%${search}%`);
      if (category !== "All") query = query.eq("category", category);

      const { data, error, count } = await query;
      if (error) throw error;
      return { jobs: data || [], total: count || 0 };
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Browse Jobs</h1>
          <p className="text-slate-400 text-sm">{data?.total || 0} open opportunities</p>
        </div>
        {profile?.role === "owner" && (
          <button
            onClick={() => navigate("/jobs/post")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl transition font-medium"
          >
            <Plus className="w-4 h-4" /> Post a Job
          </button>
        )}
      </div>

      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search jobs…"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {JOB_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setPage(0); }}
              className={cn(
                "flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition",
                category === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (data?.jobs || []).length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 text-lg">No jobs found</p>
          <p className="text-slate-500 text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data!.jobs.map((job: any) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/50 transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full">
                  {job.category}
                </span>
                <span className="text-slate-500 text-xs flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-2 group-hover:text-indigo-300 transition line-clamp-2">
                {job.title}
              </h3>
              <p className="text-slate-400 text-sm mb-4 line-clamp-2">{job.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {job.location && (
                    <span className="flex items-center gap-1 text-slate-500 text-xs">
                      <MapPin className="w-3 h-3" /> {job.location}
                    </span>
                  )}
                  {(job.budget_min || job.budget_max) && (
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                      <DollarSign className="w-3 h-3" />
                      {job.budget_min && job.budget_max
                        ? `₦${job.budget_min.toLocaleString()} – ₦${job.budget_max.toLocaleString()}`
                        : `₦${(job.budget_min || job.budget_max)!.toLocaleString()}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold">
                    {job.owner?.full_name?.[0]}
                  </div>
                  <span className="text-slate-500 text-xs">{job.owner?.full_name}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition text-sm"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-slate-400 text-sm">
            Page {page + 1} of {Math.ceil(data.total / PAGE_SIZE)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * PAGE_SIZE >= data.total}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition text-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Post Job Page ────────────────────────────────────────────
const postSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20),
  category: z.string().min(1, "Select a category"),
  budget_min: z.coerce.number().positive().optional(),
  budget_max: z.coerce.number().positive().optional(),
  location: z.string().optional(),
  is_remote: z.boolean().default(false),
  skills_needed: z.string().optional(),
});
type PostForm = z.infer<typeof postSchema>;

export function PostJobPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  const { register, handleSubmit, formState: { errors } } = useForm<PostForm>({
    resolver: zodResolver(postSchema),
    defaultValues: { is_remote: false },
  });

  const postMutation = useMutation({
    mutationFn: async (data: PostForm) => {
      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          owner_id: profile!.id,
          title: data.title,
          description: data.description,
          category: data.category,
          budget_min: data.budget_min || null,
          budget_max: data.budget_max || null,
          location: data.location || null,
          is_remote: data.is_remote,
          skills_needed: data.skills_needed
            ? data.skills_needed.split(",").map((s) => s.trim())
            : [],
        })
        .select()
        .single();
      if (error) throw error;
      return job;
    },
    onSuccess: (job) => {
      toast.success("Job posted successfully!");
      navigate(`/jobs/${job.id}`);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Post a Job</h1>
        <p className="text-slate-400 text-sm mt-1">
          Find the right professional for your project
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <form
          onSubmit={handleSubmit((d) => postMutation.mutate(d))}
          className="space-y-5"
        >
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Job title *
            </label>
            <input
              {...register("title")}
              placeholder="e.g. Fix leaking kitchen pipe"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {errors.title && (
              <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Description *
            </label>
            <textarea
              {...register("description")}
              rows={5}
              placeholder="Describe the job in detail — scope, materials needed, expected outcome…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            {errors.description && (
              <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Category *
              </label>
              <select
                {...register("category")}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select category</option>
                {JOB_CATEGORIES.slice(1).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.category && (
                <p className="text-red-400 text-xs mt-1">{errors.category.message}</p>
              )}
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Location
              </label>
              <input
                {...register("location")}
                placeholder="e.g. Lagos, Nigeria"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Min budget (₦)
              </label>
              <input
                {...register("budget_min")}
                type="number"
                placeholder="5000"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Max budget (₦)
              </label>
              <input
                {...register("budget_max")}
                type="number"
                placeholder="20000"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Skills needed
            </label>
            <input
              {...register("skills_needed")}
              placeholder="Plumbing, Tiling, Painting (comma-separated)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register("is_remote")}
              className="w-4 h-4 rounded text-indigo-500"
            />
            <span className="text-slate-300 text-sm">
              This job can be done remotely
            </span>
          </label>

          <button
            type="submit"
            disabled={postMutation.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {postMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Post Job"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}