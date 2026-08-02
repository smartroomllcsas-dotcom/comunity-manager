/**
 * Skills-as-Anthropic-Tools (Option B).
 *
 * Converts curated skills into Anthropic tool-use definitions so Claude can
 * invoke `use_skill_<slug>` explicitly. This module is standalone: it does
 * NOT wire itself into /api/chat. The parent SDK caller is expected to pass
 * `skillsAsTools(...)` into `tools:` and route `tool_use` blocks through
 * `resolveSkillToolCall` to obtain the markdown body of the skill.
 *
 * Contract with Agente B:
 *   - `./data.generated` exports `SkillEntry` interface and `SKILLS` array.
 *   - `./registry` exports `getAllSkills()` and `getSkill(slug)`.
 *
 * If `data.generated.ts` has not been generated yet, this file will fail
 * type-checking. That is expected during Sprint 23 until Agente B lands
 * the generator. See FIXME below.
 */

// FIXME: dependency on Agente B generator (web/src/lib/skills/data.generated.ts)
import type { SkillEntry } from './data.generated'
import { getAllSkills, getSkill } from './registry'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Minimal Anthropic tool shape (subset of @anthropic-ai/sdk `Tool`). */
export interface AnthropicTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface SkillsAsToolsOptions {
  /** Only include skills whose category is in this list. */
  categories?: string[]
  /**
   * Approximate cap on total tokens consumed by the *tool definitions*
   * (name + description). Content of the skills is NOT counted here; it is
   * only injected on demand via `resolveSkillToolCall`.
   * Skills are added in registry order until the budget is exhausted.
   */
  maxTotalTokens?: number
}

export type ResolveSkillToolResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME_PREFIX = 'use_skill_'
const MAX_DESCRIPTION_CHARS = 400
/** Rough char->token heuristic (Anthropic tokenizer averages ~4 chars/token). */
const CHARS_PER_TOKEN = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Turn `cold-email` into `use_skill_cold_email`. Also strips unsafe chars. */
function slugToToolName(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  return `${TOOL_NAME_PREFIX}${normalized}`
}

/** Reverse of `slugToToolName`: recover the underscored slug tail. */
function toolNameToSlugKey(toolName: string): string | null {
  if (!toolName.startsWith(TOOL_NAME_PREFIX)) return null
  return toolName.slice(TOOL_NAME_PREFIX.length)
}

/** Estimate tokens for a string (heuristic, no external tokenizer). */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / CHARS_PER_TOKEN)
}

/** Truncate description to the char budget and add hint. */
function buildDescription(skill: SkillEntry): string {
  const raw = (skill.description ?? '').trim()
  const trimmed =
    raw.length > MAX_DESCRIPTION_CHARS
      ? `${raw.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()}...`
      : raw
  const category = skill.category?.trim() || 'general'
  return `${trimmed} Invoke when the user asks about ${category}-related task.`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a single skill into an Anthropic tool definition.
 * The tool takes an optional `user_context` string so Claude can forward
 * the specific ask verbatim to the skill.
 */
export function skillToTool(skill: SkillEntry): AnthropicTool {
  return {
    name: slugToToolName(skill.slug),
    description: buildDescription(skill),
    input_schema: {
      type: 'object',
      properties: {
        user_context: {
          type: 'string',
          description:
            'Optional: the specific user question or context this skill should be applied to. Pass verbatim if useful.',
        },
      },
      // user_context is optional — no `required` field.
    },
  }
}

/**
 * Return every curated skill as an Anthropic tool definition, subject to
 * optional filters. Never mutates the registry.
 */
export function skillsAsTools(opts: SkillsAsToolsOptions = {}): AnthropicTool[] {
  const { categories, maxTotalTokens } = opts
  const all = getAllSkills()

  const filtered = categories && categories.length > 0
    ? all.filter((s) => categories.includes(s.category))
    : all

  if (maxTotalTokens == null) {
    return filtered.map(skillToTool)
  }

  const out: AnthropicTool[] = []
  let used = 0
  for (const skill of filtered) {
    const tool = skillToTool(skill)
    const cost = estimateTokens(tool.name) + estimateTokens(tool.description)
    if (used + cost > maxTotalTokens) break
    out.push(tool)
    used += cost
  }
  return out
}

/**
 * Resolve a `use_skill_<slug>` tool call: look up the skill and return its
 * markdown content, optionally appended with the caller-supplied user_context.
 *
 * The returned `content` string is meant to be passed straight back to the
 * model inside a `tool_result` block.
 */
export function resolveSkillToolCall(
  toolName: string,
  toolInput: unknown,
): ResolveSkillToolResult {
  const key = toolNameToSlugKey(toolName)
  if (!key) {
    return { ok: false, error: `Not a skill tool: ${toolName}` }
  }

  // Registry uses hyphenated slugs; tool names use underscored slugs.
  // Try direct hyphenated lookup first, then underscored fallback.
  const hyphenated = key.replace(/_/g, '-')
  const skill = getSkill(hyphenated) ?? getSkill(key)
  if (!skill) {
    return { ok: false, error: `Skill not found: ${key}` }
  }

  const userContext = extractUserContext(toolInput)
  const base = skill.content ?? ''
  const content = userContext
    ? `${base}\n\n---\n\n**User context:** ${userContext}`
    : base

  return { ok: true, content }
}

/** Narrow `unknown` tool input into an optional user_context string. */
function extractUserContext(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const value = (input as Record<string, unknown>).user_context
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
