import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth.store";
import { X, FileText, Plus, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const contractSchema = z.object({
  title: z.string().min(3, "Title required"),
  description: z.string().min(10, "Description required"),
  total_price: z.coerce.number().positive("Price must be positive"),
  payment_type: z.enum(["full", "milestone"]),
  deadline: z.string().min(1, "Deadline required"),
});
type ContractForm = z.infer<typeof contractSchema>;

interface Milestone {
  title: string;
  amount: number;
  due_date: string;
}

interface Props {
  roomId: string;
  jobId: string;
  workerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ContractProposalModal({ roomId, jobId, workerId, onClose, onSuccess }: Props) {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [milestones, setMilestones] = useState<Milestone[]>([
    { title: "", amount: 0, due_date: "" },
  ]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ContractForm>({
    resolver: zodResolver(contractSchema),
    defaultValues: { payment_type: "full" },
  });

  const paymentType = watch("payment_type");
  const totalPrice = watch("total_price") || 0;
  const milestonesTotal = milestones.reduce((s, m) => s + (m.amount || 0), 0);
  const milestoneMismatch = paymentType === "milestone" && milestonesTotal !== Number(totalPrice);

  const createContractMutation = useMutation({
    mutationFn: async (data: ContractForm) => {
      if (paymentType === "milestone" && milestonesTotal !== Number(data.total_price)) {
        throw new Error(`Milestones total (₦${milestonesTotal.toLocaleString()}) must equal total price (₦${Number(data.total_price).toLocaleString()})`);
      }

      // Create contract
      const { data: contract, error } = await supabase
        .from("contracts")
        .insert({
          job_id: jobId,
          owner_id: profile!.id,
          worker_id: workerId,
          title: data.title.trim(),
          description: data.description.trim(),
          total_price: data.total_price,
          payment_type: data.payment_type,
          deadline: data.deadline,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;

      // Create milestones
      if (paymentType === "milestone") {
        const { error: msErr } = await supabase
          .from("milestones")
          .insert(
            milestones.map((m, i) => ({
              contract_id: contract.id,
              title: m.title,
              amount: m.amount,
              due_date: m.due_date,
              order_index: i + 1,
              status: "pending",
            }))
          );
        if (msErr) throw msErr;
      } else {
        // Single milestone for full payment
        await supabase.from("milestones").insert({
          contract_id: contract.id,
          title: "Full Payment",
          amount: data.total_price,
          due_date: data.deadline,
          order_index: 1,
          status: "pending",
        });
      }

      // Link contract to chat room
      await supabase
        .from("chat_rooms")
        .update({ contract_id: contract.id })
        .eq("id", roomId);

      // Activate contract
      await supabase
        .from("contracts")
        .update({ status: "active" })
        .eq("id", contract.id);

      return contract;
    },
    onSuccess: () => {
      toast.success("Contract created successfully! 🎉");
      queryClient.invalidateQueries({ queryKey: ["chat-room"] });
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const addMilestone = () => {
    setMilestones([...milestones, { title: "", amount: 0, due_date: "" }]);
  };

  const removeMilestone = (index: number) => {
    if (milestones.length === 1) return;
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const updateMilestone = (index: number, field: keyof Milestone, value: string | number) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <h2 className="text-white font-semibold">Create Contract</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((d) => createContractMutation.mutate(d))}
          className="p-5 space-y-4"
        >
          {/* Title */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Contract title <span className="text-red-400">*</span>
            </label>
            <input
              {...register("title")}
              placeholder="e.g. Kitchen Pipe Repair"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Scope of work <span className="text-red-400">*</span>
            </label>
            <textarea
              {...register("description")}
              rows={3}
              placeholder="Describe exactly what work will be done…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
            />
            {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
          </div>

          {/* Total price + deadline */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Total price (₦) <span className="text-red-400">*</span>
              </label>
              <input
                {...register("total_price")}
                type="number"
                placeholder="15000"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              {errors.total_price && <p className="text-red-400 text-xs mt-1">{errors.total_price.message}</p>}
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Deadline <span className="text-red-400">*</span>
              </label>
              <input
                {...register("deadline")}
                type="date"
                min={new Date().toISOString().split("T")[0]}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              {errors.deadline && <p className="text-red-400 text-xs mt-1">{errors.deadline.message}</p>}
            </div>
          </div>

          {/* Payment type */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Payment type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "full", label: "Full Payment", desc: "Pay everything upfront" },
                { value: "milestone", label: "Milestones", desc: "Pay in stages" },
              ].map(({ value, label, desc }) => (
                <label
                  key={value}
                  className={cn(
                    "flex flex-col gap-1 p-3 rounded-xl border cursor-pointer transition",
                    paymentType === value
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-700 hover:border-slate-600"
                  )}
                >
                  <input
                    type="radio"
                    {...register("payment_type")}
                    value={value}
                    className="sr-only"
                  />
                  <span className="text-white text-sm font-medium">{label}</span>
                  <span className="text-slate-400 text-xs">{desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Milestones */}
          {paymentType === "milestone" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-slate-300 text-sm font-medium">
                  Milestones
                </label>
                <span className={cn(
                  "text-xs font-medium",
                  milestoneMismatch ? "text-red-400" : "text-emerald-400"
                )}>
                  Total: ₦{milestonesTotal.toLocaleString()} / ₦{Number(totalPrice).toLocaleString()}
                </span>
              </div>
              <div className="space-y-3">
                {milestones.map((milestone, index) => (
                  <div key={index} className="bg-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs">Milestone {index + 1}</span>
                      {milestones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMilestone(index)}
                          className="text-red-400 hover:text-red-300 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      value={milestone.title}
                      onChange={(e) => updateMilestone(index, "title", e.target.value)}
                      placeholder="Milestone title"
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={milestone.amount || ""}
                        onChange={(e) => updateMilestone(index, "amount", Number(e.target.value))}
                        placeholder="Amount (₦)"
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <input
                        type="date"
                        value={milestone.due_date}
                        onChange={(e) => updateMilestone(index, "due_date", e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addMilestone}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-400 py-2.5 rounded-xl transition text-sm"
                >
                  <Plus className="w-4 h-4" /> Add milestone
                </button>
              </div>
              {milestoneMismatch && (
                <p className="text-red-400 text-xs mt-2 text-center">
                  Milestones must add up to the total price
                </p>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-6 rounded-xl transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createContractMutation.isPending || (paymentType === "milestone" && milestoneMismatch)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm"
            >
              {createContractMutation.isPending ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Creating…</>
              ) : (
                <><FileText className="w-4 h-4" /> Create Contract</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}