"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";
import { useInboxStore } from "@/stores/inbox";
import type { Conversation } from "@/types/database";
import { useEffect } from "react";

export function useConversations() {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();
  const filter = useInboxStore((s) => s.filter);
  const searchQuery = useInboxStore((s) => s.searchQuery);
  const statusFilter = useInboxStore((s) => s.statusFilter);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!agent) return;
    const channel = supabase
      .channel("conversations-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${agent.organization_id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agent, supabase, queryClient]);

  return useQuery<Conversation[]>({
    queryKey: ["conversations", filter, searchQuery, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select("*, contact:contacts(*), assigned_agent:agents(*)")
        .eq("organization_id", agent!.organization_id)
        .order("updated_at", { ascending: false })
        .limit(50);

      switch (filter) {
        case "mine": if (agent) query = query.eq("assigned_agent_id", agent.id); break;
        case "unassigned": query = query.is("assigned_agent_id", null); break;
        case "open": case "pending": case "resolved": case "closed":
          query = query.eq("status", filter); break;
      }

      // Apply status filter
      if (statusFilter === "snoozed") {
        query = query.not("snoozed_until", "is", null);
      } else if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!agent,
  });
}
