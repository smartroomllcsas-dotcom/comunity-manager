import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { ConnectorStatus } from '@/lib/os/schemas/connector';

const SetStatusBodySchema = z.object({
  id: z.string(),
  status: ConnectorStatus,
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    const connectors = await repo.connectors.all(orgId);
    return NextResponse.json({ connectors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const body = await req.json();
    const { id, status, meta } = SetStatusBodySchema.parse(body);
    const repo = await getOSRepositoryForRequest();
    await repo.connectors.setStatus(orgId, id, status, meta);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.name === 'ZodError') return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
