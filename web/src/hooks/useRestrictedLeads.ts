"use client";

import { useQuery } from "@tanstack/react-query";

type RestrictedLeadsPayload = { count: number };

export function useRestrictedLeads(brandId?: string) {
  return useQuery<RestrictedLeadsPayload>({
    queryKey: ["restricted-leads", brandId || "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (brandId) params.set("brandId", brandId);
      const response = await fetch(`/api/billing/restricted-leads?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No fue posible consultar los leads retenidos.");
      return response.json() as Promise<RestrictedLeadsPayload>;
    },
  });
}
