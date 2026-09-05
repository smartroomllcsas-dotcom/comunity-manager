/**
 * PATCH  /api/os/content/pillars/[id]
 * DELETE /api/os/content/pillars/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { createAdminClient } from '@/lib/supabase/admin';

const PillarPatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  color: z.string().max(80).optional(),
  target_percentage: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const { id } = await ctx.params;
    const clientId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(clientId);
    const parsed = PillarPatchSchema.parse(await req.json().catch(() => ({})));
    const admin = createAdminClient('public');
    const { data, error } = await admin
      .from('cm_content_pillars')
      .update(parsed)
      .eq('id', id)
      .in('client_id', brandIds)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
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

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const { id } = await ctx.params;
    const clientId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(clientId);
    const admin = createAdminClient('public');
    const { error } = await admin
      .from('cm_content_pillars')
      .delete()
      .eq('id', id)
      .in('client_id', brandIds);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
