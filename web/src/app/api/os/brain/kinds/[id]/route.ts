import { NextResponse } from 'next/server';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId  = await requireOrgIdFromRequest();
    const repo   = await getOSRepositoryForRequest();
    const { id } = await params;
    await repo.knowledge.kinds.delete(orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('system') ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
