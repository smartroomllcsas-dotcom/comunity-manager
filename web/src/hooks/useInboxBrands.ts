"use client";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAgent } from "./useCurrentAgent";
import type { InboxBrand } from "@/lib/inbox/brand-display";

/**
 * Marcas visibles para el usuario en el Inbox.
 *
 * La lista viene ya acotada por el backend (`/api/inbox/brands`). El cliente no
 * filtra ni completa nada: si una marca no está aquí, el usuario no puede
 * seleccionarla ni verá su nombre.
 */
export function useInboxBrands(initialData: InboxBrand[] = []) {
  const { data: agent } = useCurrentAgent();

  return useQuery<InboxBrand[]>({
    queryKey: ["inbox-brands", agent?.organization_id],
    initialData,
    queryFn: async () => {
      const response = await fetch("/api/inbox/brands", { cache: "no-store" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "No se pudieron cargar las marcas");
      }
      const { brands } = (await response.json()) as { brands: InboxBrand[] };
      return brands || [];
    },
    enabled: !!agent,
  });
}
