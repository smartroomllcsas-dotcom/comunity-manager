import Anthropic from '@anthropic-ai/sdk';
import type { Agent } from '@/lib/os/schemas/agent';
import type { AgentRun, NewAgentRun } from '@/lib/os/schemas/agent-run';
import { verify } from './verify';
import { updateTrust } from './trust';
import type { OSRepository } from '../repository';

export interface RunInput {
  prompt: string;
  context?: Record<string, unknown>;
}

export interface RuntimeResult {
  output: unknown;
  run: AgentRun;
  verifyResult: { pass: boolean; reason?: string };
}

export interface AgentRuntime {
  run(agent: Agent, input: RunInput): Promise<RuntimeResult>;
}

export function buildSystemPrompt(agent: Agent): string {
  const c = agent.constitution || {};
  const rules: string[] = [];
  if (c.max_msg_per_hour) rules.push(`No enviar más de ${c.max_msg_per_hour} mensajes por hora.`);
  if (c.max_msg_per_minute_per_contact) rules.push(`No exceder ${c.max_msg_per_minute_per_contact} mensajes por minuto al mismo contacto.`);
  if (c.escalate_on_negative_sentiment) rules.push('Si detectas frustración o queja, escala a humano en vez de responder tú mismo.');
  if (c.never_promise_prices) rules.push('Nunca comprometer precios específicos sin autorización.');
  if (c.custom_rules) {
    if (typeof c.custom_rules === 'string') rules.push(c.custom_rules);
    else rules.push(JSON.stringify(c.custom_rules));
  }
  return `Sos ${agent.name} — ${agent.description || agent.role}.
Modelo: ${agent.model || 'claude-sonnet'}.
Tier: ${agent.tier}.

Reglas duras (constitution — NO NEGOCIABLES):
${rules.length ? rules.map(r => `- ${r}`).join('\n') : '(sin reglas específicas — actúa con sentido común profesional)'}

Responde de forma directa, útil y en el tono del brand.`;
}

const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-opus-4-7': { in: 15, out: 75 },
};

function priceFor(model: string, tokensIn: number, tokensOut: number): number {
  const key = Object.keys(MODEL_PRICES).find(k => model.includes(k)) ?? 'claude-sonnet-4-6';
  const p = MODEL_PRICES[key];
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

export function createClaudeRuntime(): AgentRuntime {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  return {
    async run(agent, input) {
      const startedAt = new Date().toISOString();
      const model = agent.model || 'claude-sonnet-4-6';
      const systemPrompt = buildSystemPrompt(agent);

      let output: unknown = null;
      let tokensIn = 0;
      let tokensOut = 0;
      let ok = true;
      let errorMessage = '';

      try {
        const resp = await client.messages.create({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: input.prompt }],
        });
        const textBlock = resp.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
        output = textBlock?.text ?? '';
        tokensIn = resp.usage.input_tokens;
        tokensOut = resp.usage.output_tokens;
      } catch (e: unknown) {
        ok = false;
        errorMessage = e instanceof Error ? e.message : String(e);
        output = null;
      }

      const finishedAt = new Date().toISOString();
      const verifyResult = ok ? verify(agent.constitution, output) : { pass: false as const, reason: errorMessage };
      const finalOk = ok && verifyResult.pass;
      const cost = priceFor(model, tokensIn, tokensOut);

      const runData: NewAgentRun = {
        orgId: agent.orgId,
        agentId: agent.id,
        startedAt,
        finishedAt,
        ok: finalOk,
        input: input as unknown,
        output,
        tokensIn,
        tokensOut,
        costUsd: cost,
        summary: finalOk ? 'ok' : (errorMessage || (!verifyResult.pass ? verifyResult.reason : undefined) || 'verify failed'),
      };

      // Synthesize a full AgentRun shape for the return value (insert happens in runAndPersist)
      const run: AgentRun = { id: `run-${Date.now()}-${agent.id}`, ...runData, summary: runData.summary ?? '' };

      return { output, run, verifyResult };
    },
  };
}

// Convenience: run + persist + update trust in one call
export async function runAndPersist(
  repo: OSRepository,
  agent: Agent,
  input: RunInput,
): Promise<RuntimeResult> {
  const runtime = createClaudeRuntime();
  const result = await runtime.run(agent, input);

  const { id: _id, ...runWithoutId } = result.run;
  const insertedRun = await repo.agentRuns.insert(agent.orgId, runWithoutId);

  const verdict = result.verifyResult.pass ? 'pass' : 'fail';
  const updated = updateTrust(agent, insertedRun.id, verdict);
  await repo.agents.upsert(agent.orgId, updated);

  await repo.activity.insert(agent.orgId, {
    kind: 'agent.run.complete',
    actorId: agent.id,
    summary: `${agent.name}: ${result.verifyResult.pass ? '✓' : '✗'} — ${insertedRun.summary.slice(0, 80)}`,
    payload: { runId: insertedRun.id, cost: insertedRun.costUsd },
    ok: result.verifyResult.pass,
  });

  return { ...result, run: insertedRun };
}

// Stub runtime — keeps Sprint 1 tests green, no Claude API calls
export function createStubRuntime(): AgentRuntime {
  return {
    async run(agent, input) {
      const now = new Date().toISOString();
      const run: AgentRun = {
        id: `stub-${Date.now()}`,
        orgId: agent.orgId,
        agentId: agent.id,
        startedAt: now,
        finishedAt: now,
        ok: true,
        input: input as unknown,
        output: { echo: input, agent: agent.name },
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        summary: 'stub run',
      };
      return {
        output: { echo: input, agent: agent.name },
        run,
        verifyResult: { pass: true },
      };
    },
  };
}
