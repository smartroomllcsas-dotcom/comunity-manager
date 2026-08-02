/**
 * Sprint 26 · Agente Q — Slack client.
 *
 * Two modes:
 *   1. Incoming webhook: pass `webhookUrl` (or env SLACK_WEBHOOK_URL). Simplest,
 *      only supports the target channel of that webhook.
 *   2. Bot token: env SLACK_BOT_TOKEN → uses chat.postMessage; supports any
 *      channel the bot is a member of (payload.channel required).
 *
 * Never throws for expected failures. Returns { ok, id?, error? } where `id`
 * is the message `ts` (bot mode only — webhooks don't return it).
 */

const WEBHOOK_TIMEOUT_MS = 15_000;
const SLACK_POST_MESSAGE = "https://slack.com/api/chat.postMessage";

export interface SlackPayload {
  channel?: string; // required for bot token mode
  text: string;
  blocks?: unknown[];
  attachments?: unknown[];
}

export interface SlackResult {
  ok: boolean;
  id?: string;
  error?: string;
}

async function timedFetch(url: string, init: RequestInit, timeoutMs = WEBHOOK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaWebhook(url: string, payload: SlackPayload): Promise<SlackResult> {
  try {
    const res = await timedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: payload.text,
        ...(payload.blocks ? { blocks: payload.blocks } : {}),
        ...(payload.attachments ? { attachments: payload.attachments } : {}),
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes("aborted") ? "timeout" : msg };
  }
}

async function sendViaBotToken(token: string, payload: SlackPayload): Promise<SlackResult> {
  if (!payload.channel) {
    return { ok: false, error: "channel required for bot token mode" };
  }
  try {
    const res = await timedFetch(SLACK_POST_MESSAGE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: payload.channel,
        text: payload.text,
        ...(payload.blocks ? { blocks: payload.blocks } : {}),
        ...(payload.attachments ? { attachments: payload.attachments } : {}),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      ts?: string;
      error?: string;
    };
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }
    return { ok: true, id: json.ts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes("aborted") ? "timeout" : msg };
  }
}

export async function sendSlackMessage(
  payload: SlackPayload,
  webhookUrl?: string,
): Promise<SlackResult> {
  const webhook = webhookUrl || process.env.SLACK_WEBHOOK_URL;
  const botToken = process.env.SLACK_BOT_TOKEN;

  // Prefer bot token when a channel is explicitly given AND the token exists,
  // else fall back to webhook (which ignores channel).
  if (payload.channel && botToken) {
    return sendViaBotToken(botToken, payload);
  }
  if (webhook) {
    return sendViaWebhook(webhook, payload);
  }
  if (botToken) {
    return sendViaBotToken(botToken, payload);
  }
  return { ok: false, error: "SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN not configured" };
}
