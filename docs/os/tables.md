# Community OS — Table Reference

All tables are in the `public` schema of the self-hosted Supabase instance. Every table has:
- `org_id uuid NOT NULL` — tenant key
- RLS enabled via `os_current_org()` JWT claim

---

## os_agents

Stores agent definitions including their constitution and trust state.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key. Human-readable slug (e.g. `agent-inbox-01`) |
| `org_id` | uuid | FK to org; RLS tenant key |
| `department_id` | text | Logical grouping (e.g. `inbox`, `content`, `analytics`) |
| `name` | text | Display name |
| `role` | text | One-line description of what this agent does |
| `status` | text | `active` \| `idle` \| `training` \| `planned` |
| `tier` | text | `lead` \| `specialist` \| `worker` |
| `description` | text | Long-form description |
| `model` | text | Claude model ID (e.g. `claude-sonnet-4-5`) |
| `tools` | text[] | Tool names available to this agent |
| `parent_id` | text | Optional parent agent for hierarchies |
| `instance` | text | `builtin` or custom instance ID |
| `constitution` | jsonb | Rate limits, escalation rules, custom rules |
| `trust_score` | float | 0–1 rolling trust score |
| `trust_ledger` | jsonb | Array of `{ runId, verdict, at }` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Indexes:** `(org_id)`, `(org_id, department_id)`, `(org_id, status)`

**RLS policies:**
- `tenant_read`: `USING (org_id = os_current_org())`
- `tenant_write`: `WITH CHECK (org_id = os_current_org())`

---

## os_goals

Standing goals evaluated by the sentinel cron.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `org_id` | uuid | RLS tenant key |
| `title` | text | Human-readable goal title |
| `spec` | jsonb | Must include `predicate_key`; may include thresholds |
| `owner_agent_id` | text | Optional agent responsible for this goal |
| `cadence` | text | Cron expression for evaluation frequency |
| `last_checked_at` | timestamptz | Timestamp of last sentinel evaluation |
| `last_status` | text | `ok` \| `breach` \| `unknown` |
| `last_evidence` | jsonb | Output from the predicate function |
| `created_at` | timestamptz | |

**Indexes:** `(org_id)`, `(org_id, last_status)`

**RLS:** same `tenant_read` / `tenant_write` pattern.

---

## os_skills

Skill definitions — scheduled prompts run by the skills runner cron.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `org_id` | uuid | RLS tenant key |
| `name` | text | Display name |
| `prompt` | text | Prompt sent to the assigned agent |
| `agent_id` | text | Agent that executes this skill |
| `cron_expr` | text | When to run (null = manual only) |
| `next_run_at` | timestamptz | Computed by runner after each execution |
| `last_run_at` | timestamptz | |
| `enabled` | boolean | |
| `created_at` | timestamptz | |

**RLS:** `tenant_read` / `tenant_write`.

---

## os_workflows

Multi-step automation definitions.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `org_id` | uuid | RLS tenant key |
| `name` | text | |
| `description` | text | |
| `steps` | jsonb | Ordered array of step definitions |
| `trigger` | jsonb | Trigger config (webhook, schedule, manual) |
| `enabled` | boolean | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**RLS:** `tenant_read` / `tenant_write`.

---

## os_agent_runs

Immutable log of every agent execution.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `org_id` | uuid | RLS tenant key |
| `agent_id` | text | Which agent ran |
| `skill_id` | text | Which skill triggered the run (nullable) |
| `input` | jsonb | `{ prompt, context }` |
| `output` | jsonb | Raw model output |
| `verify_pass` | boolean | Result of the verify gate |
| `verify_reason` | text | Why it failed (if applicable) |
| `tokens_used` | int | Prompt + completion tokens |
| `cost_usd` | float | Estimated cost |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz | |

**Indexes:** `(org_id, agent_id)`, `(org_id, started_at DESC)`

**RLS:** tenant-scoped read. Inserts are service-role only (done by the runtime).

---

## os_connectors

