# Skills — Option B (Anthropic tool-use)

Default chat uses **Option A** (retrieval via `selector.ts`). This module is
the alternative "tools" path: each skill is exposed as an Anthropic tool that
Claude may invoke explicitly.

## Activating the toggle (future work)

```ts
import Anthropic from '@anthropic-ai/sdk'
import { skillsAsTools, resolveSkillToolCall } from '@/lib/skills/tools'

const client = new Anthropic()
const tools = skillsAsTools({ maxTotalTokens: 2000 })

const res = await client.messages.create({ model, messages, tools, max_tokens: 1024 })

for (const block of res.content) {
  if (block.type !== 'tool_use') continue
  const result = resolveSkillToolCall(block.name, block.input)
  // Push { role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: result.ok ? result.content : result.error }] }
  // then re-call messages.create with the appended turn.
}
```

Toggle via env: `SKILLS_MODE=tools` (route wiring is Agente B's scope).
