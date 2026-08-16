# Community Manager Platform

Multi-tenant community management platform. Manages conversations, channels, social publishing, and AI-assisted inbox across multiple brands and clients.

## Docs

| Section | Path |
|---|---|
| Local run guide | [LOCAL_RUN.md](./LOCAL_RUN.md) |
| Deploy guide | [DEPLOY_PRODUCTION.md](./DEPLOY_PRODUCTION.md) |
| Runbook | [RUNBOOK.md](./RUNBOOK.md) |

## Community OS

Community OS is the org-intelligence layer embedded inside the platform. It provides AI agents with constitutions, standing goals, knowledge brain, skill runner, and connector integrations — all scoped per org via Supabase RLS.

Full documentation: [docs/os/README.md](./docs/os/README.md)

| Doc | Contents |
|---|---|
| [Architecture](./docs/os/architecture.md) | Layer diagram, multi-tenant model, cron subsystems |
| [Onboarding a new org](./docs/os/onboarding-new-org.md) | Step-by-step access setup |
| [Environment variables](./docs/os/env-vars.md) | All required env vars with descriptions |
| [Runbook](./docs/os/runbook.md) | Add agents, goals, connectors; debug |
| [Table reference](./docs/os/tables.md) | `os_*` schema, indexes, RLS policies, views |

## Architecture overview

```
web/                   Next.js 14 app (App Router + next-intl)
  src/app/             Routes: (dashboard), (agency), (admin), [locale]/(shell)/os/*
  src/lib/             Shared libs: os/, ai/, inngest/, supabase/
supabase/              Migrations + seed
orchestrator/          Multi-agent orchestrator (AGENT.md)
agents/                Specialized micro-agents
skills/                76 fused skills
tools/                 Python + Node.js CLI scripts
```

## Quick start

See [LOCAL_RUN.md](./LOCAL_RUN.md) for full setup. In short:

```bash
cd web
cp ../.env.example .env.local   # fill in secrets
pnpm install
pnpm dev
```
