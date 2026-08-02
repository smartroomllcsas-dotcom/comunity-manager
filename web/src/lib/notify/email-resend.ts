/**
 * Sprint 26 · Agente Q — Resend email client.
 *
 * Thin fetch wrapper (no SDK) around https://api.resend.com/emails.
 * Never throws for expected failures (missing key, HTTP != 2xx). Returns
 * { ok, id?, error? } — caller decides what to do.
 *
 * Env:
 *   RESEND_API_KEY       required — Bearer token (never logged)
 *   RESEND_FROM_EMAIL    optional — default sender, else `noreply@comunitymanager.io`
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "noreply@comunitymanager.io";
const FETCH_TIMEOUT_MS = 15_000;

export interface EmailAttachment {
  filename: string;
  content: string | Buffer; // base64 string or Buffer (converted to base64 on send)
  contentType?: string;
}

export interface EmailPayload {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

function toBase64(content: string | Buffer): string {
  if (Buffer.isBuffer(content)) return content.toString("base64");
  // If caller already sent base64, keep as-is; heuristic: only [A-Za-z0-9+/=]
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(content) && content.length % 4 === 0) return content;
  return Buffer.from(content, "utf-8").toString("base64");
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const from = payload.from || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  const body: Record<string, unknown> = {
    from,
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
    subject: payload.subject,
    html: payload.html,
  };
  if (payload.text) body.text = payload.text;
  if (payload.replyTo) body.reply_to = payload.replyTo;
  if (payload.attachments && payload.attachments.length > 0) {
    body.attachments = payload.attachments.map((a) => ({
      filename: a.filename,
      content: toBase64(a.content),
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      const err = json?.message || json?.name || `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    return { ok: true, id: json.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes("aborted") ? "timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}
