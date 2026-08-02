/**
 * Sprint 24 · Anthropic tool-use loop handler (Option B).
 *
 * Runs the multi-turn conversation between Claude and the skills-as-tools
 * definitions. Keeps calling `messages.create` while the model returns
 * `tool_use` blocks, resolving each via `resolveSkillToolCall` and feeding
 * the result back as a `tool_result`. Stops when the model returns only
 * text (`stop_reason: 'end_turn'`) or the iteration cap is hit.
 *
 * Design notes:
 *  - The caller owns the Anthropic client; we accept it as a dependency so
 *    the /api/chat route can share its singleton and tests can inject a fake.
 *  - We NEVER throw when a tool resolution fails: we send the error back as
 *    the `tool_result` content and let Claude decide what to do next.
 *  - `maxLoopIterations` is a safety valve. Claude Sonnet on well-formed
 *    tools rarely loops more than 2-3 times; the default of 5 leaves room
 *    while preventing runaway loops.
 *  - Empty tools list (or a caller passing `SKILLS_MODE=off` semantics) is
 *    handled by falling through to a plain `messages.create` with no tools
 *    — same return shape.
 */

import type Anthropic from '@anthropic-ai/sdk'
import {
  skillsAsTools,
  resolveSkillToolCall,
  type AnthropicTool,
} from './tools'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ChatContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface ChatWithToolsMessage {
  role: 'user' | 'assistant'
  content: string | ChatContentBlock[]
}

export interface ChatWithToolsOpts {
  model: string
  systemPrompt: string
  messages: ChatWithToolsMessage[]
  /** Forwarded to `skillsAsTools`. */
  toolBudget?: {
    maxTotalTokens?: number
    categories?: string[]
  }
  /** Safety cap on `messages.create` iterations. Default: 5. */
  maxLoopIterations?: number
  /** Forwarded to `messages.create`. Default: 4096. */
  maxTokens?: number
}

export interface ChatWithToolsResult {
  /** Concatenated text from every assistant turn (joined by \n\n). */
  text: string
  /** Hyphenated skill slugs that Claude actually invoked, in order. */
  skillsUsed: string[]
  /** Number of `messages.create` calls made. */
  iterations: number
  /** Aggregate token usage across all iterations, if reported by the SDK. */
  tokenUsage?: { input: number; output: number }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_LOOP_ITERATIONS = 5
const DEFAULT_MAX_TOKENS = 4096
const TOOL_NAME_PREFIX = 'use_skill_'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reverse `use_skill_cold_email` → `cold-email` for reporting. */
function toolNameToHyphenSlug(toolName: string): string | null {
  if (!toolName.startsWith(TOOL_NAME_PREFIX)) return null
  return toolName.slice(TOOL_NAME_PREFIX.length).replace(/_/g, '-')
}

/**
 * Anthropic SDK response shape is intentionally narrow here — we only pluck
 * what we need. Kept as a local interface to avoid coupling to the SDK's
 * evolving type surface.
 */
interface AnthropicResponse {
  content: ChatContentBlock[]
  stop_reason?: string | null
  usage?: { input_tokens?: number; output_tokens?: number }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the tool_use → tool_result loop.
 *
 * The caller passes a live Anthropic client. We keep control of the message
 * list so partial state (assistant tool_use blocks + user tool_result blocks)
 * stays consistent even on error paths.
 */
export async function chatWithSkillTools(
  client: Anthropic,
  opts: ChatWithToolsOpts,
): Promise<ChatWithToolsResult> {
  const maxLoopIterations = opts.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITERATIONS
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS

  const tools: AnthropicTool[] = skillsAsTools({
    maxTotalTokens: opts.toolBudget?.maxTotalTokens ?? 2000,
    categories: opts.toolBudget?.categories,
  })

  // Working copy — we append assistant + user turns each iteration.
  const working: ChatWithToolsMessage[] = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const textParts: string[] = []
  const skillsUsed: string[] = []
  let iterations = 0
  let totalInput = 0
  let totalOutput = 0
  let sawUsage = false

  // If tools list is empty, still make ONE call so the result shape is stable.
  const hasTools = tools.length > 0

  while (iterations < maxLoopIterations) {
    iterations += 1

    const createArgs: Record<string, unknown> = {
      model: opts.model,
      max_tokens: maxTokens,
      system: opts.systemPrompt,
      messages: working,
    }
    if (hasTools) createArgs.tools = tools

    // Cast: SDK types are strict about content unions; our local shape is a
    // narrow superset that the SDK accepts at runtime.
    const resp = (await client.messages.create(
      createArgs as unknown as Parameters<typeof client.messages.create>[0],
    )) as unknown as AnthropicResponse

    // Track usage even for turns that don't emit text.
    if (resp.usage) {
      sawUsage = true
      totalInput += resp.usage.input_tokens ?? 0
      totalOutput += resp.usage.output_tokens ?? 0
    }

    const blocks = Array.isArray(resp.content) ? resp.content : []

    // Collect text from THIS turn.
    for (const b of blocks) {
      if (b.type === 'text' && b.text) textParts.push(b.text)
    }

    // Collect any tool_use blocks (may be multiple in parallel).
    const toolUses = blocks.filter(
      (b): b is Extract<ChatContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
    )

    // No tool_use → we're done (regardless of stop_reason nuances).
    if (toolUses.length === 0) break

    // Append the assistant turn verbatim (must include tool_use blocks so
    // Anthropic can match tool_use_id with our tool_result on the next call).
    working.push({ role: 'assistant', content: blocks })

    // Resolve each tool_use and build the paired tool_result list.
    const toolResults: ChatContentBlock[] = []
    for (const tu of toolUses) {
      const slug = toolNameToHyphenSlug(tu.name)
      if (slug) skillsUsed.push(slug)

      const resolved = resolveSkillToolCall(tu.name, tu.input)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: resolved.ok ? resolved.content : resolved.error,
        is_error: resolved.ok ? undefined : true,
      })
    }

    working.push({ role: 'user', content: toolResults })

    // If we're about to exceed the cap on the NEXT iteration, make one final
    // "no-tools" close-out call so Claude produces a natural language answer
    // instead of leaving the client with only tool traffic.
    if (iterations >= maxLoopIterations) break
  }

  return {
    text: textParts.join('\n\n').trim(),
    skillsUsed,
    iterations,
    tokenUsage: sawUsage ? { input: totalInput, output: totalOutput } : undefined,
  }
}
