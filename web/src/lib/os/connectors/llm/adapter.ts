/**
 * LLM Orchestration connector.
 *
 * Ported from FounderOS-DEMO/lib/connectors/llm.ts, simplified to raw
 * provider detection based on `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`
 * (no AI Gateway assumed). Exposes helpers for routing chat/code/reasoning/
 * creative tasks between providers and estimating cost.
 *
 * Read-only: NO SDK calls are made from probe(). We only check env presence.
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LlmProviderName = 'openai' | 'anthropic';
export type LlmTaskType = 'chat' | 'code' | 'reasoning' | 'creative';

export interface LlmModelSpec {
  provider: LlmProviderName;
  model: string;
  /** USD per 1M input tokens (approx, for `estimateCost`). */
  inputPer1M: number;
  /** USD per 1M output tokens (approx). */
  outputPer1M: number;
}

// ---------------------------------------------------------------------------
// Default routing table (per task type → preferred model, best-first)
// Prices are 2026-Q1 ballpark; keep conservative.
// ---------------------------------------------------------------------------

const ROUTING: Record<LlmTaskType, LlmModelSpec[]> = {
  chat: [
    { provider: 'anthropic', model: 'claude-sonnet-4-7', inputPer1M: 3, outputPer1M: 15 },
    { provider: 'openai', model: 'gpt-4o', inputPer1M: 2.5, outputPer1M: 10 },
  ],
  code: [
    { provider: 'anthropic', model: 'claude-opus-4-7', inputPer1M: 15, outputPer1M: 75 },
    { provider: 'openai', model: 'gpt-4o', inputPer1M: 2.5, outputPer1M: 10 },
  ],
  reasoning: [
    { provider: 'anthropic', model: 'claude-opus-4-7', inputPer1M: 15, outputPer1M: 75 },
    { provider: 'openai', model: 'o1', inputPer1M: 15, outputPer1M: 60 },
  ],
  creative: [
    { provider: 'anthropic', model: 'claude-sonnet-4-7', inputPer1M: 3, outputPer1M: 15 },
    { provider: 'openai', model: 'gpt-4o', inputPer1M: 2.5, outputPer1M: 10 },
  ],
};

// ---------------------------------------------------------------------------
// Env detection
// ---------------------------------------------------------------------------

function detectProviders(): LlmProviderName[] {
  const out: LlmProviderName[] = [];
  if (process.env.ANTHROPIC_API_KEY) out.push('anthropic');
  if (process.env.OPENAI_API_KEY) out.push('openai');
  return out;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Pick the best model for a task from the providers whose API keys are set.
 * Falls back to `anthropic` preference, then `openai`. Returns `null` if
 * neither key is configured.
 */
export function pickProvider(taskType: LlmTaskType): LlmModelSpec | null {
  const available = new Set(detectProviders());
  if (available.size === 0) return null;
  const candidates = ROUTING[taskType] ?? ROUTING.chat;
  for (const spec of candidates) {
    if (available.has(spec.provider)) return spec;
  }
  return null;
}

/**
 * Rough USD cost estimate for a completion.
 * `tokens` may be a number (total, treated as 50/50 in/out) or a split.
 */
export function estimateCost(
  tokens: number | { input: number; output: number },
  model: string,
): number {
  // Find spec by model name across the routing table.
  let spec: LlmModelSpec | null = null;
  for (const list of Object.values(ROUTING)) {
    const hit = list.find((s) => s.model === model);
    if (hit) {
      spec = hit;
      break;
    }
  }
  if (!spec) return 0;
  const inTok = typeof tokens === 'number' ? tokens / 2 : tokens.input;
  const outTok = typeof tokens === 'number' ? tokens / 2 : tokens.output;
  return (inTok * spec.inputPer1M + outTok * spec.outputPer1M) / 1_000_000;
}

/** Introspection helper — returns which providers are currently detected. */
export function detectedProviders(): LlmProviderName[] {
  return detectProviders();
}

// ---------------------------------------------------------------------------
// ConnectorAdapter
// ---------------------------------------------------------------------------

export const llmAdapter: ConnectorAdapter = {
  id: 'llm',
  label: 'LLM Orchestration',
  kind: 'apikey',
  provider: 'llm',

  async probe(_orgId: string): Promise<ProbeResult> {
    try {
      const providers = detectProviders();
      if (providers.length === 0) {
        return {
          status: 'not_configured',
          meta: { note: 'Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY' },
        };
      }
      return {
        status: 'live',
        meta: {
          providers,
          default: providers.includes('anthropic') ? 'anthropic' : 'openai',
        },
      };
    } catch (e: unknown) {
      return {
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
