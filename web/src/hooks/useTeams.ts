"use client";
import { useQuery } from "@tanstack/react-query";
import type { Team } from "@/types/database";

export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch("/api/teams");
      if (!res.ok) throw new Error("Failed to fetch teams");
      const data = await res.json();
      return data.teams || [];
    },
  });
}
