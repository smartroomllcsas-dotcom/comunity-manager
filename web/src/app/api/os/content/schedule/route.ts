/**
 * POST /api/os/content/schedule  — schedule a draft (or ad-hoc payload)
 *                                  into cm_scheduled_posts.
 *
 * Body:
 *   { draftId?: string, caption?: string, platforms: string[],
 *     mediaUrls?: string[], scheduledFor: string /ISO/, pillarId?: string }
 *
 * If draftId is provided we hydrate caption/platforms/media from the draft
 * (draft must belong to the caller's brand cohort) and mark it archived.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { createAdminClient } from '@/lib/supabase/admin';

const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'facebook', 'threads'] as const;

const ScheduleSchema = z.object({
  draftId: z.string().uuid().optional(),
  caption: z.string().max(20_000).optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(10).optional(),
  mediaUrls: z.array(z.string().url()).max(20).optional().default([]),
  scheduledFor: z.string().datetime(),
  pillarId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const clientId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(clientId);
    const raw = await req.json().catch(() => ({}));
    const parsed = ScheduleSchema.parse(raw);

    const smart = createAdminClient('smarttalk');
    const publicDb = createAdminClient('public');

    let caption = parsed.caption ?? '';
    let platforms: string[] = parsed.platforms ?? [];
    let mediaUrls: string[] = parsed.mediaUrls ?? [];

    if (parsed.draftId) {
      const { data: draft, error } = await smart
        .from('os_content_drafts')
        .select('id,brand_id,title,body,platforms,media_urls,pillar_id')
        .eq('id', parsed.draftId)
        .in('brand_id', brandIds)
        .maybeSingle();
      if (error) throw error;
      if (!draft) return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
      caption = caption || (draft.body as string) || (draft.title as string) || '';
      platforms = platforms.length ? platforms : ((draft.platforms as string[]) ?? []);
      mediaUrls = mediaUrls.length ? mediaUrls : ((draft.media_urls as string[]) ?? []);
    }

    if (!caption.trim()) return NextResponse.json({ error: 'empty_caption' }, { status: 400 });
    if (!platforms.length) return NextResponse.json({ error: 'no_platforms' }, { status: 400 });

    const { data: post, error: insertErr } = await publicDb
      .from('cm_scheduled_posts')
      .insert({
        client_id: clientId,
        content: caption,
        platforms,
        media_urls: mediaUrls,
        scheduled_at: parsed.scheduledFor,
        status: 'scheduled',
      })
      .select('*')
      .single();
    if (insertErr) throw insertErr;

    if (parsed.draftId) {
      await smart.from('os_content_drafts').update({ status: 'archived' }).eq('id', parsed.draftId);
    }

    return NextResponse.json({ post });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
