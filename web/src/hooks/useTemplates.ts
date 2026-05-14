"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";
import type { MessageTemplate } from "@/types/database";

export function useTemplates() {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();
  return useQuery<MessageTemplate[]>({
    queryKey: ["templates", agent?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("message_templates").select("*").eq("organization_id", agent!.organization_id).eq("status", "approved").order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!agent,
  });
}
