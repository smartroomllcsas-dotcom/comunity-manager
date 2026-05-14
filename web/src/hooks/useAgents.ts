"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";
import type { Agent } from "@/types/database";

export function useAgents() {
  const supabase = createClient();
  const { data: currentAgent } = useCurrentAgent();
  return useQuery<Agent[]>({
    queryKey: ["agents", currentAgent?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*").eq("organization_id", currentAgent!.organization_id).order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentAgent,
  });
}
