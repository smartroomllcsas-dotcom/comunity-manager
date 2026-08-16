/**
 * GET  /api/os/posts  — list cm_scheduled_posts for the current org/client
 * POST /api/os/posts  — create a draft or scheduled post
 *
 * Thin OS-shell wrapper around the existing /api/posts logic.
 * Auth: Supabase session → requireOrgIdFromRequest() → cm_client_id.
 * Uses service role (public schema) to bypass RLS, same pattern as /api/posts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { communityOsFlag } from '@/lib/flags';

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createSbClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
  });
}

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const clientId = await requireOrgIdFromRequest();
    const sb = getPublicAdmin();
    const { data, error } = await sb
      .from('cm_scheduled_posts')
      .select('id, content, platforms, status, scheduled_date, created_at, published_at')
      .eq('client_id', clientId)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ posts: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const clientId = await requireOrgIdFromRequest();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const caption = typeof b.caption === 'string' ? b.caption.trim() : '';
    if (!caption) return NextResponse.json({ error: 'caption requerido' }, { status: 400 });

    const platforms = Array.isArray(b.platforms)
      ? b.platforms.filter((p): p is string => typeof p === 'string')
      : [];

    const scheduledFor = typeof b.scheduledFor === 'string' ? b.scheduledFor : null;
    const status = scheduledFor ? 'scheduled' : 'draft';

    const sb = getPublicAdmin();
    const { data, error } = await sb
      .from('cm_scheduled_posts')
      .insert({
        client_id: clientId,
        content: caption,
        platforms,
        status,
        scheduled_date: scheduledFor,
        // title is required NOT NULL — use first 100 chars of caption as fallback
        title: caption.slice(0, 100),
        // scheduled_time is required NOT NULL when scheduling; default midnight
        scheduled_time: scheduledFor ? '00:00:00' : '00:00:00',
        timezone: 'America/Bogota',
      })
      .select('id, content, platforms, status, scheduled_date, created_at')
      .single();

    if (error) throw error;

    // Map to SocialPost shape
    const post = {
      id: (data as Record<string, unknown>).id,
      caption: (data as Record<string, unknown>).content ?? caption,
      platforms: (data as Record<string, unknown>).platforms ?? platforms,
      mediaUrl: null,
      scheduledFor: (data as Record<string, unknown>).scheduled_date ?? null,
      status,
      createdAt: (data as Record<string, unknown>).created_at ?? new Date().toISOString(),
    };

    return NextResponse.json({ ok: true, post });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
