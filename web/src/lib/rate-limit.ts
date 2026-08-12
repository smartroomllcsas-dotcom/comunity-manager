// Sliding-window rate limiter con persistencia en DB (smarttalk.rate_limit_hits).
// Fail-open: si DB falla, cae a un contador in-memory local (no bloquea el request).
import { createAdminClient } from "@/lib/supabase/admin";

type Bucket = { hits: number[] };
const memoryBuckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
  backend: "db" | "memory-fallback";
  /**
   * True cuando la ventana persistida no estuvo disponible y el resultado sale
   * del contador en memoria. En serverless ese contador es **por instancia**,
   * así que el límite efectivo se multiplica por el número de workers vivos.
   */
  degraded: boolean;
};

/**
 * Divisor aplicado al límite mientras el contador está degradado (H-09).
 *
 * El problema: el fallback en memoria es por worker. Con N instancias, un
 * límite de 200/min se convierte en 200·N, y eso ocurre precisamente cuando la
 * base está caída — es decir, cuando más falta hace contener el tráfico.
 *
 * La mitigación no es cerrar el paso (eso tiraría cobros y webhooks legítimos
 * durante un incidente de base), sino **endurecer** el límite mientras dura la
 * degradación, de modo que N·(límite/divisor) se aproxime al límite pretendido.
 * Con el valor por defecto, 4 instancias reproducen aproximadamente el límite
 * original.
 *
 * No elimina el problema: sin estado compartido no se puede. Lo acota.
 */
export function degradedLimitDivisor() {
  const parsed = Number.parseInt(process.env.RATE_LIMIT_DEGRADED_DIVISOR || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

/** Límite efectivo mientras el contador está degradado. Nunca baja de 1. */
export function degradedLimit(limit: number) {
  return Math.max(1, Math.floor(limit / degradedLimitDivisor()));
}

/** Chequea rate limit via DB. Registra el hit atómicamente antes del check. Fail-open a memoria si DB falla. */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const admin = createAdminClient("smarttalk");
  const now = new Date();
  const cutoffIso = new Date(now.getTime() - windowMs).toISOString();

  try {
    // 1) Registrar el hit actual
    const { error: insertError } = await admin
      .from("rate_limit_hits")
      .insert({ key, hit_at: now.toISOString() });
    if (insertError) throw insertError;

    // 2) Contar hits dentro de la ventana (incluye el que acabamos de insertar)
    const { count } = await admin
      .from("rate_limit_hits")
      .select("id", { count: "exact", head: true })
      .eq("key", key)
      .gte("hit_at", cutoffIso);

    const totalHits = count ?? 0;

    if (totalHits > limit) {
      // Encontrar el hit más viejo dentro de la ventana para calcular retryAfter
      const { data: oldest } = await admin
        .from("rate_limit_hits")
        .select("hit_at")
        .eq("key", key)
        .gte("hit_at", cutoffIso)
        .order("hit_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const oldestTime = oldest?.hit_at ? new Date(oldest.hit_at as string).getTime() : now.getTime();
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestTime + windowMs - now.getTime()) / 1000));
      return { ok: false, remaining: 0, retryAfterSeconds, backend: "db", degraded: false };
    }

    return {
      ok: true,
      remaining: Math.max(0, limit - totalHits),
      retryAfterSeconds: 0,
      backend: "db",
      degraded: false,
    };
  } catch (error) {
    // H-09: la degradación deja de ser invisible. Un `console.warn` suelto no
    // se puede alertar; una línea estructurada sí, y lleva la clave afectada.
    console.warn(
      `[rate-limit] degraded ${JSON.stringify({
        event: "rate_limit.degraded",
        key,
        limit,
        degradedLimit: degradedLimit(limit),
        reason: error instanceof Error ? error.message : String(error),
      })}`,
    );
    // Se endurece el límite mientras dura la degradación: ver degradedLimitDivisor.
    return memoryRateLimit(key, degradedLimit(limit), windowMs);
  }
}

/** Fallback in-memory por worker. Menos preciso en serverless multi-instancia. */
function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = memoryBuckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((ts) => ts > cutoff);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    memoryBuckets.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds,
      backend: "memory-fallback",
      degraded: true,
    };
  }

  bucket.hits.push(now);
  memoryBuckets.set(key, bucket);
  return {
    ok: true,
    remaining: limit - bucket.hits.length,
    retryAfterSeconds: 0,
    backend: "memory-fallback",
    degraded: true,
  };
}

/**
 * Retención por defecto de `rate_limit_hits`: 1 hora.
 *
 * La ventana más larga en uso es de 60 s, así que una hora deja margen de sobra
 * para cualquier consulta en vuelo.
 */
export const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000;

/**
 * Borra hits fuera de la ventana de retención (H-09).
 *
 * `smarttalk.rate_limit_hits` **no la purgaba nadie**. La migración 013 creó el
 * índice `idx_rate_limit_hit_at` con el comentario «para la limpieza periódica»,
 * pero esa limpieza nunca se implementó.
 *
 * Importa más de lo que parece: cada comprobación hace un `COUNT` sobre la
 * tabla, así que cuanto más crece, más tarda; y cuanto más tarda, más probable
 * es que falle y active el fail-open. Es un bucle que se realimenta.
 *
 * No se invoca desde `rateLimit`: añadir un DELETE a cada petición empeoraría
 * justo lo que se quiere aliviar. Está pensada para un cron.
 */
export async function purgeRateLimitHits(retentionMs = RATE_LIMIT_RETENTION_MS) {
  const admin = createAdminClient("smarttalk");
  const cutoff = new Date(Date.now() - retentionMs).toISOString();

  const { data, error } = await admin
    .from("rate_limit_hits")
    .delete()
    .lt("hit_at", cutoff)
    .select("id");

  if (error) {
    return { purged: 0, ok: false as const, error: error.message };
  }
  return { purged: Array.isArray(data) ? data.length : 0, ok: true as const };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip") || "unknown";
}

let cachedWhitelist: Set<string> | null = null;

function getWhitelist(): Set<string> {
  if (cachedWhitelist) return cachedWhitelist;
  const raw = process.env.RATE_LIMIT_WHITELIST || "";
  cachedWhitelist = new Set(
    raw
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean)
  );
  return cachedWhitelist;
}

/** Devuelve true si el IP está en RATE_LIMIT_WHITELIST (útil para monitors, staff, tests internos). */
export function isWhitelistedIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return getWhitelist().has(ip);
}

/** Wrapper: si el IP está whitelisted, devuelve ok=true sin registrar hit ni chequear DB. */
export async function rateLimitWithWhitelist(
  ip: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (isWhitelistedIp(ip)) {
    return { ok: true, remaining: limit, retryAfterSeconds: 0, backend: "db", degraded: false };
  }
  return rateLimit(key, limit, windowMs);
}
