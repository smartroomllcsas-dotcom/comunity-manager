# Community OS — Environment Variables

All variables live in Vercel project settings (or `.env.local` for local dev). Copy `.env.example` in the repo root as a starting point.

---

## Core — Required for any OS functionality

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) | `https://smartmedia-db.smartgenapp.com` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public, used client-side) | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS. Never expose to browser. | `eyJ...` |
| `ANTHROPIC_API_KEY` | Anthropic API key for agent runtime (`lib/os/agents/runtime.ts`) | `sk-ant-...` |
| `TOKEN_ENCRYPTION_KEY` | 32-byte key (base64 or hex) for encrypting OAuth access tokens stored in `os_connectors`. Generate: `openssl rand -base64 32` | `abc123==` |
| `CRON_SECRET` | Shared secret that Vercel attaches to cron requests. Validated in every `/api/cron/*` handler. | `random-secret` |

---

## Feature flag / cohort gating

| Variable | Description | Example |
|---|---|---|
| `LEONEL_ORG_IDS` | Comma-separated org UUIDs that are always granted the `community-os` flag (bootstrap before cohorts are seeded) | `uuid1,uuid2` |

---

## Security

| Variable | Description | Example |
|---|---|---|
| `APPROVAL_HMAC_SECRET` | 32-byte hex key. HMAC-signs OAuth state params for Slack and Notion connectors (CSRF hardening). Falls back to `CRON_SECRET` if unset. Generate: `openssl rand -hex 32` | `deadbeef...` |

---

## Slack connector  (`/api/os/connectors/slack/*`)

| Variable | Description | Example |
|---|---|---|
| `SLACK_CLIENT_ID` | Slack app client ID from api.slack.com/apps | `1234567890.123` |
| `SLACK_CLIENT_SECRET` | Slack app client secret | `abc...` |
| `SLACK_OAUTH_REDIRECT_URL` | Must match the redirect URI registered in the Slack app. Dev: `http://localhost:3000/api/os/connectors/slack/callback` Prod: `https://www.comunitymanager.io/api/os/connectors/slack/callback` | see left |
| `SLACK_BOT_TOKEN` | (Optional) Bot token for proactive notifications via `chat.postMessage`. Separate from the per-org OAuth token. | `xoxb-...` |
| `SLACK_WEBHOOK_URL` | (Optional) Incoming webhook for simple notifications. | `https://hooks.slack.com/...` |

Required bot token scopes: `chat:write`, `chat:write.public`, `channels:read`, `team:read`.

---

## Notion connector  (`/api/os/connectors/notion/*`)

| Variable | Description | Example |
|---|---|---|
| `NOTION_CLIENT_ID` | Notion integration OAuth client ID | `abc-123` |
| `NOTION_CLIENT_SECRET` | Notion integration OAuth client secret | `secret_...` |
| `NOTION_OAUTH_REDIRECT_URL` | `https://<host>/api/os/connectors/notion/callback` | see left |

---

## Supabase JWT (RLS)

| Variable | Description | Example |
|---|---|---|
| `SUPABASE_JWT_SECRET` | Used in tests to mint fake JWTs with `org_id` claim for RLS smoke tests. In production this is managed by Supabase directly. | `super-secret` |

---

## Optional — AI / Skills mode

| Variable | Description | Default |
|---|---|---|
| `SKILLS_MODE` | Controls how skills are injected into agent prompts. Values: `retrieval` (vector search), `tools` (tool-use), `off` | `retrieval` |

---

## Not OS-specific but required in the same deployment

These are used by the broader CM platform and must be present for the app to boot:

- `NEXT_PUBLIC_FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- `WHATSAPP_API_VERSION`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

See the full `.env.example` in the repo root for the complete list.
