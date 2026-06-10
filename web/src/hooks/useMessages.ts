"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/types/database";
import { useEffect } from "react";

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const interval = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [conversationId, queryClient]);

  return useQuery<Message[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await fetch(`/api/inbox/messages/${encodeURIComponent(conversationId)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "No se pudieron cargar los mensajes");
      }
      const { messages } = (await response.json()) as { messages: Message[] };
      return messages || [];
    },
    enabled: !!conversationId,
    refetchInterval: 5000,
  });
}
