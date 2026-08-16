/**
 * GET  /api/os/posts  — list cm_scheduled_posts for the current org/client
 * POST /api/os/posts  — create a draft or scheduled post
 *
 * Thin wrapper around /api/posts (legacy). All billing enforcement, Inngest
 * scheduling, and rate-limiting live there. This route only:
 *   1. Checks the community-os feature flag.
 *   2. Validates the caller has a valid org session via requireOrgIdFromRequest().
 *   3. Maps the OS body shape (caption/scheduledFor) → legacy shape (content/scheduled_at).
 *   4. Forwards the request to /api/posts preserving session cookies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { communityOsFlag } from '@/lib/flags';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function buildCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

function getOrigin(req: NextRequest): string {
  return req.headers.get('origin') ?? req.headers.get('x-forwarded-host')
    ? `https://${req.headers.get('x-forwarded-host')}`
    : 'http://localhost:3000';
}

// ---------------------------------------------------------------------------
// GET /api/os/posts
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    // Validate session — throws if unauthenticated
    const clientId = await requireOrgIdFromRequest();

    const cookieHeader = await buildCookieHeader();
    const origin = getOrigin(req);

    // Forward to legacy, injecting client_id filter
    const url = new URL(req.url);
    if (!url.searchParams.has('client_id')) {
      url.searchParams.set('client_id', clientId);
    }

    const upstream = await fetch(`${origin}/api/posts?${url.searchParams.toString()}`, {
      headers: { Cookie: cookieHeader },
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// ---------------------------------------------------------------------------
// POST /api/os/posts
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    // Validate session — throws if unauthenticated
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

    // Map OS shape → legacy shape
    // OS  : { caption, platforms, scheduledFor?, mediaUrl? }
    // Legacy: { client_id, content, platforms, scheduled_at?, status, media_urls? }
    const caption = typeof b.caption === 'string' ? b.caption.trim() : '';
    if (!caption) {
      return NextResponse.json({ error: 'caption requerido' }, { status: 400 });
    }

    const platforms = Array.isArray(b.platforms)
      ? b.platforms.filter((p): p is string => typeof p === 'string')
      : [];

    const scheduledFor = typeof b.scheduledFor === 'string' && b.scheduledFor
      ? b.scheduledFor
      : null;

    const mediaUrls = typeof b.mediaUrl === 'string' && b.mediaUrl
      ? [b.mediaUrl]
      : Array.isArray(b.mediaUrls)
        ? (b.mediaUrls as unknown[]).filter((u): u is string => typeof u === 'string')
        : undefined;

    const legacyBody: Record<string, unknown> = {
      client_id: clientId,
      content: caption,
      platforms,
      status: scheduledFor ? 'scheduled' : 'draft',
      ...(scheduledFor ? { scheduled_at: scheduledFor } : {}),
      ...(mediaUrls ? { media_urls: mediaUrls } : {}),
      // Pass through id if caller is doing an update
      ...(typeof b.id === 'string' ? { id: b.id } : {}),
      timezone: typeof b.timezone === 'string' ? b.timezone : 'America/Bogota',
    };

    const cookieHeader = await buildCookieHeader();
    const origin = getOrigin(req);

    const upstream = await fetch(`${origin}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify(legacyBody),
    });

    const data = await upstream.json() as Record<string, unknown>;

    if (!upstream.ok) {
      return NextResponse.json(data, { status: upstream.status });
    }

    // Re-shape response to the OS SocialPost contract
    const post = {
      id: data.id,
      caption,
      platforms,
      mediaUrl: mediaUrls?.[0] ?? null,
      scheduledFor: scheduledFor,
      status: legacyBody.status,
      inngest_event_id: data.inngest_event_id ?? null,
    };

    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
