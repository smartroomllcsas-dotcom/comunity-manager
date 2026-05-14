"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import { useEffect } from "react";

export function useMessages(conversationId: string | null) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        queryClient.setQueryData<Message[]>(["messages", conversationId], (old) => {
          if (!old) return [payload.new as Message];
          const exists = old.some((m) => m.id === (payload.new as Message).id);
          if (exists) return old;
          return [...old, payload.new as Message];
        });
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        queryClient.setQueryData<Message[]>(["messages", conversationId], (old) =>
          old?.map((m) => m.id === (payload.new as Message).id ? { ...m, ...(payload.new as Message) } : m) || []
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, supabase, queryClient]);

  return useQuery<Message[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*, agent:agents(id, name)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId,
  });
}
