/**
 * Sprint 25 · Inngest cron - fetch mentions cross-platform (every 15 min).
 *
 * Flow:
 *  1. Query cm_social_accounts WHERE status='active', join client_id.
 *  2. Per account: since = metadata.last_mentions_fetch || now - 24h.
 *  3. Call platform-specific fetcher (facebook/instagram/tiktok/linkedin/threads).
 *  4. Batch sentiment via Haiku (50 per call).
 *  5. INSERT ON CONFLICT DO NOTHING (UNIQUE platform/source_url/author_handle
 *     dedupes cross-run duplicates).
 *  6. Bump cm_social_accounts.metadata.last_mentions_fetch = now().
 *
 * Each account is a separate `step.run` so retries are isolated.
 */

import Anthropic from "@anthropic-ai/sdk";
import { filterPausedBrandIds } from "@/lib/smarttalk/intake-guard";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { decryptToken } from "@/lib/crypto";
import {
  fetchMetaMentions,
  fetchTikTokMentions,
  fetchLinkedInMentions,
  fetchThreadsMentions,
  type Mention,
} from "@/lib/listening/fetchers";
import {
  analyzeSentimentBatch,
  type SentimentResult,
} from "@/lib/listening/sentiment";

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "fetch-mentions: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

type ActiveAccount = {
  id: string;
  organization_id: string;
  client_id: string | null;
  platform: string;
  account_id: string;
  access_token_encrypted: string | null;
  metadata: Record<string, unknown> | null;
};

type ClientRow = { id: string; brand_name?: string | null; name?: string | null };

const DEFAULT_LOOKBACK_HOURS = 24;

export const fetchMentions = inngest.createFunction(
  {
    id: "fetch-mentions",
    name: "Fetch community mentions (listening)",
    retries: 2,
    concurrency: { limit: 3 },
  },
  { cron: "*/15 * * * *" },
  async ({ step, logger }) => {
    const accounts = await step.run("load-active-accounts", async () => {
      const supabase = getPublicAdmin();
      const { data, error } = await supabase
        .from("cm_social_accounts")
        .select(
          "id, organization_id, client_id, platform, account_id, access_token_encrypted, metadata, status",
        )
        .eq("status", "active");
      if (error) {
        logger.error("load-active-accounts", { msg: error.message });
        return [] as ActiveAccount[];
      }
      return (data ?? []) as ActiveAccount[];
    });

    if (accounts.length === 0) {
      return { accounts: 0, inserted: 0 };
    }

    // Cache brand names per client_id (used for the Haiku prompt).
    const clientIds = Array.from(
      new Set(
        accounts
          .map((a) => a.client_id)
          .filter((v): v is string => typeof v === "string"),
      ),
    );
    const clientBrand = await step.run("load-clients", async () => {
      if (clientIds.length === 0) return {} as Record<string, string>;
      const supabase = getPublicAdmin();
      const { data } = await supabase
        .from("cm_clients")
        .select("id, brand_name, name")
        .in("id", clientIds);
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as ClientRow[]) {
        map[c.id] = c.brand_name || c.name || "la marca";
      }
      return map;
    });

    const pausedClientIds = await step.run("load-paused-clients", async () =>
      Array.from(await filterPausedBrandIds(clientIds)),
    ).then((ids) => new Set(ids as string[]));

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const anthropic = anthropicKey
      ? new Anthropic({ apiKey: anthropicKey })
      : null;

    let totalInserted = 0;

    for (const account of accounts) {
      if (!account.client_id || !account.access_token_encrypted) continue;
      // Una marca inactiva no consulta menciones nuevas. Las ya guardadas se
      // conservan y siguen consultables.
      if (pausedClientIds.has(account.client_id)) continue;

      const stepId = `process-${account.id}`;
      const inserted = await step.run(stepId, async () => {
        // Decrypt token (never logged).
        let token: string;
        try {
          token = decryptToken(account.access_token_encrypted!);
        } catch (err) {
          logger.warn("token-decrypt-failed", {
            account_id: account.id,
            platform: account.platform,
            msg: err instanceof Error ? err.message : "unknown",
          });
          return 0;
        }

        const lastFetchRaw = (account.metadata ?? {})[
          "last_mentions_fetch"
        ];
        const since =
          typeof lastFetchRaw === "string"
            ? new Date(lastFetchRaw)
            : new Date(
                Date.now() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000,
              );

        let raw: Mention[] = [];
        try {
          switch (account.platform) {
            case "facebook":
            case "instagram":
              raw = await fetchMetaMentions(token, account.account_id, since);
              break;
            case "tiktok":
              raw = await fetchTikTokMentions(
                token,
                account.account_id,
                since,
              );
              break;
            case "linkedin":
              raw = await fetchLinkedInMentions(
                token,
                account.account_id,
                since,
              );
              break;
            case "threads":
              raw = await fetchThreadsMentions(
                token,
                account.account_id,
                since,
              );
              break;
            default:
              return 0;
          }
        } catch (err) {
          logger.warn("fetcher-error", {
            platform: account.platform,
            msg: err instanceof Error ? err.message : "unknown",
          });
          return 0;
        }

        if (raw.length === 0) {
          // Still bump the cursor so we do not re-scan the same empty window.
          await bumpCursor(account.id, account.metadata ?? {});
          return 0;
        }

        // Sentiment (Haiku). If no API key or no client -> label all neutral.
        const brandName = clientBrand[account.client_id!] || "la marca";
        const sentiments: SentimentResult[] = anthropic
          ? await analyzeSentimentBatch(
              raw.map((m) => ({ content: m.content, language: "es" })),
              anthropic,
              brandName,
            )
          : raw.map<SentimentResult>(() => ({
              sentiment_score: 0,
              sentiment_label: "neutral",
              intent_label: "question",
              urgency_score: 1,
            }));

        const rows = raw.map((m, i) => ({
          client_id: account.client_id,
          organization_id: account.organization_id,
          platform: m.platform,
          source_type: m.source_type,
          source_url: m.source_url ?? null,
          author_handle: m.author_handle,
          author_followers: m.author_followers ?? null,
          content: m.content,
          language: "es",
          sentiment_score: sentiments[i]?.sentiment_score ?? 0,
          sentiment_label: sentiments[i]?.sentiment_label ?? "neutral",
          intent_label: sentiments[i]?.intent_label ?? "question",
          urgency_score: sentiments[i]?.urgency_score ?? 1,
          is_processed: false,
          metadata: sentiments[i]?.reasoning
            ? { reasoning: sentiments[i]!.reasoning }
            : {},
          fetched_at: m.fetched_at,
        }));

        const supabase = getPublicAdmin();
        const { data: upserted, error } = await supabase
          .from("cm_mentions")
          .upsert(rows, {
            onConflict: "platform,source_url,author_handle",
            ignoreDuplicates: true,
          })
          .select("id");
        if (error) {
          logger.warn("insert-mentions-error", {
            msg: error.message,
            count: rows.length,
          });
          return 0;
        }

        await bumpCursor(account.id, account.metadata ?? {});
        return upserted?.length ?? 0;
      });

      totalInserted += inserted;
    }

    return { accounts: accounts.length, inserted: totalInserted };
  },
);

async function bumpCursor(
  accountId: string,
  currentMeta: Record<string, unknown>,
) {
  const supabase = getPublicAdmin();
  await supabase
    .from("cm_social_accounts")
    .update({
      metadata: { ...currentMeta, last_mentions_fetch: new Date().toISOString() },
    })
    .eq("id", accountId);
}
