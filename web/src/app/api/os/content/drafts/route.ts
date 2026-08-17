/**
 * GET  /api/os/content/drafts
 * POST /api/os/content/drafts
 *
 * OS Content Drafts. Backed by smarttalk.os_content_drafts, scoped to the
 * caller's brand cohort via resolveBrandIds().
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { createAdminClient } from '@/lib/supabase/admin';

const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'facebook', 'threads'] as const;

const DraftCreateSchema = z.object({
  title: z.string().max(280).optional().default(''),
  body: z.string().max(20_000).optional().default(''),
  platforms: z.array(z.enum(PLATFORMS)).max(10).optional().default([]),
  mediaUrls: z.array(z.string().url()).max(20).optional().default([]),
  pillarId: z.string().uuid().nullable().optional(),
});

// GET — list drafts for the caller's brand cohort
export async function GET(req: NextRequest) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const clientId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(clientId);
    const admin = createAdminClient('smarttalk');

    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim();
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

    let query = admin
      .from('os_content_drafts')
      .select('id,brand_id,title,body,platforms,media_urls,pillar_id,status,created_by,created_at,updated_at')
      .in('brand_id', brandIds)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ drafts: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// POST — create a new draft
export async function POST(req: NextRequest) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const clientId = await requireOrgIdFromRequest();
    const raw = await req.json().catch(() => ({}));
    const parsed = DraftCreateSchema.parse(raw);

    const admin = createAdminClient('smarttalk');
    const { data, error } = await admin
      .from('os_content_drafts')
      .insert({
        brand_id: clientId,
        title: parsed.title,
        body: parsed.body,
        platforms: parsed.platforms,
        media_urls: parsed.mediaUrls,
        pillar_id: parsed.pillarId ?? null,
        status: 'draft',
      })
      .select('*')
      .single();
    if (error) throw error;
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
