"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAgent } from "./useCurrentAgent";
import { useInboxStore } from "@/stores/inbox";
import type { Conversation } from "@/types/database";
import { useEffect } from "react";
import { getConversationChannelKind } from "@/components/inbox/ChannelBadge";
import { createClient } from "@/lib/supabase/client";

export function useConversations(initialData: Conversation[] = []) {
  const { data: agent } = useCurrentAgent();
  const filter = useInboxStore((s) => s.filter);
  const searchQuery = useInboxStore((s) => s.searchQuery);
  const statusFilter = useInboxStore((s) => s.statusFilter);
  const channelFilter = useInboxStore((s) => s.channelFilter);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!agent?.organization_id) return;

    const supabase = createClient();
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const conversationsChannel = supabase
      .channel(`conversations:${agent.organization_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "smarttalk",
          table: "conversations",
          filter: `organization_id=eq.${agent.organization_id}`,
        },
        invalidate
      )
      .subscribe();

    // Inserts de mensajes cambian last_message_preview y unread_count.
    // Nos suscribimos también aunque el filtro por organization no aplica en
    // messages; invalidamos y dejamos que el server responda con lo actualizado.
    const messagesChannel = supabase
      .channel(`inbox-messages:${agent.organization_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "smarttalk", table: "messages" },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [agent?.organization_id, queryClient]);

  return useQuery<Conversation[]>({
    queryKey: ["conversations", filter, searchQuery, statusFilter, channelFilter],
    initialData,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter && filter !== "all") params.set("filter", filter);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (channelFilter && channelFilter !== "all") params.set("channel", channelFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("limit", "50");
      const qs = params.toString();
      const response = await fetch(`/api/inbox/conversations${qs ? `?${qs}` : ""}`, { cache: "no-store" });
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
  });
}
