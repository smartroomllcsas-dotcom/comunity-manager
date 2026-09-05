import type { OSRepository } from './repository';

export async function seedDev(repo: OSRepository, orgId: string) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('seed-dev only available in development');
  }
  const now = new Date().toISOString();

  await repo.agents.upsert(orgId, {
    id: 'auto-responder',
    orgId,
    departmentId: 'support',
    name: 'Auto-responder',
    role: 'Responde mensajes entrantes',
    status: 'active',
    tier: 'worker',
    description: 'Responde con tono del brand',
    model: 'claude-sonnet-4-6',
    tools: ['whatsapp.send'],
    parentId: null,
    instance: 'builtin',
    constitution: { max_msg_per_hour: 100, escalate_on_negative_sentiment: true },
    trustScore: 0.92,
    trustLedger: [],
    createdAt: now,
    updatedAt: now,
  });

  await repo.goals.upsert(orgId, {
    id: 'sla-response',
    orgId,
    title: 'SLA de respuesta',
    spec: { predicateKey: 'sla_response' },
    ownerAgentId: 'auto-responder',
    cadence: '*/15 * * * *',
    lastCheckedAt: null,
    lastStatus: null,
    lastEvidence: null,
    createdAt: now,
  });

  await repo.goals.upsert(orgId, {
    id: 'budget-daily',
    orgId,
    title: 'Budget diario Claude',
    spec: { predicateKey: 'budget_daily' },
    ownerAgentId: null,
    cadence: '*/15 * * * *',
    lastCheckedAt: null,
    lastStatus: null,
    lastEvidence: null,
    createdAt: now,
  });

  await repo.goals.upsert(orgId, {
    id: 'uptime-channels',
    orgId,
    title: 'Uptime canales',
    spec: { predicateKey: 'uptime_channels' },
    ownerAgentId: null,
    cadence: '*/15 * * * *',
    lastCheckedAt: null,
    lastStatus: null,
    lastEvidence: null,
    createdAt: now,
  });
}
