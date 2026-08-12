// Sprint 25 · Agente K — Cron horario que snapshotea métricas de posts + accounts.
//
// Flujo:
//   1. Query cm_scheduled_posts publicados en los últimos 30d con platform_post_id.
//   2. Para cada post: join a cm_social_accounts, decrypt token, fetch métricas
//      del provider correspondiente, insert en cm_metrics_post.
//   3. Cada 24h (hora 03:00 UTC): también snapshotea cm_metrics_account por cada
//      cuenta activa.
//
// Idempotencia: UNIQUE (post_id, snapshot_at) en la tabla + snapshot_at anclado
// al inicio de la hora actual → un cron retry no duplica el row.
//
// Concurrency per platform (evita rate limits):
//   Meta 10, TikTok 6, LinkedIn 5, Threads 5, GA4 2.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { filterPausedBrandIds } from "@/lib/smarttalk/intake-guard";

import { inngest } from "@/lib/inngest/client";
import { decryptToken } from "@/lib/crypto";

import * as meta from "@/lib/analytics/meta";
import * as tiktok from "@/lib/analytics/tiktok";
import * as linkedin from "@/lib/analytics/linkedin";
import * as threads from "@/lib/analytics/threads";
import * as ga4 from "@/lib/analytics/ga4";
import type { FetchResult, PostMetrics, AccountMetrics } from "@/lib/analytics/types";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getPublicAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "fetch-metrics: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

/** Ancla el snapshot al inicio de la hora UTC actual para que retries no dupliquen. */
function currentHourSnapshotIso(): string {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/** Ancla el snapshot diario al inicio del día UTC. */
function currentDaySnapshotIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Mapea el string de plataforma del post/account al provider correspondiente. */
function providerFor(platform: string): {
  key: "meta" | "tiktok" | "linkedin" | "threads" | "ga4";
  fetchPost: (t: string, id: string, o?: { subKind?: string }) => Promise<FetchResult<PostMetrics>>;
  fetchAccount: (t: string, id: string, o?: { subKind?: string }) => Promise<FetchResult<AccountMetrics>>;
} | null {
  // Sub-tipos del composer (fb, ig-feed, ig-reel, ig-story) → Meta.
  if (platform === "fb" || platform === "facebook") {
    return { key: "meta", fetchPost: (t, id) => meta.fetchPostMetrics(t, id, { subKind: "fb" }),
             fetchAccount: (t, id) => meta.fetchAccountMetrics(t, id, { subKind: "fb" }) };
  }
  if (platform === "ig-feed" || platform === "ig-story" || platform === "instagram") {
    return { key: "meta", fetchPost: (t, id) => meta.fetchPostMetrics(t, id, { subKind: "ig-feed" }),
             fetchAccount: (t, id) => meta.fetchAccountMetrics(t, id, { subKind: "ig-feed" }) };
  }
  if (platform === "ig-reel") {
    return { key: "meta", fetchPost: (t, id) => meta.fetchPostMetrics(t, id, { subKind: "ig-reel" }),
             fetchAccount: (t, id) => meta.fetchAccountMetrics(t, id, { subKind: "ig-feed" }) };
  }
  if (platform === "tiktok") {
    return { key: "tiktok", fetchPost: tiktok.fetchPostMetrics, fetchAccount: tiktok.fetchAccountMetrics };
  }
  if (platform === "linkedin-personal") {
    return { key: "linkedin",
             fetchPost: (t, id) => linkedin.fetchPostMetrics(t, id, { subKind: "linkedin-personal" }),
             fetchAccount: linkedin.fetchAccountMetrics };
  }
  if (platform === "linkedin-company" || platform === "linkedin") {
    return { key: "linkedin",
             fetchPost: (t, id) => linkedin.fetchPostMetrics(t, id, { subKind: "linkedin-company" }),
             fetchAccount: linkedin.fetchAccountMetrics };
  }
  if (platform === "threads") {
    return { key: "threads", fetchPost: threads.fetchPostMetrics, fetchAccount: threads.fetchAccountMetrics };
  }
  if (platform === "ga4") {
    return { key: "ga4", fetchPost: ga4.fetchPostMetrics, fetchAccount: ga4.fetchAccountMetrics };
  }
  return null;
}

/** Límites de concurrencia por provider (evita rate limits del canal). */
const CONCURRENCY: Record<string, number> = {
  meta: 10, tiktok: 6, linkedin: 5, threads: 5, ga4: 2,
};

/** Corre `tasks` en paralelo respetando `limit`. Simple pool sin dependencias. */
async function pMap<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type PostRow = {
  id: string;
  platforms: string[] | null;
  platform_post_id: string | null;
  published_at: string | null;
  client_id: string | null;
  social_account_id?: string | null;
};

type AccountRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  platform: string;
  account_id: string;
  ig_user_id: string | null;
  access_token_encrypted: string | null;
  status: string | null;
};

