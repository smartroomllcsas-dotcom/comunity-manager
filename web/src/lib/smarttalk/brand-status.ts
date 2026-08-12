/**
 * Estado de pausa de una marca — reglas puras, sin base de datos.
 *
 * Vive separado de `brand-lifecycle.ts` (que sí toca Supabase) por dos razones:
 * los componentes de cliente pueden importarlo sin arrastrar el cliente
 * `service_role`, y las reglas se pueden probar sin montar nada.
 *
 * Vocabulario, que conviene fijar porque la interfaz y la base no coinciden a
 * propósito:
 *
 *   - En la base el estado es **`paused`**. Se reutiliza un valor que
 *     `public.cm_clients.status` ya admite; no se inventa ningún estado nuevo.
 *   - Al cliente se le muestra **«Inactiva»**, que es lo que significa para él:
 *     la marca no recibe nada. «Pausada» sugeriría algo temporal y automático.
 */

/** Estado interno de una marca desactivada. */
export const BRAND_STATUS_PAUSED = "paused";

/** Estado al que vuelve una marca reactivada si no se conoce el anterior. */
export const BRAND_STATUS_ACTIVE = "active";

/** Etiqueta que ve el cliente. Nunca se le muestra la palabra «paused». */
export const BRAND_INACTIVE_LABEL = "Inactiva";

/**
 * Estados que cuentan como marca operativa y **consumen cupo**.
 *
 * Debe coincidir exactamente con el filtro de la migración 036 y con el de
 * `countUsage()` en `billing/service.ts`. La regla real es por **exclusión**
 * (todo lo que no sea `paused` cuenta), no por lista blanca: así un estado
 * futuro cuenta por defecto en vez de desaparecer en silencio del cupo.
 */
export const OPERATIONAL_BRAND_STATUSES = ["active", "onboarding"] as const;

/**
 * Respuesta a un proveedor cuando el evento llega para una marca inactiva.
 *
 * Es 200 a propósito: un 4xx o un 5xx haría que Meta, WhatsApp o Respond.io
 * reintentaran el mismo evento durante horas y acabaran degradando la
 * suscripción del webhook. Se acusa recibo y se descarta.
 */
export const INACTIVE_BRAND_INTAKE_RESPONSE = {
  ok: true,
  ignored: "inactive_brand",
} as const;

/** Motivo con el que se anota un canal que no se pudo restaurar. */
export type ChannelReactivationNote =
  | "token_expired"
  | "previously_inactive"
  | "channel_missing";

/**
 * Motivos que exigen intervención del operador.
 *
 * `previously_inactive` queda fuera a propósito: ese canal ya estaba caído
 * antes de la pausa, así que no es algo que la pausa haya roto ni que la
 * reactivación deba avisar.
 */
export const RECONNECTION_NOTES: ChannelReactivationNote[] = [
  "token_expired",
  "channel_missing",
];

export function isPausedBrandStatus(status: string | null | undefined): boolean {
  return status === BRAND_STATUS_PAUSED;
}

/**
 * Por exclusión, igual que el SQL: cualquier estado distinto de `paused`
 * —incluido `null`— es operativo y ocupa cupo.
 */
export function isOperationalBrandStatus(status: string | null | undefined): boolean {
  return !isPausedBrandStatus(status);
}

/** Texto que se muestra en la tarjeta de una marca inactiva. */
export const BRAND_INACTIVE_NOTICE =
  "Esta marca está inactiva y no recibe nuevos leads ni mensajes.";

/** Texto del modal de confirmación. Literal acordado con negocio. */
export const BRAND_DEACTIVATE_CONFIRMATION =
  "Esta marca dejará de recibir nuevos leads, mensajes y eventos de sus canales. " +
  "Sus contactos, conversaciones, configuraciones y datos históricos no serán eliminados. " +
  "Podrás reactivarla después. Al desactivarla se liberará su cupo para crear otra marca.";

/** Aviso por canal que no se pudo restaurar al reactivar. */
export function channelReactivationMessage(note: ChannelReactivationNote | null | undefined) {
  if (note === "token_expired") return "Requiere reconexión";
  if (note === "channel_missing") return "Requiere reconexión";
  return null;
}
