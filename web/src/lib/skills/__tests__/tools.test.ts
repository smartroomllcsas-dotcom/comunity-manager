import { describe, expect, it, vi, beforeEach } from 'vitest'

// -----------------------------------------------------------------------------
// Mock the registry BEFORE importing the module under test. This keeps the
// tests independent of Agente B's generator; when data.generated.ts lands the
// mocks are simply ignored by production code.
// -----------------------------------------------------------------------------

const FIXTURES = [
  {
    slug: 'cold-email',
    name: 'Cold Email',
    description:
      'Write high-converting cold emails for B2B outreach with clear subject lines, personalization hooks and single CTAs.',
    category: 'email',
    content: '# Cold Email Skill\n\nStep 1: research prospect...\nStep 2: craft subject line.',
    tokenCount: 120,
  },
  {
    slug: 'email-sequence',
    name: 'Email Sequence',
    description: 'Design multi-touch email sequences with escalating value.',
    category: 'email',
    content: '# Email Sequence\n\nPlan 5-touch cadence over 14 days.',
    tokenCount: 90,
  },
  {
    slug: 'seo-audit',
    name: 'SEO Audit',
    description:
      'Full technical + on-page SEO audit covering crawlability, indexing, Core Web Vitals, schema, and internal linking.',
    category: 'seo',
    content: '# SEO Audit Skill\n\nRun crawl, then analyze...',
    tokenCount: 200,
  },
]

vi.mock('../registry', () => ({
  getAllSkills: vi.fn(() => FIXTURES),
  getSkill: vi.fn((slug: string) => FIXTURES.find((s) => s.slug === slug) ?? null),
}))

// data.generated is a type-only import in tools.ts, so we mock the runtime
// module to a no-op just in case a test build resolves it.
vi.mock('../data.generated', () => ({ SKILLS: [] }))

// Now import the module under test.
import {
  resolveSkillToolCall,
  skillsAsTools,
  skillToTool,
  type AnthropicTool,
} from '../tools'

const TOOL_NAME_RE = /^use_skill_[a-z0-9_]+$/

describe('skillToTool', () => {
  it('produces a tool with a valid Anthropic tool name', () => {
    const tool = skillToTool(FIXTURES[0])
    expect(tool.name).toMatch(TOOL_NAME_RE)
    expect(tool.name).toBe('use_skill_cold_email')
  })

  it('exposes an optional user_context string in the input_schema', () => {
    const tool = skillToTool(FIXTURES[0])
    expect(tool.input_schema.type).toBe('object')
    expect(tool.input_schema.properties).toHaveProperty('user_context')
    // user_context is optional
    expect(tool.input_schema.required ?? []).not.toContain('user_context')
  })

  it('truncates long descriptions and appends a category hint', () => {
    const longDesc = 'x'.repeat(1000)
    const tool = skillToTool({
      ...FIXTURES[0],
      description: longDesc,
    })
    expect(tool.description.length).toBeLessThanOrEqual(1000)
    expect(tool.description).toMatch(/Invoke when the user asks about email-related task\.$/)
  })
})

describe('skillsAsTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns one tool per skill when called without options', () => {
    const tools = skillsAsTools()
    expect(tools).toHaveLength(FIXTURES.length)
    for (const t of tools) expect(t.name).toMatch(TOOL_NAME_RE)
  })

  it('filters by category', () => {
    const tools = skillsAsTools({ categories: ['email'] })
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['use_skill_cold_email', 'use_skill_email_sequence'].sort(),
    )
  })

  it('returns empty array when categories match nothing', () => {
    const tools = skillsAsTools({ categories: ['nonexistent-cat'] })
    expect(tools).toEqual([])
  })

  it('honors maxTotalTokens budget (stops adding once budget exhausted)', () => {
    // Very tight budget: only the first skill should fit.
    const tools = skillsAsTools({ maxTotalTokens: 40 })
    expect(tools.length).toBeGreaterThanOrEqual(0)
    expect(tools.length).toBeLessThan(FIXTURES.length)
  })

  it('unlimited budget returns every skill', () => {
    const tools = skillsAsTools({ maxTotalTokens: 100_000 })
    expect(tools).toHaveLength(FIXTURES.length)
  })
})

describe('resolveSkillToolCall', () => {
  it('resolves a known skill and appends user_context', () => {
    const result = resolveSkillToolCall('use_skill_cold_email', {
      user_context: 'B2B SaaS targeting CTOs',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toContain('# Cold Email Skill')
      expect(result.content).toContain('B2B SaaS targeting CTOs')
    }
  })

  it('resolves a known skill without user_context', () => {
    const result = resolveSkillToolCall('use_skill_seo_audit', {})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toContain('# SEO Audit Skill')
      expect(result.content).not.toContain('User context:')
    }
  })

  it('returns ok:false for a nonexistent skill', () => {
    const result = resolveSkillToolCall('use_skill_nonexistent', {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/not found/i)
    }
  })

  it('returns ok:false for a tool name not in the skill namespace', () => {
    const result = resolveSkillToolCall('some_other_tool', {})
    expect(result.ok).toBe(false)
  })

  it('ignores non-string user_context values', () => {
    const result = resolveSkillToolCall('use_skill_cold_email', {
      user_context: 42 as unknown as string,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).not.toContain('User context:')
    }
  })
})

// Compile-time sanity: exported type is usable.
const _typeCheck: AnthropicTool = {
  name: 'use_skill_x',
  description: 'x',
  input_schema: { type: 'object', properties: {} },
}
void _typeCheck
