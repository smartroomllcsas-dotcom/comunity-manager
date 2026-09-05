import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/os-broadcast-scheduler
 *
 * DISABLED (2026-08-25). Este endpoint fue el stub Sprint 4 que marcaba posts
 * como 'published' sin llamar realmente a Meta y provocaba que cada post con
 * status='scheduled' quedara envenenado en <60s (FK error en os_activity →
 * catch clause seteaba status='failed'). El publishing real corre en Inngest:
 *   - src/lib/inngest/functions/publish-scheduled-post.ts
 *   - src/lib/inngest/functions/reap-scheduled-posts.ts (safety net cada 5m)
 *
 * El entry en vercel.json también fue removido para que Vercel Cron no lo dispare.
 * La ruta se mantiene alcanzable como no-op para no romper callers externos.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    disabled: true,
    replaced_by: 'publish-scheduled-post + reap-scheduled',
  });
}
