import { NextResponse } from 'next/server';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { NewKnowledgeKindSchema } from '@/lib/os/schemas/knowledge-kind';

export async function GET() {
  try {
    const orgId = await requireOrgIdFromRequest();
    const repo  = await getOSRepositoryForRequest();
    const kinds = await repo.knowledge.kinds.all(orgId);
    return NextResponse.json(kinds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const orgId  = await requireOrgIdFromRequest();
    const repo   = await getOSRepositoryForRequest();
    const body   = await request.json();
    const parsed = NewKnowledgeKindSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    // Prevent clients from marking themselves as system
    const kind = { ...parsed.data, system: false };
    await repo.knowledge.kinds.upsert(orgId, kind);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
