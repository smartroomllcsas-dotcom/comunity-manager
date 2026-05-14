"use client";
import { useQuery } from "@tanstack/react-query";
import type { Invitation } from "@/types/database";

export function useInvitations() {
  return useQuery<Invitation[]>({
    queryKey: ["invitations"],
    queryFn: async () => {
      const res = await fetch("/api/invitations");
      if (!res.ok) throw new Error("Failed to fetch invitations");
      const json = await res.json();
      return json.invitations || [];
    },
  });
}
