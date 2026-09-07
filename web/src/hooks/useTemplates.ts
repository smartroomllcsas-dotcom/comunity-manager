"use client";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAgent } from "./useCurrentAgent";
import type { InboxTemplate } from "@/components/inbox/TemplateBanner";

/**
 * Plantillas aprobadas de WhatsApp para el chat. Se resuelven en el servidor
 * (`/api/inbox/templates`), que une el sistema nuevo por marca
 * (cm_wa_templates) con el viejo (message_templates). Antes leía sólo el
 * viejo desde el navegador y el selector salía vacío.
 */
export function useTemplates(brandId?: string | null) {
  const { data: agent } = useCurrentAgent();
  return useQuery<InboxTemplate[]>({
    queryKey: ["templates", agent?.organization_id, brandId || "all"],
    queryFn: async () => {
      const qs = brandId ? `?brandId=${encodeURIComponent(brandId)}` : "";
      const response = await fetch(`/api/inbox/templates${qs}`, { cache: "no-store" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "No se pudieron cargar las plantillas");
      }
      const { templates } = (await response.json()) as { templates: InboxTemplate[] };
      return templates || [];
    },
    staleTime: 60_000,
    enabled: !!agent,
  });
}
