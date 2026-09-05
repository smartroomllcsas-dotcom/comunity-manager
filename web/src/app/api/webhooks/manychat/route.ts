/**
 * ManyChat webhook receiver.
 * Validates `x-hub-signature-256` against MANYCHAT_WEBHOOK_SECRET (HMAC-SHA256
 * over the raw request body).
 *
 * Responses:
 *   - 200 → signature valid (body is currently a stub for Sprint 2)
 *   - 401 → missing secret env, missing header, malformed header, or bad HMAC
 *
 * The webhook secret can also live in ~/.config/mcp.json under `env.MANYCHAT_WEBHOOK_SECRET`
 * (matches the adapter's fallback pattern).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function resolveSecret(): string | undefined {
  const fromEnv = process.env.MANYCHAT_WEBHOOK_SECRET;
  if (fromEnv) return fromEnv;
  try {
    const mcpPath = join(homedir(), '.config', 'mcp.json');
    const raw = readFileSync(mcpPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      env?: Record<string, string>;
      mcpServers?: Record<string, { env?: Record<string, string> }>;
    };
    if (parsed.env?.MANYCHAT_WEBHOOK_SECRET) return parsed.env.MANYCHAT_WEBHOOK_SECRET;
    for (const srv of Object.values(parsed.mcpServers ?? {})) {
      if (srv.env?.MANYCHAT_WEBHOOK_SECRET) return srv.env.MANYCHAT_WEBHOOK_SECRET;
    }
  } catch {
    // silent — missing file is fine, we just have no secret.
  }
  return undefined;
}

/**
 * Constant-time compare of a hex-encoded expected digest vs a header value
 * (possibly `sha256=<hex>`). Returns false on any length mismatch or parse error.
 */
function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const provided = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;
  if (!/^[a-f0-9]+$/i.test(provided)) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  if (expected.length !== provided.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(provided.toLowerCase(), 'hex'),
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  const secret = resolveSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'MANYCHAT_WEBHOOK_SECRET not configured' },
      { status: 401 },
    );
  }

  const rawBody = await req.text();
  const header = req.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, header, secret)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  // Sprint 2 stub — body parsing / persistence lands with the DM inbox work.
  return NextResponse.json({ ok: true }, { status: 200 });
}
