/**
 * Log estructurado de billing con `correlation_id` obligatorio (H-05).
 *
 * El problema que resuelve: `subscription_events.correlation_id` identificaba
 * cada transición en la base, pero **ningún log lo mencionaba**. Ante un
 * incidente no había forma de unir una línea de log con la fila que la
 * explica, así que reconstruir la secuencia exigía adivinar por marca de
 * tiempo.
 *
 * Regla: el identificador nunca se inventa aquí. Se pasa el que ya existe en el
 * dominio —la clave del evento del proveedor, el id del checkout, el de la
 * suscripción— para que log y base compartan la misma cadena. Los prefijos son
 * los mismos que usa `subscription_events`: `cancel:`, `resume:`, `admin:`,
 * `lifecycle:`, `plan-change:`.
 */

export type BillingLogLevel = "info" | "warn" | "error";

export interface BillingLogContext {
  /** Identificador que permite unir esta línea con la fila que la explica. */
  correlationId: string;
  organizationId?: string | null;
  subscriptionId?: string | null;
  [key: string]: unknown;
}

/**
 * Emite una línea JSON con `event` y `correlation_id` siempre presentes.
 *
 * Se serializa en una sola línea porque los logs de Vercel se consultan por
 * texto: así se puede filtrar por `correlation_id` y recuperar toda la
 * secuencia de un incidente sin abrir cada invocación.
 */
export function billingLog(
  level: BillingLogLevel,
  event: string,
  context: BillingLogContext,
) {
  const { correlationId, organizationId, subscriptionId, ...rest } = context;
  const payload = {
    event,
    correlation_id: correlationId,
    ...(organizationId ? { organization_id: organizationId } : {}),
    ...(subscriptionId ? { subscription_id: subscriptionId } : {}),
    ...rest,
  };

  const line = `[billing] ${event} ${JSON.stringify(payload)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Atajo para el caso más común: algo falló y hay que poder rastrearlo. */
export function billingError(event: string, context: BillingLogContext) {
  billingLog("error", event, context);
}

export function billingWarn(event: string, context: BillingLogContext) {
  billingLog("warn", event, context);
}

/**
 * Correlación de una petición de checkout.
 *
 * La `Idempotency-Key` es la única cadena que el cliente, la fila de
 * `checkout_sessions` y el log comparten, así que es el mejor ancla.
 */
export function checkoutCorrelationId(idempotencyKey: string) {
  return `checkout:${idempotencyKey}`;
}

/** Correlación de una confirmación del proveedor: su clave de transacción. */
export function providerEventCorrelationId(provider: string, eventKey: string) {
  return `${provider}:${eventKey}`;
}
