"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Agent } from "@/types/database";

export function useCurrentAgent() {
  const supabase = createClient();
  return useQuery<Agent | null>({
    queryKey: ["current-agent"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("agents").select("*").eq("id", user.id).single();
      return data;
    },
  });
}
