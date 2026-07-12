// Sliding-window in-memory rate limiter.
// Serverless caveat: state lives per worker; para multi-instancia usar Redis/Upstash.
type Bucket = { hits: number[] }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs
  const bucket = buckets.get(key) ?? { hits: [] }

  bucket.hits = bucket.hits.filter((ts) => ts > cutoff)

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0]
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    buckets.set(key, bucket)
    return { ok: false, remaining: 0, retryAfterSeconds }
  }

  bucket.hits.push(now)
  buckets.set(key, bucket)
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return headers.get('x-real-ip') || 'unknown'
}
