# Skills — injection modes

Chat requests to `/api/chat` inject skills using one of three strategies,
selected via the `SKILLS_MODE` env var.

| Mode        | Cost / request                     | Latency       | When to use                                                                 |
| ----------- | ---------------------------------- | ------------- | --------------------------------------------------------------------------- |
| `retrieval` | +$0.001 Haiku call + inject tokens | +200-400 ms   | **Default.** Predictable, cheap. Haiku picks 1-3 skills → system prompt.    |
| `tools`     | +$0.005-0.02 (multi-turn loops)    | +500-2000 ms  | Complex chats with several subtasks; let Sonnet self-orchestrate.           |
| `off`       | 0                                  | 0             | Debug: Sonnet with no skills at all — useful to A/B-diff quality.           |

Set the mode at deploy time:

```bash
SKILLS_MODE=tools npm run dev
```

## Mode A · retrieval (default)

`selector.ts` calls Claude Haiku with a compact `slug: description` catalog,
Haiku returns 1-3 slugs, the full skill markdown is appended to Sonnet's
system prompt. Fails soft: on any selector error the chat continues with no
skills.

## Mode B · tools (Anthropic tool-use)

`tools.ts` converts each skill into a `use_skill_<slug>` tool definition.
`tools-handler.ts` runs the loop:

1. Call `messages.create` with `tools=[...]`.
2. For each `tool_use` block in the response → call `resolveSkillToolCall`
   → append a `tool_result` block.
3. Re-call `messages.create` with the appended turns.
4. Stop when the response is text-only or `maxLoopIterations` (default 5)
   is reached.

Unknown skill names produce an `is_error: true` tool_result so Claude can
recover instead of the loop crashing. Skills Claude actually invokes are
returned in `_skills_used` (same field as Mode A).

## Mode OFF

Bypasses all skills. Straight Sonnet call. `_skills_used` is `[]`. Useful
for measuring baseline quality when comparing modes.

## Response contract (all modes)

```json
{ "response": "…assistant text…", "_skills_used": ["cold-email", "seo-audit"] }
```

The UI does not need to change between modes.
