/**
 * Sprint 24 · chatWithSkillTools loop handler unit tests.
 *
 * Uses a hand-rolled fake Anthropic client (mirrors selector.test.ts).
 * Registry + data.generated are mocked to keep the suite independent of the
 * generated dataset.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks BEFORE importing the module under test ---------------------------
const FIXTURES = [
  {
    slug: 'cold-email',
    name: 'Cold Email',
    description: 'Write high-converting cold emails for B2B outreach.',
    category: 'email',
    content: '# Cold Email Skill\n\nStep 1: hook. Step 2: value. Step 3: CTA.',
    tokenCount: 100,
  },
  {
    slug: 'seo-audit',
    name: 'SEO Audit',
    description: 'Technical SEO audit covering crawlability and CWV.',
    category: 'seo',
    content: '# SEO Audit Skill\n\nCrawl, then analyze indexing.',
    tokenCount: 200,
  },
]

vi.mock('../registry', () => ({
  getAllSkills: vi.fn(() => FIXTURES),
  getSkill: vi.fn(
    (slug: string) => FIXTURES.find((s) => s.slug === slug) ?? null,
  ),
}))

vi.mock('../data.generated', () => ({ SKILLS: [] }))

// Now safe to import the module under test.
import { chatWithSkillTools } from '../tools-handler'
import type Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// Fake client factory
// ---------------------------------------------------------------------------

interface FakeResponse {
  content: unknown[]
  stop_reason?: string
  usage?: { input_tokens: number; output_tokens: number }
}

function makeFakeClient(responses: FakeResponse[]) {
  const calls: unknown[] = []
  const client = {
    messages: {
      async create(body: unknown) {
        calls.push(body)
        const idx = Math.min(calls.length - 1, responses.length - 1)
        return responses[idx]
      },
    },
    _calls: () => calls,
    _callCount: () => calls.length,
  }
  return client as unknown as Anthropic & {
    _calls: () => unknown[]
    _callCount: () => number
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chatWithSkillTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loops once tool_use → tool_result → text (closes cleanly)', async () => {
    const client = makeFakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'use_skill_cold_email',
            input: { user_context: 'B2B SaaS to CTOs' },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Here is your cold email draft.' }],
      },
    ])

    const result = await chatWithSkillTools(client, {
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'Write a cold email.' }],
    })

    expect(result.iterations).toBe(2)
    expect(result.skillsUsed).toEqual(['cold-email'])
    expect(result.text).toContain('Here is your cold email draft.')
    expect(client._callCount()).toBe(2)
  })

  it('resolves multiple parallel tool_use blocks in one turn', async () => {
    const client = makeFakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_a',
            name: 'use_skill_cold_email',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'toolu_b',
            name: 'use_skill_seo_audit',
            input: {},
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Combined answer.' }],
      },
    ])

    const result = await chatWithSkillTools(client, {
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Do both.' }],
    })

    expect(result.iterations).toBe(2)
    expect(result.skillsUsed.sort()).toEqual(['cold-email', 'seo-audit'])
    expect(result.text).toBe('Combined answer.')

    // Verify tool_result payload shape sent on the SECOND call.
    const secondCall = client._calls()[1] as {
      messages: Array<{ role: string; content: unknown[] }>
    }
    const lastMsg = secondCall.messages[secondCall.messages.length - 1]
    expect(lastMsg.role).toBe('user')
    const resultBlocks = lastMsg.content as Array<{
      type: string
      tool_use_id: string
    }>
    expect(resultBlocks).toHaveLength(2)
    expect(resultBlocks.every((b) => b.type === 'tool_result')).toBe(true)
    expect(resultBlocks.map((b) => b.tool_use_id).sort()).toEqual([
      'toolu_a',
      'toolu_b',
    ])
  })

  it('sends an error tool_result for an unknown skill name and lets the model finish', async () => {
    const client = makeFakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_bad',
            name: 'use_skill_does_not_exist',
            input: {},
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Sorry, could not find that skill.' }],
      },
    ])

    const result = await chatWithSkillTools(client, {
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'try invalid' }],
    })

    expect(result.iterations).toBe(2)
    // Even unresolved skills are recorded (name-derived slug) so telemetry
    // shows what Claude *tried* to use.
    expect(result.skillsUsed).toEqual(['does-not-exist'])
    expect(result.text).toContain('Sorry')

    const secondCall = client._calls()[1] as {
      messages: Array<{ role: string; content: unknown[] }>
    }
    const lastMsg = secondCall.messages[secondCall.messages.length - 1]
    const errBlock = (
      lastMsg.content as Array<{ type: string; is_error?: boolean; content: string }>
    )[0]
    expect(errBlock.type).toBe('tool_result')
    expect(errBlock.is_error).toBe(true)
    expect(errBlock.content).toContain('not found')
  })

  it('caps iterations at maxLoopIterations even if the model keeps requesting tools', async () => {
    // Every response is a tool_use, so the loop MUST hit the cap.
    const infinite: FakeResponse = {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_x',
          name: 'use_skill_cold_email',
          input: {},
        },
      ],
    }
    const client = makeFakeClient([infinite, infinite, infinite, infinite])

    const result = await chatWithSkillTools(client, {
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'loop me' }],
      maxLoopIterations: 2,
    })

    expect(result.iterations).toBe(2)
    // 2 tool_use turns → 2 slug entries.
    expect(result.skillsUsed).toEqual(['cold-email', 'cold-email'])
    expect(client._callCount()).toBe(2)
  })

  it('returns text directly when the first response has no tool_use', async () => {
    const client = makeFakeClient([
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Direct answer, no tools needed.' }],
        usage: { input_tokens: 42, output_tokens: 13 },
      },
    ])

    const result = await chatWithSkillTools(client, {
      model: 'claude-sonnet-4-20250514',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result.iterations).toBe(1)
    expect(result.skillsUsed).toEqual([])
    expect(result.text).toBe('Direct answer, no tools needed.')
    expect(result.tokenUsage).toEqual({ input: 42, output: 13 })
  })
})
