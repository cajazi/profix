import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { ContractProposalModal } from "../../components/contracts/ContractProposalModal";
import { useAuthStore } from "../../store/auth.store";
import type { Message } from "../../types/database";
import {
  Send, FileText, AlertTriangle, Loader2, CheckCheck, Lock
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

const MAX_MESSAGE_LENGTH = 5000;
const RATE_LIMIT_MS = 2000;

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return `Yesterday ${format(date, "HH:mm")}`;
  return format(date, "MMM d, HH:mm");
}

function sanitize(content: string): string {
  return content.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").trim();
}

export function ChatPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<number>(0);
  const [input, setInput] = useState("");
  const [showContractModal, setShowContractModal] = useState(false);

  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: ["chat-room", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_rooms")
        .select(
          "*, job:jobs(*), owner:users!chat_rooms_owner_id_fkey(*), worker:users!chat_rooms_worker_id_fkey(*)"
        )
        .eq("id", roomId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!roomId && !!profile,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "*, sender:users!messages_sender_id_fkey(id, full_name, avatar_url, role)"
        )
        .eq("room_id", roomId!)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!roomId && !!profile,
  });

  useEffect(() => {
    if (!roomId || !profile) return;

    const channel = supabase
      .channel(`chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          queryClient.setQueryData(
            ["messages", roomId],
            (old: Message[] = []) => {
              if (old.some((m) => m.id === payload.new.id)) return old;
              return [...old, payload.new as Message];
            }
          );
        }
      )
      .subscribe();

    supabase
      .from("messages")
      .update({ is_read: true })
      .eq("room_id", roomId)
      .neq("sender_id", profile.id)
      .eq("is_read", false)
      .then(() => {});

    return () => { supabase.removeChannel(channel); };
  }, [roomId, profile, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!profile || !room) throw new Error("Not authenticated");
      if (room.is_locked) throw new Error("This chat is locked");
      const clean = sanitize(content);
      if (!clean) throw new Error("Empty message");
      if (clean.length > MAX_MESSAGE_LENGTH) throw new Error("Message too long");
      const { data, error } = await supabase
        .from("messages")
        .insert({
          room_id: roomId!,
          sender_id: profile.id,
          content: clean,
          message_type: "text",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const handleSend = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      toast.error("Slow down! You're sending messages too fast.");
      return;
    }
    if (!input.trim()) return;
    lastSentRef.current = now;
    sendMutation.mutate(input.trim());
    setInput("");
  }, [input, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isOwner = profile?.id === room?.owner_id;
  const isParticipant =
    profile && room &&
    (room.owner_id === profile.id || room.worker_id === profile.id);
  const otherUser = isOwner ? room?.worker : room?.owner;

  if (roomLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!isParticipant) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-96">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-slate-400">You don't have access to this chat</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
            {otherUser?.full_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-white font-semibold">{otherUser?.full_name}</p>
            <p className="text-slate-400 text-xs truncate max-w-xs">
              {room?.job?.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {room?.is_locked && (
            <span className="flex items-center gap-1 text-amber-400 text-xs bg-amber-400/10 px-2 py-1 rounded-full">
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
          {showContractModal && room && (
  <ContractProposalModal
    roomId={roomId!}
    jobId={room.job_id}
    workerId={room.worker_id}
    onClose={() => setShowContractModal(false)}
    onSuccess={() => setShowContractModal(false)}
  />
)}

{isOwner && !room?.contract_id && (
            <button
              onClick={() => setShowContractModal(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded-lg transition"
            >
              <FileText className="w-4 h-4" /> Create Contract
            </button>
          )}
          {room?.contract_id && (
            <button
              onClick={() => navigate(`/contracts/${room.contract_id}`)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-1.5 rounded-lg transition"
            >
              <FileText className="w-4 h-4" /> View Contract
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messagesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm">No messages yet. Say hello! 👋</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMine = msg.sender_id === profile?.id;
            const isSystem = msg.message_type === "system";

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-full max-w-xs text-center">
                    {msg.content}
                  </div>
                </div>
              );
            }

            const showAvatar =
              !isMine &&
              (i === 0 || messages[i - 1]?.sender_id !== msg.sender_id);

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2 items-end",
                  isMine ? "flex-row-reverse" : "flex-row"
                )}
              >
                {!isMine && (
                  <div className="w-7 h-7 flex-shrink-0">
                    {showAvatar && (
                      <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-semibold">
                        {(msg as any).sender?.full_name?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-xs lg:max-w-md xl:max-w-lg flex flex-col gap-0.5",
                    isMine ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words",
                      isMine
                        ? "bg-indigo-600 text-white rounded-br-md"
                        : "bg-slate-800 text-slate-100 rounded-bl-md"
                    )}
                  >
                    {msg.content}
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1",
                      isMine ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <span className="text-slate-500 text-xs">
                      {formatTime(msg.created_at)}
                    </span>
                    {isMine && (
                      <CheckCheck
                        className={cn(
                          "w-3.5 h-3.5",
                          msg.is_read ? "text-indigo-400" : "text-slate-500"
                        )}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-slate-900 border-t border-slate-800 p-4">
        {room?.is_locked ? (
          <div className="flex items-center justify-center gap-2 text-amber-400 text-sm py-2">
            <Lock className="w-4 h-4" />
            <span>Chat is locked. A dispute is under review.</span>
          </div>
        ) : (
          <div className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send)"
              maxLength={MAX_MESSAGE_LENGTH}
              rows={1}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none min-h-[48px] max-h-32"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              className="flex-shrink-0 w-12 h-12 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl flex items-center justify-center transition"
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Send className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        )}
        <p className="text-slate-600 text-xs mt-1 text-right">
          {input.length}/{MAX_MESSAGE_LENGTH}
        </p>
      </div>
    </div>
  );
}