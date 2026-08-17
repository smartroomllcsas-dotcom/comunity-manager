/**
 * PATCH  /api/os/content/drafts/[id]  — update a draft
 * DELETE /api/os/content/drafts/[id]  — soft delete (status='archived')
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { createAdminClient } from '@/lib/supabase/admin';

const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'facebook', 'threads'] as const;

const DraftPatchSchema = z.object({
  title: z.string().max(280).optional(),
  body: z.string().max(20_000).optional(),
  platforms: z.array(z.enum(PLATFORMS)).max(10).optional(),
  mediaUrls: z.array(z.string().url()).max(20).optional(),
  pillarId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const { id } = await ctx.params;
    const clientId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(clientId);
    const raw = await req.json().catch(() => ({}));
    const parsed = DraftPatchSchema.parse(raw);

    const patch: Record<string, unknown> = {};
    if (parsed.title !== undefined) patch.title = parsed.title;
    if (parsed.body !== undefined) patch.body = parsed.body;
    if (parsed.platforms !== undefined) patch.platforms = parsed.platforms;
    if (parsed.mediaUrls !== undefined) patch.media_urls = parsed.mediaUrls;
    if (parsed.pillarId !== undefined) patch.pillar_id = parsed.pillarId;

    const admin = createAdminClient('smarttalk');
    const { data, error } = await admin
      .from('os_content_drafts')
      .update(patch)
      .eq('id', id)
      .in('brand_id', brandIds)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ draft: data });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const { id } = await ctx.params;
    const clientId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(clientId);
    const admin = createAdminClient('smarttalk');
    const { error } = await admin
      .from('os_content_drafts')
      .update({ status: 'archived' })
      .eq('id', id)
      .in('brand_id', brandIds);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
