import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const ThemeSchema = z.object({
  accent_hue: z.number().int().min(0).max(360),
  theme_mode: z.enum(['dark', 'light']),
});

function getSupabaseForRequest() {
  // We query os_org_theme directly (not via OSRepository) since it's a new table.
  // Using the anon client so RLS (os_current_org()) applies.
  return (async () => {
    const cookieStore = await cookies();
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
  })();
}

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const sb = await getSupabaseForRequest();
    const { data } = await sb
      .from('os_org_theme')
      .select('accent_hue, theme_mode')
      .eq('org_id', orgId)
      .maybeSingle();
    return NextResponse.json({
      accent_hue: data?.accent_hue ?? 250,
      theme_mode: data?.theme_mode ?? 'dark',
    });
  } catch (e: unknown) {
    console.error('[os/theme.GET] failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

export async function PUT(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const body = await req.json();
    const parsed = ThemeSchema.parse(body);
    const sb = await getSupabaseForRequest();
    const { error } = await sb.from('os_org_theme').upsert({
      org_id: orgId,
      accent_hue: parsed.accent_hue,
      theme_mode: parsed.theme_mode,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error('db_upsert_failed');
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.name === 'ZodError') {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    console.error('[os/theme.PUT] failed:', err.message);
    return NextResponse.json({ error: 'theme_update_failed' }, { status: 500 });
  }
}
