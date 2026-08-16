# Community OS — Architecture

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser  /es/os/*                                              │
│  Next.js 14 App Router · [locale]/(shell)/os/                   │
│  Pages: agents · brain · goals · connectors · content · command │
└───────────────────────┬─────────────────────────────────────────┘
                        │ fetch / Server Actions
┌───────────────────────▼─────────────────────────────────────────┐
│  API Routes  /api/os/*                                          │
│  agents · goals · skills · workflows · connectors               │
│  activity · agent-runs · brain/ingest · cohorts                 │
│  dev/seed (dev only)                                            │
└───────────────────────┬─────────────────────────────────────────┘
                        │ OSRepository interface
┌───────────────────────▼─────────────────────────────────────────┐
│  SupabaseAdapter  (lib/os/adapters/supabase.ts)                 │
│  Implements: agents · goals · skills · workflows                │
│              agentRuns · connectors · activity · knowledge      │
└───────────────────────┬─────────────────────────────────────────┘
                        │ supabase-js (service role + anon key)
┌───────────────────────▼─────────────────────────────────────────┐
│  Supabase Postgres  (self-hosted · smartmedia-db.smartgenapp.com)│
│  9 tables: os_agents · os_goals · os_skills · os_workflows      │
│            os_agent_runs · os_connectors · os_activity          │
│            os_knowledge_nodes · os_knowledge_edges              │
│  2 views:  os_activity_enriched · os_knowledge_nodes_enriched   │
│  RLS:      ALL policies use  os_current_org() = org_id         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cron subsystems

Three Vercel cron endpoints drive the autonomous layer:

### Brain ingest  (`/api/cron/os-brain-ingest`)

Iterates every live connector for every org, pulls new data (Slack messages, Notion pages, webhook payloads, etc.) and writes `KnowledgeNode` rows via `repository.knowledge.nodes.upsert`. Deduplicates by `(orgId, externalId, kind)`. Schedule: every 6 hours.

### Goals sentinel  (`/api/cron/os-goals-sentinel`)

For every org's `os_goals` rows with `cadence` matching the current tick:

1. Builds a `PredicateContext` from live CM data (channels, conversations, agent runs).
2. Looks up the predicate function from `lib/os/goals/predicates.ts` by `spec.predicate_key`.
3. Calls `predicate(ctx)` → `{ ok, evidence }`.
4. Writes result back via `repository.goals.markVerified(orgId, id, now, ok, evidence)`.
5. If `!ok` the goal status becomes `breach`; otherwise `ok`.

Available predicate keys:

| Key | What it checks |
|---|---|
| `uptime_channels` | >= 90% of channels live |
| `sla_response` | P50 response < 5 min AND max < 15 min |
| `budget_daily` | AI cost today < $10 |
| `leads_unassigned` | No lead unassigned > 30 min |
| `rate_limit_meta` | Meta API hits last hour < 180 |
| `trust_avg` | Average agent trust score >= 0.75 |

Schedule: every 15 minutes.

### Skills runner  (`/api/cron/os-skills-runner`)

Fetches all `os_skills` rows where `next_run_at <= now`. For each, resolves the agent from `os_agents`, calls `AgentRuntime.run(agent, { prompt: skill.prompt })`, stores the run in `os_agent_runs`, and updates `next_run_at` using the skill's cron expression. Schedule: every 5 minutes.

---

## Agent runtime

`lib/os/agents/runtime.ts` wraps the Anthropic SDK:

1. Builds a system prompt from `agent.constitution` (rate limits, escalation rules, custom rules).
2. Calls Claude with the prompt and tool list from `agent.tools`.
3. Passes output to `verify(agent, output)` (heuristic checks).
4. Updates `agent.trustScore` via `updateTrust(agent, verifyResult)`.
5. Returns `{ output, run, verifyResult }`.

The verify gate (`lib/os/agents/verify.ts`) and trust ledger (`lib/os/agents/trust.ts`) implement the Agentic-OS doctrine: no agent output escapes without a pass/fail record.

---

## Multi-tenant model

Every `os_*` table has an `org_id uuid NOT NULL` column. RLS uses a Postgres helper function:

```sql
CREATE OR REPLACE FUNCTION os_current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid
$$;
```

All RLS policies take the form:

```sql
-- read
USING (org_id = os_current_org())
-- write
WITH CHECK (org_id = os_current_org())
```

The `org_id` claim is set in the Supabase JWT by the Next.js middleware, which reads the user's `cm_users.cm_client_id` and maps it to an org UUID. Users without a valid `org_id` claim see zero rows from any `os_*` table.

---

## Feature flag flow

Access to the OS shell is gated by the `community-os` flag, implemented with `@vercel/flags`.

```
Request hits [locale]/(shell)/os/layout.tsx
  └── identify(user) → looks up user email in os_cohorts.emails
        └── if found → flag = true → shell renders
        └── if not found → redirect /es/dashboard
```

The `os_cohorts` table stores arrays of emails per org. The flag `identify` function runs a Supabase query with the service role key (bypasses RLS) to check membership. Adding an email to `os_cohorts` is enough to grant access — no code deploy needed.
