"use client";
import { useQuery } from "@tanstack/react-query";
import type { ContactSegment } from "@/types/database";

export function useSegments() {
  return useQuery<ContactSegment[]>({
    queryKey: ["segments"],
    queryFn: async () => {
      const res = await fetch("/api/segments");
      if (!res.ok) throw new Error("Error al cargar segmentos");
      const data = await res.json();
      return data.segments;
    },
  });
}
