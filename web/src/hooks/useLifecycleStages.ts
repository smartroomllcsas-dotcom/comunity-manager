"use client";
import { useQuery } from "@tanstack/react-query";
import type { LifecycleStage } from "@/types/database";

export function useLifecycleStages() {
  return useQuery<LifecycleStage[]>({
    queryKey: ["lifecycle-stages"],
    queryFn: async () => {
      const res = await fetch("/api/lifecycle");
      if (!res.ok) throw new Error("Failed to fetch lifecycle stages");
      const data = await res.json();
      return data.stages || [];
    },
  });
}
