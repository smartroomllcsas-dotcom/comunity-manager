"use client";
import { useQuery } from "@tanstack/react-query";
import type { Tag } from "@/types/database";

export function useTags() {
  return useQuery<(Tag & { usage_count: number })[]>({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await fetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      const data = await res.json();
      return data.tags || [];
    },
  });
}
