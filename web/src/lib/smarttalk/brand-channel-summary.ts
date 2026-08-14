/**
 * Carga el estado operativo de los canales de un conjunto de marcas.
 *
 * Vive separado de `brand-channel-status.ts` —que es puro— porque necesita el
 * cliente `service_role`. Así el componente de cliente puede importar los tipos
 * y las reglas sin arrastrar credenciales al navegador.
 *
 * Dos filtros, los dos obligatorios:
 *
 *   1. `organization_id`: una agencia no ve el estado de los canales de otra,
 *      aunque compartan el identificador del activo.
 *   2. `brand_id IN (…)`: la lista la calcula quien llama a partir del alcance
 *      del usuario (`getAgentBrandIds`), de modo que un asesor de marca sólo
 *      recibe el estado de las marcas que tiene asignadas.
 *
 * Nunca devuelve `access_token`, `access_token_ciphertext` ni el `config`
 * completo: de `config` sólo sale `activation_error`, que ya viene saneado por
 * `sanitizeProviderError`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  summarizeChannelsByBrand,
  type BrandChannelMap,
  type BrandChannelRow,
} from "./brand-channel-status";

const CHANNEL_SUMMARY_COLUMNS =
  "id, brand_id, type, status, name, meta_business_id, whatsapp_phone_number_id, config";

export async function loadBrandChannelSummaries(
  organizationId: string,
  brandIds: string[],
): Promise<Record<string, BrandChannelMap>> {
  const unique = [...new Set(brandIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("channels")
    .select(CHANNEL_SUMMARY_COLUMNS)
    .eq("organization_id", organizationId)
    .in("brand_id", unique);

  if (error) {
    // Sin este dato la pantalla no puede afirmar «conectado». Se propaga para
    // que la ruta responda un error en vez de devolver un listado que la
    // interfaz interpretaría como «ninguna marca tiene canales» y pintaría
    // botones de conectar sobre conexiones que sí existen.
    throw new Error(`No se pudo consultar el estado de los canales: ${error.message}`);
  }

  const rows: BrandChannelRow[] = (
    (data || []) as Array<Record<string, unknown>>
  ).map((row) => {
    const config = (row.config || {}) as Record<string, unknown>;
    return {
      id: String(row.id),
      brand_id: (row.brand_id as string | null) ?? null,
      type: (row.type as string | null) ?? null,
      status: (row.status as string | null) ?? null,
      name: (row.name as string | null) ?? null,
      meta_business_id: (row.meta_business_id as string | null) ?? null,
      whatsapp_phone_number_id: (row.whatsapp_phone_number_id as string | null) ?? null,
      activation_error:
        typeof config.activation_error === "string" ? config.activation_error : null,
      // Sólo un booleano cuenta. Cualquier otra cosa —el campo ausente en un
      // canal histórico, o un valor corrupto— se trata como «no se sabe», y no
      // saber nunca degrada la vista.
      webhook_subscribed:
        typeof config.webhook_subscribed === "boolean" ? config.webhook_subscribed : null,
    };
  });

  return summarizeChannelsByBrand(rows, unique);
}
