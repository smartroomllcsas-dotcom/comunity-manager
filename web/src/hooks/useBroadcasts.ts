"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";
import type { Broadcast } from "@/types/database";

export function useBroadcasts() {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();
  return useQuery<Broadcast[]>({
    queryKey: ["broadcasts", agent?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("broadcasts").select("*, template:message_templates(name), channel:channels(id, name, whatsapp_phone_number)").eq("organization_id", agent!.organization_id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agent,
  });
}
