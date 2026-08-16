import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest, getOSRepositoryForRequest } from '@/lib/os/server';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const { templateId } = await params;
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    const tpl = await repo.templates.byId(templateId);
    if (!tpl) return NextResponse.json({ error: 'template_not_found' }, { status: 404 });
    const agentId = `${templateId}-${Date.now()}`;
    const now = new Date().toISOString();
    await repo.agents.upsert(orgId, {
      id: agentId,
      orgId,
      departmentId: tpl.category,
      name: tpl.name,
      role: tpl.description,
      status: 'active',
      tier: tpl.tier,
      description: tpl.description,
      model: tpl.model,
      tools: tpl.tools,
      parentId: null,
      instance: 'from-template',
      constitution: tpl.constitution,
      trustScore: 0.5,
      trustLedger: [],
      createdAt: now,
      updatedAt: now,
    });
    await repo.templates.incrementInstalls(templateId);
    await repo.activity.insert(orgId, {
      kind: 'template.installed',
      actorId: null,
      summary: `Installed template "${tpl.name}" as agent ${agentId}`,
      payload: { templateId, agentId },
      ok: true,
    });
    return NextResponse.json({ ok: true, agentId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
