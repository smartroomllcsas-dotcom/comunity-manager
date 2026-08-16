import type { Agent } from '@/lib/os/schemas/agent';
import type { AgentRun } from '@/lib/os/schemas/agent-run';

export interface AgentRuntime {
  run(agent: Agent, input: unknown): Promise<{ output: unknown; run: AgentRun }>;
}

// Sprint 1: stub that returns canned response
export function createStubRuntime(): AgentRuntime {
  return {
    async run(agent, input) {
      const now = new Date().toISOString();
      return {
        output: { echo: input, agentName: agent.name },
        run: {
          id: `run-${Date.now()}`,
          orgId: agent.orgId,
          agentId: agent.id,
          startedAt: now,
          finishedAt: now,
          ok: true,
          summary: 'stub run',
          input,
          output: { echo: input },
          tokensIn: null,
          tokensOut: null,
          costUsd: null,
        },
      };
    },
  };
}
