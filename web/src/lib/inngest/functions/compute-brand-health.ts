/**
 * Sprint 25 · Inngest cron - compute brand health score (hourly).
 *
 * Health score formula (0-100):
 *   base = 50
 *   + sentiment_avg * 30      (sentiment_avg in [-1, +1] -> +/-30 pts)
 *   + positive_pct * 0.2      (positive_pct in [0, 100] -> up to +20 pts)
 *   - urgent_count * 5        (each urgency>=4 mention -5 pts, cap at 30)
 *
 * Ejemplo:
 *   85% positive, sentiment_avg = 0.6, 0 urgent
 *   -> 50 + 0.6*30 + 85*0.2 - 0 = 50 + 18 + 17 = 85
 *
 *   40% positive, sentiment_avg = -0.2, 3 urgent
 *   -> 50 + (-6) + 8 - 15 = 37
 *
 * Crisis trigger: sentiment_delta_pct < -20 (i.e. sentiment_avg drops >20%
 * vs previous 24h window) -> emit `cm/listening.crisis.detected`.
 */

import { createClient } from "@supabase/supabase-js";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "compute-brand-health: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

type ClientWithOrg = {
  client_id: string;
  organization_id: string;
};

type StatsBucket = {
  count: number;
  sum: number;
  positive: number;
  neutral: number;
  negative: number;
  urgent: number;
};

function emptyStats(): StatsBucket {
  return {
    count: 0,
    sum: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    urgent: 0,
  };
}

function computeHealthScore(
  sentimentAvg: number,
  positivePct: number,
  urgentCount: number,
): number {
  const raw = 50 + sentimentAvg * 30 + positivePct * 0.2 - urgentCount * 5;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export const computeBrandHealth = inngest.createFunction(
  {
    id: "compute-brand-health",
    name: "Compute brand health score (hourly)",
    retries: 2,
    concurrency: { limit: 3 },
  },
  { cron: "0 * * * *" },
  async ({ step, logger }) => {
    const clients = await step.run("load-clients-with-accounts", async () => {
      const supabase = getPublicAdmin();
      const { data, error } = await supabase
        .from("cm_social_accounts")
        .select("client_id, organization_id, status")
        .eq("status", "active");
      if (error) {
        logger.error("load-clients", { msg: error.message });
        return [] as ClientWithOrg[];
      }
      const seen = new Set<string>();
      const out: ClientWithOrg[] = [];
      for (const row of (data ?? []) as Array<{
        client_id: string | null;
        organization_id: string | null;
      }>) {
        if (!row.client_id || !row.organization_id) continue;
        if (seen.has(row.client_id)) continue;
        seen.add(row.client_id);
        out.push({
          client_id: row.client_id,
          organization_id: row.organization_id,
        });
      }
      return out;
    });

    if (clients.length === 0) return { snapshots: 0, crises: 0 };

    let snapshots = 0;
    let crises = 0;
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const prevStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    for (const c of clients) {
      const result = await step.run(`snapshot-${c.client_id}`, async () => {
        const supabase = getPublicAdmin();

        // Current window (last 24h)
        const { data: cur } = await supabase
          .from("cm_mentions")
          .select("sentiment_score, sentiment_label, urgency_score")
          .eq("client_id", c.client_id)
          .gte("fetched_at", windowStart.toISOString());

        // Previous window (24h..48h ago)
        const { data: prev } = await supabase
          .from("cm_mentions")
          .select("sentiment_score")
          .eq("client_id", c.client_id)
          .gte("fetched_at", prevStart.toISOString())
          .lt("fetched_at", windowStart.toISOString());

        const stats = emptyStats();
        for (const row of (cur ?? []) as Array<{
          sentiment_score: number | null;
          sentiment_label: string | null;
          urgency_score: number | null;
        }>) {
          stats.count++;
          const s = Number(row.sentiment_score ?? 0);
          stats.sum += s;
          if (row.sentiment_label === "positive") stats.positive++;
          else if (row.sentiment_label === "negative") stats.negative++;
          else stats.neutral++;
          if ((row.urgency_score ?? 0) >= 4) stats.urgent++;
        }

        const sentimentAvg = stats.count ? stats.sum / stats.count : 0;
        const positivePct = stats.count
          ? (stats.positive / stats.count) * 100
          : 0;
        const neutralPct = stats.count
          ? (stats.neutral / stats.count) * 100
          : 0;
        const negativePct = stats.count
          ? (stats.negative / stats.count) * 100
          : 0;

        // Delta vs previous window
        let prevAvg = 0;
        const prevRows = (prev ?? []) as Array<{
          sentiment_score: number | null;
        }>;
        if (prevRows.length > 0) {
          prevAvg =
            prevRows.reduce((acc, r) => acc + Number(r.sentiment_score ?? 0), 0) /
            prevRows.length;
        }
        const sentimentDeltaPct =
          prevRows.length > 0 && Math.abs(prevAvg) > 0.001
            ? ((sentimentAvg - prevAvg) / Math.abs(prevAvg)) * 100
            : 0;

        const crisisTriggered = sentimentDeltaPct < -20 && stats.count >= 5;
        const healthScore = computeHealthScore(
          sentimentAvg,
          positivePct,
          stats.urgent,
        );

        const { error: insErr } = await supabase
          .from("cm_brand_health_scores")
          .insert({
            client_id: c.client_id,
            organization_id: c.organization_id,
            snapshot_at: now.toISOString(),
            window_hours: 24,
            mentions_count: stats.count,
            sentiment_avg: Number(sentimentAvg.toFixed(3)),
            sentiment_delta_pct: Number(sentimentDeltaPct.toFixed(3)),
            positive_pct: Number(positivePct.toFixed(2)),
            neutral_pct: Number(neutralPct.toFixed(2)),
            negative_pct: Number(negativePct.toFixed(2)),
            crisis_triggered: crisisTriggered,
            health_score: healthScore,
          });
        if (insErr) {
          logger.warn("insert-snapshot-error", {
            msg: insErr.message,
            client_id: c.client_id,
          });
        }

        if (crisisTriggered) {
          await inngest.send({
            name: INNGEST_EVENTS.LISTENING_CRISIS_DETECTED,
            data: {
              client_id: c.client_id,
              organization_id: c.organization_id,
              health_score: healthScore,
              sentiment_delta_pct: sentimentDeltaPct,
              mentions_count: stats.count,
              urgent_count: stats.urgent,
              snapshot_at: now.toISOString(),
            },
          });
        }

        return { crisis: crisisTriggered ? 1 : 0 };
      });

      snapshots++;
      crises += result.crisis;
    }

    return { snapshots, crises };
  },
);
