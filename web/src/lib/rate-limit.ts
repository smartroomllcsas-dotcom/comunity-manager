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
};

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
      return { ok: false, remaining: 0, retryAfterSeconds, backend: "db" };
    }

    return { ok: true, remaining: Math.max(0, limit - totalHits), retryAfterSeconds: 0, backend: "db" };
  } catch (error) {
    console.warn(
      "[rate-limit] DB unavailable, cayendo a memoria local:",
      error instanceof Error ? error.message : String(error)
    );
    return memoryRateLimit(key, limit, windowMs);
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
    return { ok: false, remaining: 0, retryAfterSeconds, backend: "memory-fallback" };
  }

  bucket.hits.push(now);
  memoryBuckets.set(key, bucket);
  return {
    ok: true,
    remaining: limit - bucket.hits.length,
    retryAfterSeconds: 0,
    backend: "memory-fallback",
  };
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
    return { ok: true, remaining: limit, retryAfterSeconds: 0, backend: "db" };
  }
  return rateLimit(key, limit, windowMs);
}
