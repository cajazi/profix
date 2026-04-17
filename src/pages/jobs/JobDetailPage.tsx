import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import {
  MapPin, Clock, ChevronLeft, MessageCircle,
  Loader2, CheckCircle, AlertTriangle, Play,
  Briefcase, Star, User
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const applySchema = z.object({
  cover_letter: z.string().min(20, "Cover letter must be at least 20 characters").max(2000),
  proposed_price: z.coerce.number().positive("Price must be positive"),
  proposed_days: z.coerce.number().int().positive("Days must be positive"),
});
type ApplyForm = z.infer<typeof applySchema>;

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(`
          *,
          owner:users!jobs_owner_id_fkey(
            id, full_name, avatar_url, rating, total_jobs, created_at
          )
        `)
        .eq("id", id!)
        .single();
      if (error) throw error;

      // Increment views
      await supabase
        .from("jobs")
        .update({ views: (data.views || 0) + 1 })
        .eq("id", id!);

      return data;
    },
    enabled: !!id,
  });

  const { data: application } = useQuery({
    queryKey: ["my-application", id, profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("applications")
        .select("*")
        .eq("job_id", id!)
        .eq("worker_id", profile!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!id && !!profile?.id && profile?.role === "worker",
  });

  const { data: applications } = useQuery({
    queryKey: ["job-applications", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("applications")
        .select("*, worker:users!applications_worker_id_fkey(id, full_name, avatar_url, rating, total_jobs)")
        .eq("job_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id && profile?.id === job?.owner_id,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
  });

  const applyMutation = useMutation({
    mutationFn: async (data: ApplyForm) => {
      if (profile?.role !== "worker") throw new Error("Only workers can apply");
      if ((profile?.kyc_level || 0) < 1) throw new Error("KYC verification required to apply for jobs");

      const { data: app, error } = await supabase
        .from("applications")
        .insert({
          job_id: id!,
          worker_id: profile!.id,
          cover_letter: data.cover_letter.trim(),
          proposed_price: data.proposed_price,
          proposed_days: data.proposed_days,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return app;
    },
    onSuccess: () => {
      toast.success("Application submitted successfully!");
      setShowApplyForm(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ["my-application", id] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const acceptApplicationMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await supabase
        .from("applications")
        .update({ status: "accepted" })
        .eq("id", applicationId);
      if (error) throw error;

      // Create chat room
      const { data: app } = await supabase
        .from("applications")
        .select("worker_id")
        .eq("id", applicationId)
        .single();

      if (app) {
        await supabase.from("chat_rooms").insert({
          job_id: id!,
          owner_id: profile!.id,
          worker_id: app.worker_id,
        }).select().single();
      }
    },
    onSuccess: () => {
      toast.success("Application accepted! Chat room created.");
      queryClient.invalidateQueries({ queryKey: ["job-applications", id] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const rejectApplicationMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await supabase
        .from("applications")
        .update({ status: "rejected" })
        .eq("id", applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application rejected.");
      queryClient.invalidateQueries({ queryKey: ["job-applications", id] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-white font-semibold">Job not found</p>
        <button onClick={() => navigate("/jobs")} className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm">
          ← Back to Jobs
        </button>
      </div>
    );
  }

  const imageUrls: string[] = job.metadata?.image_urls || [];
  const videoUrl: string = job.metadata?.video_url || "";
  const isOwner = profile?.id === job.owner_id;
  const isWorker = profile?.role === "worker";
  const hasApplied = !!application;
  const APPLICATION_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    pending: { label: "Pending", color: "text-amber-400 bg-amber-400/10" },
    accepted: { label: "Accepted", color: "text-emerald-400 bg-emerald-400/10" },
    rejected: { label: "Rejected", color: "text-red-400 bg-red-400/10" },
    withdrawn: { label: "Withdrawn", color: "text-slate-400 bg-slate-800" },
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Back button */}
      <button
        onClick={() => navigate("/jobs")}
        className="flex items-center gap-1 text-slate-400 hover:text-white transition text-sm mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Jobs
      </button>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Image gallery */}
          {imageUrls.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="relative aspect-video bg-slate-800">
                {showVideo && videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={imageUrls[activeImage]}
                    alt={`Job photo ${activeImage + 1}`}
                    className="w-full h-full object-cover"
                  />
                )}
                {videoUrl && !showVideo && (
                  <button
                    onClick={() => setShowVideo(true)}
                    className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-full transition"
                  >
                    <Play className="w-3 h-3" /> Watch video
                  </button>
                )}
              </div>

              {/* Thumbnails */}
              {imageUrls.length > 1 && (
                <div className="flex gap-2 p-3">
                  {imageUrls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => { setActiveImage(i); setShowVideo(false); }}
                      className={cn(
                        "w-16 h-16 rounded-lg overflow-hidden border-2 transition flex-shrink-0",
                        activeImage === i && !showVideo
                          ? "border-indigo-500"
                          : "border-transparent opacity-60 hover:opacity-100"
                      )}
                    >
                      <img src={url} alt={`thumb ${i}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                  {videoUrl && (
                    <button
                      onClick={() => setShowVideo(true)}
                      className={cn(
                        "w-16 h-16 rounded-lg border-2 transition flex-shrink-0 bg-slate-800 flex items-center justify-center",
                        showVideo ? "border-indigo-500" : "border-transparent opacity-60 hover:opacity-100"
                      )}
                    >
                      <Play className="w-5 h-5 text-white" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Job details */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                    {job.category}
                  </span>
                  {job.is_remote && (
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">
                      Remote
                    </span>
                  )}
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                    job.status === "open" ? "bg-emerald-500/10 text-emerald-400" :
                    job.status === "in_progress" ? "bg-blue-500/10 text-blue-400" :
                    "bg-slate-800 text-slate-400"
                  )}>
                    {job.status.replace("_", " ")}
                  </span>
                </div>
                <h1 className="text-white text-xl sm:text-2xl font-bold leading-tight">
                  {job.title}
                </h1>
              </div>
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap gap-3 mb-4 text-sm">
              {job.location && (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <MapPin className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  {job.location}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <Briefcase className="w-4 h-4 text-slate-500 flex-shrink-0" />
                {job.views || 0} views
              </span>
              <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
                <MessageCircle className="w-4 h-4 flex-shrink-0" />
                Price negotiated via chat
              </span>
            </div>

            {/* Description */}
            <div className="mb-4">
              <h3 className="text-white font-semibold mb-2">Description</h3>
              <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
                {job.description}
              </p>
            </div>

            {/* Skills */}
            {job.skills_needed?.length > 0 && (
              <div>
                <h3 className="text-white font-semibold mb-2">Skills needed</h3>
                <div className="flex flex-wrap gap-2">
                  {job.skills_needed.map((skill: string) => (
                    <span
                      key={skill}
                      className="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Applications (owner only) */}
          {isOwner && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-white font-semibold">
                  Applications ({applications?.length || 0})
                </h2>
              </div>
              {(applications || []).length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <User className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No applications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {(applications || []).map((app: any) => (
                    <div key={app.id} className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                            {app.worker?.full_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white font-medium">{app.worker?.full_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1 text-amber-400 text-xs">
                                <Star className="w-3 h-3" />
                                {app.worker?.rating?.toFixed(1) || "0.0"}
                              </span>
                              <span className="text-slate-500 text-xs">
                                {app.worker?.total_jobs || 0} jobs
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className={cn(
                          "text-xs px-2 py-1 rounded-full font-medium flex-shrink-0",
                          APPLICATION_STATUS_CONFIG[app.status]?.color
                        )}>
                          {APPLICATION_STATUS_CONFIG[app.status]?.label}
                        </span>
                      </div>

                      {app.cover_letter && (
                        <p className="text-slate-400 text-sm mb-3 leading-relaxed line-clamp-3">
                          {app.cover_letter}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-emerald-400 font-semibold">
                            ₦{app.proposed_price?.toLocaleString()}
                          </span>
                          <span className="text-slate-500">
                            {app.proposed_days} day{app.proposed_days !== 1 ? "s" : ""}
                          </span>
                          <span className="text-slate-600 text-xs">
                            {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        {app.status === "pending" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => rejectApplicationMutation.mutate(app.id)}
                              disabled={rejectApplicationMutation.isPending}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => acceptApplicationMutation.mutate(app.id)}
                              disabled={acceptApplicationMutation.isPending}
                              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                            >
                              {acceptApplicationMutation.isPending && (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              )}
                              Accept
                            </button>
                          </div>
                        )}

                        {app.status === "accepted" && (
                          <button
                            onClick={async () => {
                          const { data: room } = await supabase
                            .from("chat_rooms")
                            .select("id")
                            .eq("job_id", id!)
                            .eq("owner_id", profile!.id)
                            .single();
                          if (room) navigate(`/chat/${room.id}`);
                        }}
                            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                          >
                            <MessageCircle className="w-3 h-3" /> Open Chat
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Apply form */}
          {isWorker && job.status === "open" && !isOwner && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
              {hasApplied ? (
                <div className="text-center py-4">
                  <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-white font-semibold">Application Submitted</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Status:{" "}
                    <span className={cn(
                      "font-medium",
                      APPLICATION_STATUS_CONFIG[application.status]?.color.split(" ")[0]
                    )}>
                      {APPLICATION_STATUS_CONFIG[application.status]?.label}
                    </span>
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    Applied {formatDistanceToNow(new Date(application.created_at), { addSuffix: true })}
                  </p>
                </div>
              ) : showApplyForm ? (
                <>
                  <h2 className="text-white font-semibold mb-4">Submit Application</h2>
                  <form
                    onSubmit={handleSubmit((d) => applyMutation.mutate(d))}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">
                        Cover letter <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        {...register("cover_letter")}
                        rows={5}
                        placeholder="Explain why you are the right person for this job, your experience, and how you plan to approach it…"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
                      />
                      {errors.cover_letter && (
                        <p className="text-red-400 text-xs mt-1">{errors.cover_letter.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-300 text-sm font-medium mb-2">
                          Your price (₦) <span className="text-red-400">*</span>
                        </label>
                        <input
                          {...register("proposed_price")}
                          type="number"
                          placeholder="e.g. 15000"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                        {errors.proposed_price && (
                          <p className="text-red-400 text-xs mt-1">{errors.proposed_price.message}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-slate-300 text-sm font-medium mb-2">
                          Days to complete <span className="text-red-400">*</span>
                        </label>
                        <input
                          {...register("proposed_days")}
                          type="number"
                          placeholder="e.g. 3"
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                        {errors.proposed_days && (
                          <p className="text-red-400 text-xs mt-1">{errors.proposed_days.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowApplyForm(false)}
                        className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-6 rounded-xl transition text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={applyMutation.isPending}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm"
                      >
                        {applyMutation.isPending ? (
                          <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
                        ) : (
                          "Submit Application"
                        )}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="text-center py-2">
                  <h2 className="text-white font-semibold mb-1">Interested in this job?</h2>
                  <p className="text-slate-400 text-sm mb-4">
                    Submit your proposal with your price and timeline
                  </p>
                  {(profile?.kyc_level || 0) < 1 ? (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
                      <p className="text-amber-300 text-sm">
                        ⚠️ Complete{" "}
                        <Link to="/kyc" className="underline font-medium">KYC verification</Link>
                        {" "}to apply for jobs
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowApplyForm(true)}
                      className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-8 rounded-xl transition"
                    >
                      Apply for this Job
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {/* Owner card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-3">Posted by</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {job.owner?.full_name?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium">{job.owner?.full_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1 text-amber-400 text-xs">
                    <Star className="w-3 h-3" />
                    {job.owner?.rating?.toFixed(1) || "0.0"}
                  </span>
                  <span className="text-slate-500 text-xs">
                    {job.owner?.total_jobs || 0} jobs posted
                  </span>
                </div>
              </div>
            </div>
            <div className="text-slate-500 text-xs">
              Member since {format(new Date(job.owner?.created_at || job.created_at), "MMM yyyy")}
            </div>
          </div>

          {/* Job stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-3">Job Details</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Category</span>
                <span className="text-white font-medium">{job.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Location</span>
                <span className="text-white font-medium">{job.location || "Not specified"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Remote</span>
                <span className="text-white font-medium">{job.is_remote ? "Yes" : "No"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Pricing</span>
                <span className="text-indigo-400 font-medium">Via chat</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span className={cn(
                  "font-medium capitalize",
                  job.status === "open" ? "text-emerald-400" : "text-slate-400"
                )}>
                  {job.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Posted</span>
                <span className="text-white font-medium">
                  {format(new Date(job.created_at), "MMM d, yyyy")}
                </span>
              </div>
            </div>
          </div>

          {/* Skills */}
          {job.skills_needed?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3">Skills Required</h3>
              <div className="flex flex-wrap gap-2">
                {job.skills_needed.map((skill: string) => (
                  <span
                    key={skill}
                    className="bg-indigo-500/10 text-indigo-400 text-xs px-3 py-1 rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Owner actions */}
          {isOwner && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <h3 className="text-white font-semibold mb-3">Manage Job</h3>
              <button
                onClick={async () => {
                  await supabase.from("jobs").update({ status: "cancelled" }).eq("id", id!);
                  toast.success("Job cancelled");
                  navigate("/jobs");
                }}
                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2.5 rounded-xl transition text-sm font-medium"
              >
                Cancel Job
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}