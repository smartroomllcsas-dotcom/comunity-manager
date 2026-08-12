"use client";
import { useQuery } from "@tanstack/react-query";
import type { InboxBrand } from "@/lib/inbox/brand-display";

/**
 * Marcas visibles para el usuario en el Inbox.
 *
 * La lista viene ya acotada por el backend (`/api/inbox/brands`). El cliente no
 * filtra ni completa nada: si una marca no está aquí, el usuario no puede
 * seleccionarla ni verá su nombre.
 */
export function useInboxBrands(initialData: InboxBrand[] = []) {
  return useQuery<InboxBrand[]>({
    queryKey: ["inbox-brands"],
    initialData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch("/api/inbox/brands", { cache: "no-store" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "No se pudieron cargar las marcas");
      }
      const { brands } = (await response.json()) as { brands: InboxBrand[] };
      return brands || [];
    },
  });
}
