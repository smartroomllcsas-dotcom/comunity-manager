// Sprint 25 · Agente K — Endpoint agregado de analytics para el dashboard.
//
// GET /api/analytics
//   ?client_id=<uuid>            (opcional; si falta agrega todos los del user)
//   &range=7d|30d|90d            (default 30d)
//   &platforms=fb,ig-feed,tiktok (opcional; CSV, default todas)
//   &mock=1                      (opcional; devuelve datos sintéticos para probar UI sin API real)
//
// Auth: Supabase auth cookie → user requerido.
// Rate-limit: 60/min por user.
//
// Retorna:
//   {
//     range: "30d",
//     summary: { impressions, engagement, growth, top_platform },
//     by_platform: [ { platform, impressions, engagement, posts } ],
//     top_posts:   [ { post_id, platform, impressions, engagement_rate, ... } ],
//     timeseries:  [ { date, impressions, engagement } ]
//   }

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("analytics: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createSbClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

async function requireUser() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

type MetricRow = {
  post_id: string;
  platform: string;
  snapshot_at: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  engagement_rate: number | null;
};

type AccountSnap = {
  social_account_id: string;
  platform: string;
  snapshot_at: string;
  followers: number | null;
};

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 60/min por user
  const rl = await rateLimit(`analytics:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const days = RANGE_DAYS[range] ?? 30;
  const clientId = url.searchParams.get("client_id");
  const platformsCsv = url.searchParams.get("platforms");
  const platformsFilter = platformsCsv
    ? platformsCsv.split(",").map((p) => p.trim()).filter(Boolean)
    : null;
  const mock = url.searchParams.get("mock") === "1";

  if (mock) {
    return NextResponse.json(buildMockResponse(range, days, platformsFilter));
  }

  const supa = getPublicAdmin();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // ---- Post metrics: para cada post, tomamos SÓLO el snapshot más reciente
  //      dentro del rango. Postgres no permite DISTINCT ON a través de PostgREST
  //      trivialmente, así que traemos todos los snapshots (ordenados desc) y
  //      dedupeamos en memoria. Cap 5000 rows — >5000 posts publicados en 30d
  //      es outlier razonable.
  let query = supa
    .from("cm_metrics_post")
    .select("post_id, platform, snapshot_at, impressions, reach, likes, comments, shares, saves, clicks, engagement_rate")
    .gte("snapshot_at", since)
    .order("snapshot_at", { ascending: false })
    .limit(5000);
  if (platformsFilter && platformsFilter.length > 0) {
    query = query.in("platform", platformsFilter);
  }
  const { data: rawMetrics, error: mErr } = await query;
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  // Filtro por client_id: cm_metrics_post no tiene client_id → join a
  // cm_scheduled_posts.
  let allowedPostIds: Set<string> | null = null;
  if (clientId) {
    const { data: postsForClient, error: pErr } = await supa
      .from("cm_scheduled_posts")
      .select("id")
      .eq("client_id", clientId)
      .eq("status", "published")
      .gte("published_at", since);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    allowedPostIds = new Set((postsForClient ?? []).map((r: { id: string }) => r.id));
  }

  const metrics = (rawMetrics ?? []) as MetricRow[];
  const filtered = allowedPostIds
    ? metrics.filter((m) => allowedPostIds!.has(m.post_id))
    : metrics;

  // Dedupe por post_id — quedarse con el snapshot más reciente (ya viene desc).
  const latestByPost = new Map<string, MetricRow>();
  for (const m of filtered) {
    if (!latestByPost.has(m.post_id)) latestByPost.set(m.post_id, m);
  }
  const latest = [...latestByPost.values()];

  // ---- Summary
  const totalImpressions = latest.reduce((s, m) => s + (m.impressions ?? 0), 0);
  const totalEngagement = latest.reduce(
    (s, m) => s + ((m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)),
    0,
  );

  // ---- By platform
  const byPlatMap = new Map<string, { impressions: number; engagement: number; posts: number }>();
  for (const m of latest) {
    const p = byPlatMap.get(m.platform) ?? { impressions: 0, engagement: 0, posts: 0 };
    p.impressions += m.impressions ?? 0;
    p.engagement += (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
    p.posts += 1;
    byPlatMap.set(m.platform, p);
  }
  const byPlatform = [...byPlatMap.entries()]
    .map(([platform, v]) => ({ platform, ...v }))
    .sort((a, b) => b.impressions - a.impressions);
  const topPlatform = byPlatform[0]?.platform ?? null;

  // ---- Top posts (top 10 por engagement absoluto)
  const topPosts = [...latest]
    .map((m) => ({
      post_id: m.post_id,
      platform: m.platform,
      impressions: m.impressions ?? 0,
      likes: m.likes ?? 0,
      comments: m.comments ?? 0,
      shares: m.shares ?? 0,
      saves: m.saves ?? 0,
      clicks: m.clicks ?? 0,
      engagement_rate: m.engagement_rate ?? 0,
      snapshot_at: m.snapshot_at,
    }))
    .sort(
      (a, b) =>
        (b.likes + b.comments + b.shares + b.saves) -
        (a.likes + a.comments + a.shares + a.saves),
    )
    .slice(0, 10);

  // ---- Timeseries: sumar impressions + engagement por día
  //      Usamos TODOS los snapshots (no sólo el latest), agrupando por (post_id, día)
  //      → tomamos el snapshot más reciente de cada post en cada día.
  const perDayLatest = new Map<string, Map<string, MetricRow>>(); // date → post_id → row
  for (const m of filtered) {
    const day = m.snapshot_at.slice(0, 10);
    let dayMap = perDayLatest.get(day);
    if (!dayMap) { dayMap = new Map(); perDayLatest.set(day, dayMap); }
    if (!dayMap.has(m.post_id)) dayMap.set(m.post_id, m); // filtered viene desc → primero = latest
  }

  const timeseries: Array<{ date: string; impressions: number; engagement: number }> = [];
  const daysSorted = [...perDayLatest.keys()].sort();
  for (const day of daysSorted) {
    const rows = perDayLatest.get(day)!;
    let impr = 0, eng = 0;
    for (const r of rows.values()) {
      impr += r.impressions ?? 0;
      eng += (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.saves ?? 0);
    }
    timeseries.push({ date: day, impressions: impr, engagement: eng });
  }

  // ---- Growth: comparar followers snapshot más reciente vs. hace `days` días.
  //      Traemos cm_metrics_account del rango.
  let accountQuery = supa
    .from("cm_metrics_account")
    .select("social_account_id, platform, snapshot_at, followers")
    .gte("snapshot_at", since)
    .order("snapshot_at", { ascending: true })
    .limit(2000);
  if (clientId) accountQuery = accountQuery.eq("client_id", clientId);
  const { data: accSnaps } = await accountQuery;
  const growth = computeGrowth((accSnaps ?? []) as AccountSnap[]);

  return NextResponse.json({
    range,
    days,
    summary: {
      impressions: totalImpressions,
      engagement: totalEngagement,
      growth,
      top_platform: topPlatform,
      posts_published: latest.length,
    },
    by_platform: byPlatform,
    top_posts: topPosts,
    timeseries,
  });
}

// -----------------------------------------------------------------------------
// Growth = (followers ahora - followers al inicio del rango) sumado por account
// -----------------------------------------------------------------------------
function computeGrowth(snaps: AccountSnap[]): number {
  const perAcc = new Map<string, { first: number; last: number }>();
  for (const s of snaps) {
    const cur = perAcc.get(s.social_account_id);
    const f = s.followers ?? 0;
    if (!cur) {
      perAcc.set(s.social_account_id, { first: f, last: f });
    } else {
      cur.last = f; // snaps viene asc → sobrescribimos last
    }
  }
  let growth = 0;
  for (const v of perAcc.values()) growth += (v.last - v.first);
  return growth;
}

// -----------------------------------------------------------------------------
// Mock — datos sintéticos para probar la UI sin API real
// -----------------------------------------------------------------------------
function buildMockResponse(range: string, days: number, platformsFilter: string[] | null) {
  const allPlatforms = ["ig-feed", "fb", "tiktok", "linkedin-company", "threads"];
  const platforms = platformsFilter && platformsFilter.length > 0 ? platformsFilter : allPlatforms;

  // seeded pseudo-random para consistencia entre requests
  const seedFrom = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10_000) / 10_000; };
  };
  const rand = seedFrom(`${range}-${platforms.join(",")}`);

  const byPlatform = platforms.map((p) => {
    const impressions = Math.floor(5_000 + rand() * 40_000);
    const engagement = Math.floor(impressions * (0.02 + rand() * 0.08));
    return { platform: p, impressions, engagement, posts: Math.floor(3 + rand() * 20) };
  }).sort((a, b) => b.impressions - a.impressions);

  const totalImpressions = byPlatform.reduce((s, p) => s + p.impressions, 0);
  const totalEngagement = byPlatform.reduce((s, p) => s + p.engagement, 0);
  const posts = byPlatform.reduce((s, p) => s + p.posts, 0);

  const topPosts = Array.from({ length: 8 }, (_, i) => {
    const platform = platforms[i % platforms.length];
    const impressions = Math.floor(500 + rand() * 8_000);
    const likes = Math.floor(impressions * (0.03 + rand() * 0.06));
    const comments = Math.floor(likes * 0.15);
    const shares = Math.floor(likes * 0.08);
    const saves = Math.floor(likes * 0.05);
    return {
      post_id: `mock-post-${i + 1}`,
      platform,
      impressions,
      likes, comments, shares, saves,
      clicks: Math.floor(impressions * 0.02),
      engagement_rate: (likes + comments + shares + saves) / Math.max(impressions, 1),
      snapshot_at: new Date().toISOString(),
    };
  });

  const timeseries: Array<{ date: string; impressions: number; engagement: number }> = [];
  const now = Date.now();
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now - d * 86400_000).toISOString().slice(0, 10);
    const baseImpr = Math.floor(totalImpressions / days);
    const jitter = 0.6 + rand() * 0.8;
    const impressions = Math.floor(baseImpr * jitter);
    timeseries.push({
      date: day,
      impressions,
      engagement: Math.floor(impressions * (0.03 + rand() * 0.05)),
    });
  }

  return {
    range, days, mock: true,
    summary: {
      impressions: totalImpressions,
      engagement: totalEngagement,
      growth: Math.floor(50 + rand() * 500),
      top_platform: byPlatform[0]?.platform ?? null,
      posts_published: posts,
    },
    by_platform: byPlatform,
    top_posts: topPosts,
    timeseries,
  };
}
