# Community OS — Documentation

Community OS is a private namespace (`/es/os/*`) embedded inside the Community Manager Platform. It gives an org a lightweight operating layer on top of the CM platform: AI agents with constitutions, standing goals with automated sentinel checks, knowledge brain, skill runner, and connector integrations — all scoped per org via Supabase RLS.

It does **not** touch any existing `cm_*` table or route. All state lives in `os_*` tables.

---

## Why it exists

The CM platform manages conversations, channels, and social content. Community OS adds the *org intelligence* layer: who are the agents, what are their rules, are SLAs being met, what knowledge has been ingested, and which external tools are connected.

---

## Architecture overview

```
Browser
  └── /es/os/* pages   (Next.js 14 App Router · [locale]/(shell)/os/)
        └── API routes  /api/os/*
              └── OSRepository interface
                    ├── SupabaseAdapter   (web/src/lib/os/adapters/supabase.ts)
                    └── InMemoryAdapter   (tests / local dev)
                          └── Supabase Postgres (self-hosted)
                                ├── 9 os_* tables
                                ├── RLS via os_current_org() JWT claim
                                └── 2 enriched views
```

Cron-driven background jobs:

| Endpoint | Purpose | Schedule |
|---|---|---|
| `POST /api/cron/os-brain-ingest` | Pull connector data into knowledge nodes | Every 6 h |
| `POST /api/cron/os-goals-sentinel` | Evaluate standing goals via predicates | Every 15 min |
| `POST /api/cron/os-skills-runner` | Execute scheduled skill definitions | Every 5 min |

---

## Docs index

| Doc | Contents |
|---|---|
| [architecture.md](./architecture.md) | Layer diagram, multi-tenant model, feature flag flow |
| [onboarding-new-org.md](./onboarding-new-org.md) | Step-by-step: give a new org access to Community OS |
| [env-vars.md](./env-vars.md) | All required environment variables with descriptions |
| [runbook.md](./runbook.md) | Operational tasks: add agent, add goal, connect Slack, debug |
| [tables.md](./tables.md) | `os_*` schema reference: columns, indexes, RLS policies, views |

---

## Quick start (dev)

### 1. Login

Navigate to `http://localhost:3000/es/login` and sign in with your dev account.

### 2. Seed demo data

With the dev server running:

```bash
curl -X POST http://localhost:3000/api/os/dev/seed \
  -H "Authorization: Bearer <your-session-token>"
```

This creates a sample agent, goal, skill, connector, and activity row for your org.

### 3. Navigate to the console

Go to `http://localhost:3000/es/os` — you should see the OS dashboard shell.

If the page is not visible, your user email may not be in `os_cohorts.emails`. See [onboarding-new-org.md](./onboarding-new-org.md).

---

## Key source paths

```
web/src/
  app/
    [locale]/(shell)/os/   — UI pages (agents, brain, goals, connectors…)
    api/os/                — REST endpoints
    api/cron/os-*/         — Cron job handlers
  lib/os/
    repository.ts          — OSRepository interface
    adapters/supabase.ts   — Supabase implementation
    schemas/               — Zod schemas for all entities
    agents/runtime.ts      — Agent execution + verify gate
    agents/trust.ts        — Trust score update logic
    goals/sentinel.ts      — Goal evaluation loop
    goals/predicates.ts    — Predicate library
    brain/ingest.ts        — Knowledge ingestion
    connectors/            — Per-provider adapters
    crypto.ts              — Token encryption helpers
```
