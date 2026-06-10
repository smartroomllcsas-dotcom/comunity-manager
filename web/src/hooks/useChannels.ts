"use client";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAgent } from "./useCurrentAgent";
import type { Channel } from "@/types/database";

export function useChannels(initialData: Channel[] = []) {
  const { data: agent } = useCurrentAgent();
  const queryClient = useQueryClient();
  const syncAttemptedRef = useRef<string | null>(null);

  const query = useQuery<Channel[]>({
    queryKey: ["channels", agent?.organization_id],
    initialData,
    queryFn: async () => {
      const response = await fetch("/api/inbox/channels", { cache: "no-store" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "No se pudieron cargar los canales");
      }
      const { channels } = (await response.json()) as { channels: Channel[] };
      return channels || [];
    },
    enabled: !!agent,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!agent?.organization_id) return;
    if (query.isFetching || query.isLoading) return;

    const visibleChannels = query.data || [];
    const hasInstagram = visibleChannels.some(
      (channel) => channel.type === "instagram" && channel.status === "active"
    );
    const hasRequiredVisibleChannel = visibleChannels.some(
      (channel) =>
        channel.status === "active" &&
        (channel.type === "whatsapp_business_api" ||
          channel.type === "whatsapp_cloud_api" ||
          channel.type === "facebook_messenger" ||
          channel.type === "instagram")
    );

    if (hasInstagram && hasRequiredVisibleChannel) return;
    if (syncAttemptedRef.current === agent.organization_id) return;

    syncAttemptedRef.current = agent.organization_id;

    void fetch("/api/channels/sync-legacy", { method: "POST" })
      .then((res) => {
        if (!res.ok) return;
        void queryClient.invalidateQueries({ queryKey: ["channels", agent.organization_id] });
      })
      .catch(() => {
        // Ignore sync errors here; the empty state will remain visible.
      });
  }, [agent?.organization_id, query.data, query.isFetching, query.isLoading, queryClient]);

  return query;
}
