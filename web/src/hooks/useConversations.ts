"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAgent } from "./useCurrentAgent";
import { useInboxStore } from "@/stores/inbox";
import type { Conversation } from "@/types/database";
import { useEffect } from "react";
import { getConversationChannelKind } from "@/components/inbox/ChannelBadge";

export function useConversations(initialData: Conversation[] = []) {
  const { data: agent } = useCurrentAgent();
  const filter = useInboxStore((s) => s.filter);
  const searchQuery = useInboxStore((s) => s.searchQuery);
  const statusFilter = useInboxStore((s) => s.statusFilter);
  const channelFilter = useInboxStore((s) => s.channelFilter);
  const queryClient = useQueryClient();

  useEffect(() => {
    const interval = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [queryClient]);

  return useQuery<Conversation[]>({
    queryKey: ["conversations", filter, searchQuery, statusFilter, channelFilter],
    initialData,
    queryFn: async () => {
      const response = await fetch("/api/inbox/conversations", { cache: "no-store" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "No se pudieron cargar las conversaciones");
      }

      const { conversations } = (await response.json()) as { conversations: Conversation[] };
      let filtered = conversations || [];

      switch (filter) {
        case "mine":
          if (agent) filtered = filtered.filter((conversation) => conversation.assigned_agent_id === agent.id);
          break;
        case "unassigned":
          filtered = filtered.filter((conversation) => !conversation.assigned_agent_id);
          break;
        case "open":
        case "pending":
        case "resolved":
        case "closed":
          filtered = filtered.filter((conversation) => conversation.status === filter);
          break;
      }

      if (statusFilter === "snoozed") {
        filtered = filtered.filter((conversation) => !!conversation.snoozed_until);
      } else if (statusFilter && statusFilter !== "all") {
        filtered = filtered.filter((conversation) => conversation.status === statusFilter);
      }

      if (channelFilter !== "all") {
        return filtered.filter((conversation: Conversation) => getConversationChannelKind(conversation) === channelFilter);
      }
      return filtered;
    },
    enabled: !!agent,
    refetchInterval: 5000,
  });
}
