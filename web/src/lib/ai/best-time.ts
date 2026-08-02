/**
 * Sprint 25 · IA aplicada v2 — Best-time suggestion.
 *
 * Sugiere hora óptima para publicar por (client, platform). Query a
 * `cm_metrics_post` últimos 90d, group by hour of day, max engagement_rate.
 * Fallback a benchmarks de industria si no hay data suficiente.
 *
 * Nota: la calidad mejora con volumen. Con <20 posts históricos el confidence
 * baja y devolvemos fallback.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface BestTimeResult {
  hour: number;
  confidence: number;
  source: "historical" | "industry-fallback";
  sample_size?: number;
  day_of_week?: number;
}

// Benchmarks de industria (hora local del brand). Fuente: Sprout/Buffer
// promedios agregados 2024-2025. Ajustar cuando haya data real.
const INDUSTRY_FALLBACK: Record<string, number> = {
  instagram: 19,
  "ig-feed": 19,
  "ig-reel": 20,
  tiktok: 21,
  linkedin: 8,
  facebook: 13,
  fb: 13,
  x: 12,
  twitter: 12,
  threads: 18,
  pinterest: 20,
  youtube: 17,
  whatsapp: 10,
};

const MIN_SAMPLE_FOR_HISTORICAL = 20;
const LOOKBACK_DAYS = 90;

interface MetricRow {
  posted_at?: string | null;
  scheduled_at?: string | null;
  created_at?: string | null;
  engagement_rate?: number | null;
  hour_of_day?: number | null;
}

function normalizePlatformKey(platform: string): string {
  return platform.toLowerCase().trim();
}

function fallback(platform: string): BestTimeResult {
  const key = normalizePlatformKey(platform);
  const hour = INDUSTRY_FALLBACK[key] ?? 12;
  return {
    hour,
    confidence: 0.3,
    source: "industry-fallback",
  };
}

/**
 * Extract hour of day (0-23) desde varios posibles campos de una row.
 * Prefiere `hour_of_day` si viene precomputado; si no, deriva de timestamp.
 */
function extractHour(row: MetricRow): number | null {
  if (typeof row.hour_of_day === "number" && row.hour_of_day >= 0 && row.hour_of_day < 24) {
    return row.hour_of_day;
  }
  const ts = row.posted_at || row.scheduled_at || row.created_at;
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return d.getHours();
}

export async function suggestBestTime(
  clientId: string,
  platform: string,
  dayOfWeek?: number
): Promise<BestTimeResult> {
  if (!clientId || !platform) return fallback(platform);

  try {
    const admin = createAdminClient("public");
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Query defensiva: seleccionamos columnas comunes que podrían existir en
    // cm_metrics_post. Si la tabla no existe o error, caemos a fallback.
    let query = admin
      .from("cm_metrics_post")
      .select("posted_at, scheduled_at, created_at, engagement_rate, hour_of_day")
      .eq("client_id", clientId)
      .eq("platform", platform)
      .gte("created_at", cutoff)
      .limit(2000);

    const { data, error } = await query;
    if (error || !Array.isArray(data)) {
      return fallback(platform);
    }

    let rows: MetricRow[] = data as MetricRow[];

    // Filtro opcional por día de semana.
    if (typeof dayOfWeek === "number" && dayOfWeek >= 0 && dayOfWeek <= 6) {
      rows = rows.filter((r) => {
        const ts = r.posted_at || r.scheduled_at || r.created_at;
        if (!ts) return false;
        const d = new Date(ts);
        return !isNaN(d.getTime()) && d.getDay() === dayOfWeek;
      });
    }

    if (rows.length < MIN_SAMPLE_FOR_HISTORICAL) {
      return {
        ...fallback(platform),
        sample_size: rows.length,
        day_of_week: dayOfWeek,
      };
    }

    // Agrupa por hora, promedio de engagement_rate.
    const byHour = new Map<number, { total: number; count: number }>();
    for (const row of rows) {
      const hour = extractHour(row);
      if (hour === null) continue;
      const rate = typeof row.engagement_rate === "number" ? row.engagement_rate : 0;
      const bucket = byHour.get(hour) ?? { total: 0, count: 0 };
      bucket.total += rate;
      bucket.count += 1;
      byHour.set(hour, bucket);
    }

    if (byHour.size === 0) {
      return { ...fallback(platform), sample_size: 0, day_of_week: dayOfWeek };
    }

    let bestHour = 12;
    let bestAvg = -Infinity;
    for (const [hour, { total, count }] of byHour.entries()) {
      if (count < 2) continue;
      const avg = total / count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestHour = hour;
      }
    }

    // Confidence heurística: sube con sample size, cap en 0.9.
    const confidence = Math.min(0.9, 0.4 + rows.length / 500);

    return {
      hour: bestHour,
      confidence: Math.round(confidence * 100) / 100,
      source: "historical",
      sample_size: rows.length,
      day_of_week: dayOfWeek,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[best-time] DB error, cayendo a fallback: ${msg}`);
    return fallback(platform);
  }
}
