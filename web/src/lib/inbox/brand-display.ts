/**
 * Presentación del nombre de marca en el Inbox.
 *
 * Vive fuera de los componentes para poder probar las reglas sin montar React,
 * igual que `subscription-ui.ts` en billing.
 *
 * Dos principios que el resto del Inbox debe respetar:
 *
 *  1. **La marca se identifica por `brand_id`, nunca por el nombre del canal.**
 *     Un canal puede llamarse "WhatsApp Ventas" y pertenecer a cualquier marca;
 *     deducirla del nombre daría una etiqueta plausible y equivocada.
 *  2. **Esto es sólo presentación.** Que la interfaz muestre u oculte una marca
 *     no autoriza nada: el filtrado real lo hace el backend con
 *     `getAgentBrandIds()` y responde 403 ante una marca ajena.
 */

/** Marca tal como la expone `/api/inbox/brands`. Sin secretos ni tokens. */
export interface InboxBrand {
  id: string;
  name: string | null;
}

export const BRAND_UNAVAILABLE_LABEL = "Marca no disponible";
export const BRAND_UNASSIGNED_LABEL = "Sin marca";

/** Fragmento corto y estable de un UUID, para poder distinguir marcas sin nombre. */
export function shortBrandId(brandId: string) {
  return brandId.slice(0, 8);
}

export function indexBrands(brands: InboxBrand[] | null | undefined) {
  const index = new Map<string, InboxBrand>();
  for (const brand of brands || []) {
    if (brand?.id) index.set(brand.id, brand);
  }
  return index;
}

/**
 * Etiqueta a mostrar para una marca.
 *
 * - Sin `brand_id`: la fila no pertenece a ninguna marca (dato heredado).
 * - Con `brand_id` pero sin nombre —porque el usuario no la tiene asignada, o
 *   porque `cm_clients` no la resolvió—: se avisa y se muestra el id corto, para
 *   que el operador pueda reportarla sin exponer nada sensible.
 */
export function brandLabel(
  brandId: string | null | undefined,
  brandsById: Map<string, InboxBrand>,
): string {
  if (!brandId) return BRAND_UNASSIGNED_LABEL;
  const name = brandsById.get(brandId)?.name;
  if (name && name.trim()) return name.trim();
  return `${BRAND_UNAVAILABLE_LABEL} · ${shortBrandId(brandId)}`;
}

/** True cuando la etiqueta es un fallback y conviene atenuarla en la interfaz. */
export function isBrandFallback(
  brandId: string | null | undefined,
  brandsById: Map<string, InboxBrand>,
) {
  if (!brandId) return true;
  const name = brandsById.get(brandId)?.name;
  return !(name && name.trim());
}

/**
 * Opciones del selector de marca.
 *
 * Sólo se listan las marcas que la API devolvió, que ya vienen acotadas por
 * `getAgentBrandIds()`. La interfaz no inventa opciones: si el backend no la
 * envía, el usuario no puede seleccionarla.
 */
export function brandFilterOptions(brands: InboxBrand[] | null | undefined) {
  return (brands || [])
    .filter((brand) => brand?.id)
    .map((brand) => ({
      value: brand.id,
      label: brand.name?.trim() || `${BRAND_UNAVAILABLE_LABEL} · ${shortBrandId(brand.id)}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}
