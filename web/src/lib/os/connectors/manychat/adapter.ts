/**
 * ManyChat (Chatbot) connector — ported from FounderOS-DEMO.
 *
 * Real-ready probe:
 *   - `not_configured` when neither MANYCHAT_API_KEY nor MANYCHAT_WEBHOOK_SECRET
 *     is present (and no fallback in ~/.config/mcp.json).
 *   - `live` when API key resolves AND `GET /fb/page/getInfo` returns 2xx.
 *   - `configured` when only the webhook secret is present (push-only, no API).
 *   - `error` on 401 / network failure / bad JSON.
 *
 * ManyChat's API cannot list DMs — the live inbox is fed by the webhook route
 * at /api/webhooks/manychat. This adapter only surfaces health + page metadata.
 *
 * Env fallback order (matches FounderOS pattern):
 *   1. process.env.MANYCHAT_API_KEY / MANYCHAT_WEBHOOK_SECRET
 *   2. ~/.config/mcp.json → env.MANYCHAT_API_KEY / env.MANYCHAT_WEBHOOK_SECRET
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConnectorAdapter, ProbeResult } from '../base';

const MANYCHAT_API = 'https://api.manychat.com';
const REQUEST_TIMEOUT_MS = 6000;

type ManyChatCreds = { apiKey?: string; secret?: string };

/**
 * Resolve creds from env, falling back to ~/.config/mcp.json.
 * Silent on any read/parse error — falls back to whatever `process.env` gave us.
 */
function resolveCreds(): ManyChatCreds {
  let apiKey = process.env.MANYCHAT_API_KEY;
  let secret = process.env.MANYCHAT_WEBHOOK_SECRET;
  if (apiKey && secret) return { apiKey, secret };

  try {
    const mcpPath = join(homedir(), '.config', 'mcp.json');
    const raw = readFileSync(mcpPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      env?: Record<string, string>;
      mcpServers?: Record<string, { env?: Record<string, string> }>;
    };
    const envBag: Record<string, string> = {
      ...(parsed.env ?? {}),
      ...Object.values(parsed.mcpServers ?? {}).reduce<Record<string, string>>(
        (acc, srv) => ({ ...acc, ...(srv.env ?? {}) }),
        {},
      ),
    };
    if (!apiKey && envBag.MANYCHAT_API_KEY) apiKey = envBag.MANYCHAT_API_KEY;
    if (!secret && envBag.MANYCHAT_WEBHOOK_SECRET) secret = envBag.MANYCHAT_WEBHOOK_SECRET;
  } catch {
    // File missing or unreadable — env-only mode.
  }
  return { apiKey, secret };
}

type ManyChatPageInfo = {
  pageName: string;
  username: string | null;
  subscriberCount: number | null;
  isPro: boolean;
};

/** Map a `GET /fb/page/getInfo` payload. Null when no usable name is present. */
function parsePageInfo(raw: unknown): ManyChatPageInfo | null {
  const data =
    (raw as { data?: Record<string, unknown> } | null)?.data ??
    (raw as Record<string, unknown> | null);
  const name = data?.name;
  if (typeof name !== 'string' || name.length === 0) return null;
  const username =
    typeof data?.username === 'string' && data.username.length > 0
      ? data.username
      : null;
  const subscribers =
    typeof data?.subscribers === 'number'
      ? data.subscribers
      : typeof data?.subscriber_count === 'number'
        ? data.subscriber_count
        : null;
  return {
    pageName: name,
    username,
    subscriberCount: subscribers,
    isPro: data?.is_pro === true,
  };
}

export const manychatAdapter: ConnectorAdapter = {
  id: 'manychat',
  label: 'ManyChat (Chatbot)',
  kind: 'webhook',
  provider: 'manychat',

  async probe(_orgId: string): Promise<ProbeResult> {
    void _orgId;
    try {
      const { apiKey, secret } = resolveCreds();

      if (!apiKey && !secret) {
        return {
          status: 'not_configured',
          meta: { note: 'MANYCHAT_API_KEY and MANYCHAT_WEBHOOK_SECRET not set' },
        };
      }

      if (apiKey) {
        const res = await fetch(`${MANYCHAT_API}/fb/page/getInfo`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (res.status === 401) {
          return { status: 'error', error: 'Invalid API key' };
        }
        if (!res.ok) {
          return { status: 'error', error: `ManyChat API HTTP ${res.status}` };
        }

        const body = (await res.json()) as unknown;
        const info = parsePageInfo(body);
        if (!info) {
          return { status: 'error', error: 'ManyChat API returned no page info' };
        }
        return {
          status: 'live',
          meta: {
            pageName: info.pageName,
            username: info.username,
            subscriberCount: info.subscriberCount,
            isPro: info.isPro,
            webhookSecretSet: Boolean(secret),
          },
        };
      }

      // secret only, no API key → push-ready but not live-probeable.
      return {
        status: 'configured',
        meta: { note: 'Webhook secret only, no API key' },
      };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};

/**
 * Stats helper — count broadcasts sent + replies received.
 * Stub for Sprint 2: real implementation will read from a `manychat_events`
 * table populated by the webhook route. For now returns zeros so dashboards
 * render without exploding.
 */
export async function manychatBroadcastsSent(): Promise<{
  sent: number;
  replies: number;
}> {
  return { sent: 0, replies: 0 };
}