// -----------------------------------------------------------------------------
// Inngest function — cron 0 * * * * (cada hora en punto)
// -----------------------------------------------------------------------------

export const fetchMetrics = inngest.createFunction(
  {
    id: "fetch-metrics",
    name: "Fetch analytics metrics (hourly)",
    retries: 2,
    concurrency: { limit: 1 }, // sólo una ejecución simultánea global
  },
  { cron: "0 * * * *" },
  async ({ step, logger }) => {
    // -----------------------------------------------------------------------
    // 1) Cargar posts publicados en los últimos 30d
    // -----------------------------------------------------------------------
    const posts = await step.run("query-published-posts", async () => {
      const supa = getPublicAdmin();
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supa
        .from("cm_scheduled_posts")
        .select("id, platforms, platform_post_id, published_at, client_id")
        .eq("status", "published")
        .gte("published_at", since)
        .not("platform_post_id", "is", null)
        .limit(2000);
      if (error) throw new Error(`fetch-metrics posts query: ${error.message}`);
      return (data ?? []) as PostRow[];
    });

    logger.info(`fetch-metrics: ${posts.length} published posts to snapshot`);

    // -----------------------------------------------------------------------
    // 2) Precargar cuentas sociales (para tokens) — un query, en memoria
    // Nota: `step.run` sólo puede devolver valores JSON-serializables — no Map.
    // Devolvemos array plano y reconstruimos el índice fuera del step.
    // -----------------------------------------------------------------------
    const accountsList = await step.run("query-accounts", async (): Promise<AccountRow[]> => {
      const supa = getPublicAdmin();
      const { data, error } = await supa
        .from("cm_social_accounts")
        .select("id, organization_id, client_id, platform, account_id, ig_user_id, access_token_encrypted, status")
        .eq("status", "active");
      if (error) throw new Error(`fetch-metrics accounts query: ${error.message}`);
      return (data ?? []) as AccountRow[];
    });

    // Las métricas periódicas se omiten para marcas inactivas. Los datos
    // históricos ya calculados permanecen.
    const pausedClientIds = await filterPausedBrandIds(
      accountsList.map((acc) => acc.client_id).filter((id): id is string => Boolean(id)),
    );

    const accountsByLookup = new Map<string, AccountRow>();
    for (const acc of accountsList) {
      if (acc.client_id && pausedClientIds.has(acc.client_id)) continue;
      accountsByLookup.set(`${acc.client_id ?? ""}::${acc.platform}`, acc);
    }

    // -----------------------------------------------------------------------
    // 3) Agrupar posts por platform, respetar concurrency por provider
    // -----------------------------------------------------------------------
    const snapshotAt = currentHourSnapshotIso();
    type Task = { post: PostRow; platform: string; account: AccountRow };
    const tasks: Task[] = [];

    for (const post of posts) {
      const platforms = post.platforms ?? [];
      for (const platform of platforms) {
        // Cuenta social del cliente para esta plataforma.
        const acc = accountsByLookup.get(`${post.client_id ?? ""}::${normalizeAccPlatform(platform)}`);
        if (!acc || !acc.access_token_encrypted) continue;
        if (!post.platform_post_id) continue;
        tasks.push({ post, platform, account: acc });
      }
    }

    const byProvider = new Map<string, Task[]>();
    for (const t of tasks) {
      const prov = providerFor(t.platform);
      if (!prov) continue;
      const arr = byProvider.get(prov.key) ?? [];
      arr.push(t);
      byProvider.set(prov.key, arr);
    }

    let snapshotted = 0;
    let errors = 0;

    for (const [providerKey, group] of byProvider) {
      const limit = CONCURRENCY[providerKey] ?? 5;
      const results = await pMap(group, limit, async (t) => {
        const prov = providerFor(t.platform)!;
        let token: string;
        try {
          token = decryptToken(t.account.access_token_encrypted!);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`fetch-metrics: decrypt failed acc=${t.account.id}: ${msg}`);
          return { ok: false as const };
        }
        // Para IG el "platform_post_id" es un IG media id — el token del page
        // sirve para /insights.
        const id = t.post.platform_post_id!;
        const res = await prov.fetchPost(token, id);
        if (!res.ok) {
          logger.warn(`fetch-metrics: ${t.platform} post=${t.post.id}: ${res.error}`);
          return { ok: false as const };
        }
        return { ok: true as const, task: t, metrics: res };
      });

      // Persistir snapshots (batch por provider).
      const rows = results
        .filter((r): r is { ok: true; task: Task; metrics: FetchResult<PostMetrics> & { ok: true } } => r.ok)
        .map((r) => ({
          post_id: r.task.post.id,
          social_account_id: r.task.account.id,
          platform: r.task.platform,
          platform_post_id: r.task.post.platform_post_id!,
          snapshot_at: snapshotAt,
          impressions: r.metrics.impressions,
          reach: r.metrics.reach,
          likes: r.metrics.likes,
          comments: r.metrics.comments,
          shares: r.metrics.shares,
          saves: r.metrics.saves,
          clicks: r.metrics.clicks,
          video_views: r.metrics.video_views ?? 0,
          video_completion_rate: r.metrics.video_completion_rate ?? null,
          engagement_rate: r.metrics.engagement_rate,
          raw_payload: r.metrics.raw ?? null,
        }));

      errors += results.filter((r) => !r.ok).length;

      if (rows.length > 0) {
        await step.run(`insert-post-metrics-${providerKey}`, async () => {
          const supa = getPublicAdmin();
          // upsert con onConflict para respetar la UNIQUE (post_id, snapshot_at)
          const { error } = await supa
            .from("cm_metrics_post")
            .upsert(rows, { onConflict: "post_id,snapshot_at", ignoreDuplicates: true });
          if (error) throw new Error(`fetch-metrics upsert ${providerKey}: ${error.message}`);
        });
        snapshotted += rows.length;
      }
    }

    // -----------------------------------------------------------------------
    // 4) Cada 24h — snapshot account-level (hora 03:00 UTC exacta)
    // -----------------------------------------------------------------------
    const nowHour = new Date().getUTCHours();
    let accountSnapshots = 0;
    if (nowHour === 3) {
      const daySnap = currentDaySnapshotIso();

      // Agrupar por provider
      const accByProv = new Map<string, AccountRow[]>();
      for (const a of accountsList) {
        const prov = providerFor(a.platform);
        if (!prov || !a.access_token_encrypted) continue;
        const arr = accByProv.get(prov.key) ?? [];
        arr.push(a);
        accByProv.set(prov.key, arr);
      }

      for (const [providerKey, group] of accByProv) {
        const limit = CONCURRENCY[providerKey] ?? 5;
        const accRes = await pMap(group, limit, async (a) => {
          const prov = providerFor(a.platform)!;
          let token: string;
          try { token = decryptToken(a.access_token_encrypted!); }
          catch { return { ok: false as const, acc: a }; }
          const id = a.ig_user_id || a.account_id;
          const res = await prov.fetchAccount(token, id);
          return { ok: res.ok, acc: a, res };
        });

        const rows = accRes
          .filter((r): r is { ok: true; acc: AccountRow; res: FetchResult<AccountMetrics> & { ok: true } } => r.ok === true && "res" in r && r.res.ok)
          .map((r) => ({
            social_account_id: r.acc.id,
            client_id: r.acc.client_id,
            organization_id: r.acc.organization_id,
            platform: r.acc.platform,
            snapshot_at: daySnap,
            followers: r.res.followers,
            followers_delta_30d: r.res.followers_delta_30d,
            posts_published_30d: r.res.posts_published_30d,
            total_engagement_30d: r.res.total_engagement_30d,
            avg_engagement_rate_30d: r.res.avg_engagement_rate_30d,
            raw_payload: r.res.raw ?? null,
          }));

        if (rows.length > 0) {
          await step.run(`insert-account-metrics-${providerKey}`, async () => {
            const supa = getPublicAdmin();
            const { error } = await supa
              .from("cm_metrics_account")
              .upsert(rows, { onConflict: "social_account_id,snapshot_at", ignoreDuplicates: true });
            if (error) throw new Error(`fetch-metrics account upsert ${providerKey}: ${error.message}`);
          });
          accountSnapshots += rows.length;
        }
      }
    }

    const summary = {
      posts_scanned: posts.length,
      snapshots_written: snapshotted,
      account_snapshots_written: accountSnapshots,
      errors,
      snapshot_at: snapshotAt,
    };
    logger.info(`fetch-metrics done: ${JSON.stringify(summary)}`);
    return summary;
  },
);

/**
 * Convierte el "platform" del composer (ig-feed, ig-reel, fb, linkedin-personal…)
 * al `platform` normalizado que guarda cm_social_accounts (instagram, facebook,
 * linkedin, tiktok, threads).
 */
function normalizeAccPlatform(composerPlatform: string): string {
  if (composerPlatform.startsWith("ig-")) return "instagram";
  if (composerPlatform === "fb") return "facebook";
  if (composerPlatform.startsWith("linkedin")) return "linkedin";
  return composerPlatform; // tiktok, threads, x, youtube, etc.
}
