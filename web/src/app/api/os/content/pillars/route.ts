/**
 * GET  /api/os/content/pillars  — list pillars for the caller's brand cohort
 * POST /api/os/content/pillars  — create a pillar
 *
 * Backed by public.cm_content_pillars (already exists in the schema).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { createAdminClient } from '@/lib/supabase/admin';

const PillarCreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().default(''),
  color: z.string().max(80).optional().default('oklch(70% 0.14 250)'),
  target_percentage: z.number().int().min(0).max(100).optional().default(25),
});

export async function GET(_req: NextRequest) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const clientId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(clientId);
    const admin = createAdminClient('public');
    const { data, error } = await admin
      .from('cm_content_pillars')
      .select('*')
      .in('client_id', brandIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ pillars: data ?? [] });
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
    const parsed = PillarCreateSchema.parse(await req.json().catch(() => ({})));
    const admin = createAdminClient('public');
    const { data, error } = await admin
      .from('cm_content_pillars')
      .insert({
        client_id: clientId,
        name: parsed.name,
        description: parsed.description,
        color: parsed.color,
        target_percentage: parsed.target_percentage,
      })
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ pillar: data });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
