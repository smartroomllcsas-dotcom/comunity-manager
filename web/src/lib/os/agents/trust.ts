import type { Agent } from '@/lib/os/schemas/agent';

export function updateTrust(agent: Agent, runId: string, verdict: 'pass' | 'fail'): Agent {
  const event = { runId, verdict, at: new Date().toISOString() };
  const ledger = [...agent.trustLedger, event].slice(-1000);
  const passes = ledger.filter(e => e.verdict === 'pass').length;
  const newScore = ledger.length === 0 ? 0.5 : passes / ledger.length;
  return { ...agent, trustLedger: ledger, trustScore: newScore };
}
