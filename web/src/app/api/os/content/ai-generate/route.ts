/**
 * POST /api/os/content/ai-generate
 *
 * Streaming AI writer for the OS Content page. Anthropic Messages API with
 * SSE passthrough — the client consumes text chunks from `data:` events.
 *
 * Body:
 *   { action: 'hook' | 'cta' | 'rewrite' | 'expand',
 *     input: string,
 *     brandVoice?: string,
 *     platform?: string,
 *     tone?: string }
 */
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  action: z.enum(['hook', 'cta', 'rewrite', 'expand']),
  input: z.string().min(1).max(20_000),
  brandVoice: z.string().max(4000).optional(),
  platform: z.string().max(40).optional(),
  tone: z.string().max(80).optional(),
});

const PROMPTS: Record<z.infer<typeof BodySchema>['action'], (v: {
  input: string; brandVoice?: string; platform?: string; tone?: string;
}) => string> = {
  hook: (v) =>
    `Generate 5 short, punchy hooks (max 12 words each) for the topic below.` +
    ` Platform: ${v.platform ?? 'generic social'}. Tone: ${v.tone ?? 'confident, human'}.` +
    (v.brandVoice ? ` Brand voice: ${v.brandVoice}` : '') +
    `\n\nTopic:\n${v.input}\n\nReturn ONLY a numbered list.`,
  cta: (v) =>
    `Generate 5 conversion-focused CTAs (max 8 words each) for the post below.` +
    ` Platform: ${v.platform ?? 'generic social'}.` +
    (v.brandVoice ? ` Brand voice: ${v.brandVoice}` : '') +
    `\n\nPost:\n${v.input}\n\nReturn ONLY a numbered list.`,
  rewrite: (v) =>
    `Rewrite the following post in this brand voice — keep the same meaning, ` +
    `same platform (${v.platform ?? 'generic social'}), stronger opening.` +
    (v.brandVoice ? ` Brand voice: ${v.brandVoice}` : '') +
    `\n\nOriginal:\n${v.input}\n\nReturn only the rewritten post — no preamble.`,
  expand: (v) =>
    `Expand this idea into a full ${v.platform ?? 'social'} post ` +
    `(natural length for the platform, no hashtags unless obviously native).` +
    (v.brandVoice ? ` Brand voice: ${v.brandVoice}` : '') +
    `\n\nIdea:\n${v.input}\n\nReturn only the post.`,
};

function sseEncode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: NextRequest) {
  const enabled = await communityOsFlag();
  if (!enabled) return new Response(JSON.stringify({ error: 'not_available' }), { status: 404 });

  let clientId: string;
  try {
    clientId = await requireOrgIdFromRequest();
  } catch {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  // clientId is used implicitly for audit; log if needed downstream.
  void clientId;

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    const details = e instanceof z.ZodError ? e.issues : String(e);
    return new Response(JSON.stringify({ error: 'invalid_input', details }), { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ai_not_configured' }), { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey });
  const prompt = PROMPTS[parsed.action](parsed);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const resp = await anthropic.messages.stream({
          model: 'claude-3-5-sonnet-latest',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });
        for await (const event of resp) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(sseEncode({ type: 'delta', text: event.delta.text }));
          }
        }
        controller.enqueue(sseEncode({ type: 'done' }));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(sseEncode({ type: 'error', error: msg }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}
