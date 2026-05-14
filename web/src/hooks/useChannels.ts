"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";
import type { Channel } from "@/types/database";

export function useChannels() {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();

  return useQuery<Channel[]>({
    queryKey: ["channels", agent?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .eq("organization_id", agent!.organization_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agent,
  });
}