OAuth and API key integrations per org.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key (e.g. `slack`, `notion`) |
| `org_id` | uuid | RLS tenant key |
| `kind` | text | `webhook` \| `oauth` \| `apikey` \| `imap` \| `cron` |
| `provider` | text | `slack`, `notion`, `stripe`, `gmail`, `instagram`, `meta`, `waha`, `webhooks`, `google-calendar` |
| `status` | text | `not_configured` \| `configured` \| `live` \| `error` |
| `last_check_at` | timestamptz | Last health-check timestamp |
| `last_error` | text | Most recent error message |
| `config` | jsonb | Non-secret connector config (workspace ID, channel ID, etc.) |
| `secret_ref` | text | Reference to encrypted token stored separately |

**Note:** Access tokens are encrypted with `TOKEN_ENCRYPTION_KEY` before storage. The `secret_ref` column holds the encrypted blob.

**RLS:** `tenant_read` / `tenant_write`.

---

## os_activity

Event feed — every notable OS action is appended here.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `org_id` | uuid | RLS tenant key |
| `kind` | text | Event type (e.g. `agent_run`, `goal_breach`, `connector_live`) |
| `agent_id` | text | Related agent (nullable) |
| `run_id` | text | Related run (nullable) |
| `payload` | jsonb | Event-specific data |
| `occurred_at` | timestamptz | Event timestamp |

**Indexes:** `(org_id, occurred_at DESC)`

Realtime is enabled on this table — the UI subscribes via `repository.activity.subscribe()`.

**RLS:** tenant-scoped read.

---

## os_knowledge_nodes

Knowledge graph nodes ingested from connectors.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `org_id` | uuid | RLS tenant key |
| `external_id` | text | Source system ID (Slack message ID, Notion page ID, etc.) |
| `kind` | text | `message` \| `page` \| `event` \| `metric` \| `contact` |
| `title` | text | Short label |
| `body` | text | Full text content |
| `meta` | jsonb | Source-specific metadata |
| `connector_id` | text | Which connector produced this node |
| `first_seen_at` | timestamptz | |
| `last_seen_at` | timestamptz | Updated by `knowledge.nodes.touch()` |

**Unique index:** `(org_id, external_id, kind)` — deduplication key for ingest.

**RLS:** `tenant_read` / `tenant_write`.

---

## os_knowledge_edges

Directed relationships between knowledge nodes.

| Column | Type | Notes |
|---|---|---|
| `id` | text | Primary key |
| `org_id` | uuid | RLS tenant key |
| `from_id` | text | Source node |
| `to_id` | text | Target node |
| `relation` | text | Relationship type (e.g. `mentions`, `replies_to`, `linked_from`) |
| `weight` | float | Edge strength (default 1.0) |
| `created_at` | timestamptz | |

**Indexes:** `(org_id, from_id)`, `(org_id, relation)`

**RLS:** `tenant_read` / `tenant_write`.

---

## os_cohorts

Feature flag membership — controls access to the Community OS shell.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `org_id` | uuid | The org this cohort belongs to |
| `emails` | text[] | Email addresses granted access |
| `label` | text | Optional descriptive label |
| `created_at` | timestamptz | |

**Note:** Queried with **service role key** (bypasses RLS) by the feature flag `identify` function. This is intentional — the flag check happens before the user's session org claim is established.

---

## Views

### os_activity_enriched

Joins `os_activity` with `os_agents` to avoid N+1 fetches in the activity feed.

```sql
SELECT
  a.*,
  ag.name   AS agent_name,
  ag.status AS agent_status,
  ag.tier   AS agent_tier
FROM os_activity a
LEFT JOIN os_agents ag ON ag.id = a.agent_id AND ag.org_id = a.org_id;
```

RLS is inherited from the underlying tables.

### os_knowledge_nodes_enriched

Joins `os_knowledge_nodes` with connector metadata for display in the brain view.

```sql
SELECT
  n.*,
  c.provider  AS connector_provider,
  c.status    AS connector_status
FROM os_knowledge_nodes n
LEFT JOIN os_connectors c ON c.id = n.connector_id AND c.org_id = n.org_id;
```
