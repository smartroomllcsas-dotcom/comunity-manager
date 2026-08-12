"use client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAgent } from "./useCurrentAgent";
import { useInboxStore } from "@/stores/inbox";
import type { Conversation } from "@/types/database";
import { useEffect } from "react";
import { getConversationChannelKind } from "@/components/inbox/ChannelBadge";
import { createClient } from "@/lib/supabase/client";

interface ConversationViewFilters {
  filter: "all" | "mine" | "unassigned" | Conversation["status"];
  searchQuery: string;
  statusFilter: "open" | "closed" | "pending" | "snoozed" | "all";
  channelFilter: "all" | "whatsapp" | "facebook" | "instagram" | "tiktok" | "telegram" | "webchat" | "custom";
  brandFilter: string;
  agentId?: string;
}

/**
 * Applies the same client-side view rules to the server seed and to the API
 * response. This matters when a query key changes: TanStack Query can render
 * `initialData` immediately while the new request is in flight. Without this
 * guard, selecting Marca B briefly (or permanently on an API error) showed
 * conversations from Marca A.
 */
export function filterInboxConversations(
  conversations: Conversation[],
  filters: ConversationViewFilters,
) {
  let filtered = conversations;

  if (filters.brandFilter !== "all") {
    filtered = filtered.filter((conversation) => conversation.brand_id === filters.brandFilter);
  }

  switch (filters.filter) {
    case "mine":
      if (filters.agentId) {
        filtered = filtered.filter((conversation) => conversation.assigned_agent_id === filters.agentId);
      }
      break;
    case "unassigned":
      filtered = filtered.filter((conversation) => !conversation.assigned_agent_id);
      break;
    case "open":
    case "pending":
    case "resolved":
    case "closed":
      filtered = filtered.filter((conversation) => conversation.status === filters.filter);
      break;
  }

  if (filters.statusFilter === "snoozed") {
    filtered = filtered.filter((conversation) => !!conversation.snoozed_until);
  } else if (filters.statusFilter !== "all") {
    filtered = filtered.filter((conversation) => conversation.status === filters.statusFilter);
  }

  if (filters.channelFilter !== "all") {
    filtered = filtered.filter(
      (conversation) => getConversationChannelKind(conversation) === filters.channelFilter,
    );
  }

  const needle = filters.searchQuery.trim().toLowerCase();
  if (needle) {
    filtered = filtered.filter((conversation) => {
      const contact = conversation.contact;
      return (
        (contact?.name || "").toLowerCase().includes(needle) ||
        (contact?.wa_id || "").toLowerCase().includes(needle) ||
        (conversation.last_message_preview || "").toLowerCase().includes(needle)
      );
    });
  }

  return filtered;
}

export function useConversations(initialData: Conversation[] = []) {
  const { data: agent } = useCurrentAgent();
  const filter = useInboxStore((s) => s.filter);
  const searchQuery = useInboxStore((s) => s.searchQuery);
  const statusFilter = useInboxStore((s) => s.statusFilter);
  const channelFilter = useInboxStore((s) => s.channelFilter);
  const brandFilter = useInboxStore((s) => s.brandFilter);
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

  const query = useInfiniteQuery({
    queryKey: ["conversations", filter, searchQuery, statusFilter, channelFilter, brandFilter],
    // Do not seed a brand-specific query with conversations from all brands.
    // The API remains the authorization boundary; this prevents stale visual
    // data while the request for the selected brand is loading.
    initialData: {
      pages: [
        {
          conversations: filterInboxConversations(initialData, {
            filter,
            searchQuery,
            statusFilter,
            channelFilter,
            brandFilter,
            agentId: agent?.id,
          }),
          nextCursor: null,
        },
      ],
      pageParams: [null],
    },
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filter && filter !== "all") params.set("filter", filter);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (channelFilter && channelFilter !== "all") params.set("channel", channelFilter);
      // El filtro por marca se resuelve en el servidor: si el id no pertenece al
      // usuario, la API responde 403 y aquí se propaga como error.
      if (brandFilter && brandFilter !== "all") params.set("brandId", brandFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("limit", "50");
      if (pageParam) params.set("cursor", pageParam);
      const qs = params.toString();
      const response = await fetch(`/api/inbox/conversations${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "No se pudieron cargar las conversaciones");
      }

      const { conversations, nextCursor } = (await response.json()) as {
        conversations: Conversation[];
        nextCursor: string | null;
      };
      return {
        conversations: filterInboxConversations(conversations || [], {
          filter,
          searchQuery,
          statusFilter,
          channelFilter,
          brandFilter,
          agentId: agent?.id,
        }),
        nextCursor: nextCursor || null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    // La autorización vive en la ruta API y usa la sesión del servidor. El
    // login local no siempre hidrata una sesión Supabase en el navegador; si
    // dependemos de `useCurrentAgent` aquí, el filtro por marca nunca dispara
    // la consulta y se queda mostrando sólo el `initialData` del servidor.
    enabled: true,
  });

  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.conversations) || [],
  };
}
