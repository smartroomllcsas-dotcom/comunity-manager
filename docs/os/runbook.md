# Community OS — Runbook

Operational tasks for engineers and admins running the Community OS layer.

---

## Adding an agent with a constitution

### Via API

```bash
curl -X POST /api/os/agents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "agent-inbox-01",
    "departmentId": "inbox",
    "name": "Inbox Responder",
    "role": "Responds to inbound leads",
    "status": "active",
    "tier": "worker",
    "model": "claude-sonnet-4-5",
    "tools": ["send_message", "escalate"],
    "constitution": {
      "max_msg_per_hour": 20,
      "max_msg_per_minute_per_contact": 2,
      "escalate_on_negative_sentiment": true,
      "never_promise_prices": true,
      "custom_rules": "Always greet the contact by name."
    }
  }'
```

### Constitution keys recognized by the agent runtime

| Key | Type | Effect |
|---|---|---|
| `max_msg_per_hour` | number | Injects rate-limit rule into system prompt |
| `max_msg_per_minute_per_contact` | number | Per-contact rate limit rule |
| `escalate_on_negative_sentiment` | boolean | Adds escalation rule |
| `never_promise_prices` | boolean | Adds price-promise prohibition |
| `custom_rules` | string or string[] | Appended verbatim to system prompt |

All other keys are stored in the JSONB `constitution` column and available to custom skill code.

---

## Adding a standing goal

Goals are evaluated by the sentinel cron every 15 minutes. Each goal references a `predicate_key` that maps to a function in `lib/os/goals/predicates.ts`.

```bash
curl -X POST /api/os/goals \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "goal-uptime-01",
    "title": "Channel Uptime >= 90%",
    "cadence": "*/15 * * * *",
    "spec": {
      "predicate_key": "uptime_channels"
    }
  }'
```

### Available predicate keys

| Key | Passes when |
|---|---|
| `uptime_channels` | >= 90% of channels are live |
| `sla_response` | P50 response < 5 min AND max < 15 min |
| `budget_daily` | AI cost today <= $10 USD |
| `leads_unassigned` | No lead unassigned for > 30 min |
| `rate_limit_meta` | Meta API hits last hour < 180 |
| `trust_avg` | Average agent trust score >= 0.75 |

Goal status transitions: `unknown` → `ok` / `breach`. Evidence is stored in `last_evidence` (JSONB).

---

## Connecting a Slack integration

### OAuth flow (per org)

1. User navigates to `/es/os/connectors` and clicks **Connect Slack**.
2. The UI calls `GET /api/os/connectors/slack/authorize`, which redirects to Slack's OAuth page.
3. The user authorizes the app in Slack.
4. Slack redirects to `SLACK_OAUTH_REDIRECT_URL` → `/api/os/connectors/slack/callback`.
5. The callback exchanges the code for a token, encrypts it with `TOKEN_ENCRYPTION_KEY`, and stores it in `os_connectors` with `provider = 'slack'` and `status = 'live'`.
6. To disconnect: `POST /api/os/connectors/slack/disconnect`.

### Troubleshooting OAuth

- **State mismatch error**: `APPROVAL_HMAC_SECRET` is missing or changed between authorize and callback. Check the env var.
- **Token not saved**: `TOKEN_ENCRYPTION_KEY` must be set. Without it, `lib/os/crypto.ts` throws before the insert.
- **Slack app not authorized**: Ensure the redirect URI in the Slack app settings matches `SLACK_OAUTH_REDIRECT_URL` exactly.

### Notion follows the same pattern

- Authorize: `GET /api/os/connectors/notion/authorize`
- Callback: `/api/os/connectors/notion/callback`
- Disconnect: `POST /api/os/connectors/notion/disconnect`
- Env vars: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_OAUTH_REDIRECT_URL`

---

## Debugging

### RLS smoke test

Confirm a specific org can read its own data:

```sql
-- In Supabase Studio SQL editor, set the claim then query
SET LOCAL request.jwt.claims = '{"org_id": "<uuid>", "role": "authenticated"}';
SELECT id, name, status FROM os_agents;
SELECT id, title, last_status FROM os_goals;
```

Expected: rows belonging to `<uuid>` only. If empty when you expect rows, either the data is missing or the claim is wrong.

### Checking Supabase logs

1. Open Supabase Studio → **Logs** → **Postgres**.
2. Filter by `os_` to see all OS-related queries.
3. For RLS violations, filter by `permission denied`.

For API-level errors, check **Logs** → **Edge Functions** (if using edge) or the Vercel function logs.

### Observability UI

Navigate to `/es/os/observability` for a live view of:
- Recent agent runs with pass/fail status
- Goal breach timeline
- Connector health
- Brain ingest log

### Cron endpoints and their schedule

| Endpoint | Schedule | Description |
|---|---|---|
| `POST /api/cron/os-brain-ingest` | Every 6 hours | Ingests data from live connectors into knowledge nodes |
| `POST /api/cron/os-goals-sentinel` | Every 15 min | Evaluates all standing goals |
| `POST /api/cron/os-skills-runner` | Every 5 min | Runs scheduled skill definitions |

All cron routes validate `Authorization: Bearer <CRON_SECRET>`. To invoke manually:

```bash
curl -X POST https://<host>/api/cron/os-goals-sentinel \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Forcing a brain ingest for a single org

The brain ingest cron runs for all orgs. To trigger it immediately for a specific org only, call the ingest API directly:

```bash
curl -X POST /api/os/brain/ingest \
  -H "Authorization: Bearer <user-token>"
```

This runs ingest scoped to the authenticated user's org.

### Agent trust score is too low

A trust score below 0.75 triggers the `trust_avg` goal to breach. To inspect the ledger:

```sql
SELECT id, name, trust_score, trust_ledger
FROM os_agents
WHERE org_id = '<uuid>'
ORDER BY trust_score ASC;
```

The `trust_ledger` JSONB array shows each run verdict (`pass`/`fail`) with timestamp. A run fails the verify gate if the agent output contains prohibited patterns (defined in `lib/os/agents/verify.ts`). Review recent agent runs in `/es/os/agents/<id>` to identify the failing prompts.
