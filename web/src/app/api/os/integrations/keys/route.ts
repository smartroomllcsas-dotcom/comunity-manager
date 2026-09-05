/**
 * OS · Integrations · API Keys
 *
 * GET  → masked list of API keys registered per connector (best-effort probe of
 *        env vars — the platform doesn't store secrets in DB yet).
 * POST → { action: 'rotate', id } → 501 Not Implemented (Sprint 2 placeholder).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';

const KEY_ENV_MAP: Array<{ id: string; label: string; provider: string; envVar: string }> = [
  { id: 'stripe-secret', label: 'Stripe Secret Key', provider: 'stripe', envVar: 'STRIPE_SECRET_KEY' },
  { id: 'stripe-webhook', label: 'Stripe Webhook Secret', provider: 'stripe', envVar: 'STRIPE_WEBHOOK_SECRET' },
  { id: 'meta-app-secret', label: 'Meta App Secret', provider: 'meta', envVar: 'META_APP_SECRET' },
  { id: 'meta-page-token', label: 'Meta Page Access Token', provider: 'meta', envVar: 'META_PAGE_ACCESS_TOKEN' },
  { id: 'wise-api-token', label: 'Wise API Token', provider: 'wise', envVar: 'WISE_API_TOKEN' },
  { id: 'notion-token', label: 'Notion Integration Token', provider: 'notion', envVar: 'NOTION_TOKEN' },
  { id: 'slack-bot-token', label: 'Slack Bot Token', provider: 'slack', envVar: 'SLACK_BOT_TOKEN' },
  { id: 'openai-api-key', label: 'OpenAI API Key', provider: 'openai', envVar: 'OPENAI_API_KEY' },
  { id: 'anthropic-api-key', label: 'Anthropic API Key', provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY' },
];

function mask(v: string): string {
  if (!v) return '••••••••';
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}${'•'.repeat(Math.max(4, v.length - 8))}${v.slice(-4)}`;
}

const RotateBodySchema = z.object({
  action: z.literal('rotate'),
  id: z.string().min(1),
});

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const keys = KEY_ENV_MAP.filter((k) => process.env[k.envVar]).map((k) => ({
    id: k.id,
    label: k.label,
    provider: k.provider,
    masked: mask(process.env[k.envVar] ?? ''),
  }));

  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = RotateBodySchema.parse(body);
    // Sprint 2 placeholder — no real rotation yet.
    return NextResponse.json(
      {
        error: 'not_implemented',
        message: `Key rotation for '${parsed.id}' is scheduled for Sprint 2.`,
      },
      { status: 501 },
    );
  } catch (e: any) {
    if (e?.name === 'ZodError') {
      return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: e.message ?? 'bad_request' }, { status: 400 });
  }
}
