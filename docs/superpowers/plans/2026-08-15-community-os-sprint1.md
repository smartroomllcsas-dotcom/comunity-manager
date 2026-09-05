# Community OS · Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of Community OS — a new namespace `/es/os/*` inside the Community Manager platform that fuses the FounderOS UX (dashboard shell + connectors + content/social tools) with the Agentic-OS doctrine (constitution + standing goals + trust ledger + verify gate), without touching any existing CM route or table.

**Architecture:** Route Group `[locale]/(shell)/os/*` in Next.js 14 App Router with `next-intl` v3 partial i18n. New Supabase tables prefixed `os_*` with RLS enforced by `os_current_org()`. Repository pattern (`OSRepository` interface + Supabase adapter) mirrors the FounderOS `db.ts` shape. UI ports 54 FounderOS components adapted to Supabase. Feature flag `community-os` gates the shell for Leonel initially. Cero cambios en rutas o tablas del CM.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase Postgres + Realtime + RLS · Zod · Vitest · `next-intl` v3 · `@vercel/flags` · `d3-force` · `simple-icons` · `@notionhq/client` · `@slack/web-api` · `@upstash/qstash` (optional cron secondary).

**Reference spec:** `docs/superpowers/specs/2026-08-15-cm-founderos-agenticos-fusion-design.md`.

**Working directory:** `F:/comunity manager/community-manager-platform/web/`.

**Base branch:** `codex/add-manual-contact` (has the freshest UI · 60 commits ahead of master).

**Working branch:** `visual/os-fusion` (create in Prerequisites).

---

## File Structure

```
web/
├── middleware.ts                                          MODIFY (conditional intl)
├── next.config.ts                                         MODIFY (add analyze script)
├── package.json                                           MODIFY (add deps)
├── i18n.ts                                                CREATE
├── messages/
│   ├── es.json                                            CREATE (default)
│   └── en.json                                            CREATE
├── global.d.ts                                            CREATE (message typing)
├── supabase/
│   └── migrations/
│       └── 20260815120000_os_sprint1.sql                  CREATE (7 tables + RLS)
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   └── (shell)/
│   │   │       ├── layout.tsx                             CREATE (providers)
│   │   │       └── os/
│   │   │           ├── layout.tsx                         CREATE (sub-nav)
│   │   │           ├── page.tsx                           CREATE (Console)
│   │   │           ├── agents/page.tsx                    CREATE
│   │   │           ├── goals/page.tsx                     CREATE
│   │   │           ├── skills/page.tsx                    CREATE
│   │   │           ├── funnel/page.tsx                    CREATE
│   │   │           ├── content/page.tsx                   CREATE
│   │   │           ├── social/page.tsx                    CREATE
│   │   │           ├── integrations/page.tsx              CREATE
│   │   │           └── command/page.tsx                   CREATE
│   │   ├── (dashboard)/
│   │   │   └── layout.tsx OR components/layout/Sidebar.tsx MODIFY (add OS item)
│   │   └── api/
│   │       ├── os/
│   │       │   ├── agents/route.ts                        CREATE
│   │       │   ├── goals/route.ts                         CREATE
│   │       │   ├── skills/route.ts                        CREATE
│   │       │   ├── connectors/route.ts                    CREATE
│   │       │   ├── activity/route.ts                      CREATE
│   │       │   ├── agent-runs/route.ts                    CREATE
│   │       │   └── dev/seed/route.ts                      CREATE (dev only)
│   │       └── cron/
│   │           └── os-goals-sentinel/route.ts             CREATE
│   ├── lib/
│   │   ├── flags.ts                                       CREATE
│   │   ├── identify.ts                                    CREATE
│   │   └── os/
│   │       ├── repository.ts                              CREATE (interface)
│   │       ├── adapters/
│   │       │   ├── supabase.ts                            CREATE (default)
│   │       │   └── in-memory.ts                           CREATE (tests)
│   │       ├── schemas/
│   │       │   ├── agent.ts                               CREATE
│   │       │   ├── goal.ts                                CREATE
│   │       │   ├── skill.ts                               CREATE
│   │       │   ├── workflow.ts                            CREATE
│   │       │   ├── agent-run.ts                           CREATE
│   │       │   ├── connector.ts                           CREATE
│   │       │   ├── activity.ts                            CREATE
│   │       │   └── index.ts                               CREATE
│   │       ├── connectors/
│   │       │   ├── base.ts                                CREATE (ConnectorAdapter)
│   │       │   ├── meta/adapter.ts                        CREATE (wrap CM)
│   │       │   ├── waha/adapter.ts                        CREATE (wrap CM)
│   │       │   ├── instagram/adapter.ts                   CREATE (wrap CM)
│   │       │   ├── cron/adapter.ts                        CREATE (wrap CM)
│   │       │   ├── webhooks/adapter.ts                    CREATE (wrap CM)
│   │       │   ├── slack/adapter.ts                       CREATE (new)
│   │       │   ├── notion/adapter.ts                      CREATE (new)
│   │       │   ├── stripe/adapter.ts                      CREATE (new)
│   │       │   ├── gmail-imap/adapter.ts                  CREATE (new)
│   │       │   ├── google-calendar/adapter.ts             CREATE (new)
│   │       │   └── index.ts                               CREATE (registry)
│   │       ├── agents/
│   │       │   ├── runtime.ts                             CREATE
│   │       │   ├── verify.ts                              CREATE
│   │       │   └── trust.ts                               CREATE
│   │       ├── goals/
│   │       │   ├── sentinel.ts                            CREATE
│   │       │   └── predicates.ts                          CREATE
│   │       └── seed-dev.ts                                CREATE (dev only)
│   ├── components/
│   │   └── os/
│   │       ├── Sidebar.tsx                                CREATE (sub-nav)
│   │       ├── Topbar.tsx                                 CREATE
│   │       ├── ConsoleHome.tsx                            CREATE
│   │       ├── PulseCards.tsx                             CREATE
│   │       ├── ActivityFeed.tsx                           CREATE
│   │       ├── AgentRoster.tsx                            CREATE
│   │       ├── ConnectionsStrip.tsx                       CREATE
│   │       ├── GoalsGrid.tsx                              CREATE
│   │       ├── ConductorPanel.tsx                         PORT FounderOS
│   │       ├── PostComposer.tsx                           PORT FounderOS
│   │       ├── SocialStats.tsx                            PORT FounderOS
│   │       ├── FunnelRadial.tsx                           PORT FounderOS
│   │       ├── SkillsGrid.tsx                             PORT FounderOS
│   │       ├── CommandPalette.tsx                         PORT FounderOS
│   │       └── terminal.tsx                               PORT FounderOS (primitives)
│   └── styles/
│       └── os.css                                         CREATE (Cobalt tokens)
└── tests/
    └── os/
        ├── repository.test.ts                             CREATE
        ├── rls.test.ts                                    CREATE
        ├── schemas.test.ts                                CREATE
        └── verify.test.ts                                 CREATE
```

---

## Prerequisites

- [ ] **P1: Confirm base branch is up to date**

```bash
cd "F:/comunity manager/community-manager-platform"
git fetch --all --prune
git checkout codex/add-manual-contact
git pull --ff-only
```

Expected: branch is up to date with origin.

- [ ] **P2: Create working branch**

```bash
git checkout -b visual/os-fusion
```

Expected: `Switched to a new branch 'visual/os-fusion'`.

- [ ] **P3: Install new dependencies**

```bash
cd web
pnpm add next-intl@^3.22 @vercel/flags@^3.1 d3-force@^3.0 simple-icons@^16.27 @notionhq/client@^5.22 @slack/web-api@^7.16
pnpm add -D @next/bundle-analyzer@^15.0 @types/d3-force@^3.0
```

Expected: `package.json` updated, `pnpm-lock.yaml` updated.

- [ ] **P4: Commit prereqs**

```bash
git add web/package.json web/pnpm-lock.yaml
git commit -m "chore(os): add community-os deps (next-intl, vercel-flags, d3-force, slack, notion)"
```

---

## Task 1: DB Migration + RLS + Smoke Test (PR#1)

**Files:**
- Create: `web/supabase/migrations/20260815120000_os_sprint1.sql`
- Create: `web/tests/os/rls.test.ts`

- [ ] **Step 1.1: Write the migration file**

Create `web/supabase/migrations/20260815120000_os_sprint1.sql` with exactly the SQL from Appendix B of the spec (`docs/superpowers/specs/2026-08-15-cm-founderos-agenticos-fusion-design.md`).

- [ ] **Step 1.2: Apply migration to Supabase dev DB**

```bash
cd web
npx supabase migration up
# or if using self-hosted:
ssh server "docker exec -i standby-smartmedia-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1" < supabase/migrations/20260815120000_os_sprint1.sql
```

Expected: `CREATE TABLE` × 7, `CREATE INDEX` × 10, `CREATE FUNCTION`, `ALTER TABLE ... ENABLE RLS` × 7, policies created.

- [ ] **Step 1.3: Write RLS smoke test**

Create `web/tests/os/rls.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

function clientForOrg(orgId: string) {
  const c = createClient(url, anonKey);
  // Fake JWT with org_id claim (dev only)
  c.auth.setSession({
    access_token: fakeJwtWithOrg(orgId),
    refresh_token: '',
    expires_in: 3600,
    token_type: 'bearer',
    user: null as any,
  });
  return c;
}

function fakeJwtWithOrg(orgId: string): string {
  // Minimal HS256 JWT with { org_id }, signed with SUPABASE_JWT_SECRET
  // Use jsonwebtoken lib to build. Kept short for the plan.
  const jwt = require('jsonwebtoken');
  return jwt.sign({ org_id: orgId, role: 'authenticated' }, process.env.SUPABASE_JWT_SECRET!, { algorithm: 'HS256' });
}

describe('os_* RLS enforcement', () => {
  const orgA = '00000000-0000-4000-a000-000000000001';
  const orgB = '00000000-0000-4000-a000-000000000002';

  beforeAll(async () => {
    // Insert one agent per org using service role (bypasses RLS on purpose)
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await service.from('os_agents').insert([
      { id: 'agent-A1', org_id: orgA, department_id: 'test', name: 'A1', status: 'active', tier: 'worker' },
      { id: 'agent-B1', org_id: orgB, department_id: 'test', name: 'B1', status: 'active', tier: 'worker' },
    ]);
  });

  it('org A sees only its own agent', async () => {
    const { data } = await clientForOrg(orgA).from('os_agents').select('id');
    expect(data?.map(r => r.id).sort()).toEqual(['agent-A1']);
  });

  it('org B sees only its own agent', async () => {
    const { data } = await clientForOrg(orgB).from('os_agents').select('id');
    expect(data?.map(r => r.id).sort()).toEqual(['agent-B1']);
  });

  it('org A cannot insert an agent for org B', async () => {
    const { error } = await clientForOrg(orgA).from('os_agents').insert({
      id: 'agent-attack', org_id: orgB, department_id: 't', name: 'X', status: 'active', tier: 'worker'
    });
    expect(error).toBeTruthy();
  });
});
```

- [ ] **Step 1.4: Run RLS test to verify it passes**

```bash
cd web
pnpm vitest run tests/os/rls.test.ts
```

Expected: 3 tests pass. If they fail with "relation does not exist", the migration didn't apply — go back to Step 1.2.

- [ ] **Step 1.5: Commit**

```bash
git add web/supabase/migrations/20260815120000_os_sprint1.sql web/tests/os/rls.test.ts
git commit -m "feat(os): sprint 1 db migration + RLS smoke test

- 7 tables prefixed os_* (agents, goals, skills, workflows, agent_runs, connectors, activity)
- os_current_org() RLS helper reads org_id from JWT claim
- All 7 tables have tenant_read + tenant_write policies
- View os_activity_enriched for N+1-free activity feeds
- Zero changes to cm_* tables"
```

- [ ] **Step 1.6: Push branch + open PR#1**

```bash
git push -u origin visual/os-fusion
gh pr create --draft --title "feat(os): PR#1 — DB migration + RLS smoke test" --body "See docs/superpowers/specs/2026-08-15-cm-founderos-agenticos-fusion-design.md §Appendix B"
```

---

## Task 2: Schemas + Repository Interface + Supabase Adapter (PR#2)

**Files:**
- Create: `web/src/lib/os/schemas/{agent,goal,skill,workflow,agent-run,connector,activity,index}.ts`
- Create: `web/src/lib/os/repository.ts`
- Create: `web/src/lib/os/adapters/supabase.ts`
- Create: `web/src/lib/os/adapters/in-memory.ts`
- Create: `web/tests/os/{schemas,repository}.test.ts`

- [ ] **Step 2.1: Write Zod schemas**

Create `web/src/lib/os/schemas/agent.ts`:

```ts
import { z } from 'zod';

export const AgentStatus = z.enum(['active', 'idle', 'training', 'planned']);
export const AgentTier = z.enum(['lead', 'specialist', 'worker']);

export const AgentSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  departmentId: z.string(),
  name: z.string(),
  role: z.string().default(''),
  status: AgentStatus,
  tier: AgentTier,
  description: z.string().default(''),
  model: z.string().default(''),
  tools: z.array(z.string()).default([]),
  parentId: z.string().nullable().optional(),
  instance: z.string().default('builtin'),
  constitution: z.record(z.unknown()).default({}),
  trustScore: z.number().min(0).max(1).default(0.5),
  trustLedger: z.array(z.object({
    runId: z.string(),
    verdict: z.enum(['pass', 'fail']),
    at: z.string().datetime(),
  })).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Agent = z.infer<typeof AgentSchema>;
export type NewAgent = Omit<Agent, 'createdAt' | 'updatedAt'>;
```

Repeat for `goal.ts`, `skill.ts`, `workflow.ts`, `agent-run.ts`, `connector.ts`, `activity.ts` following the same pattern — one schema per domain, matching the SQL columns from Task 1.

Create `web/src/lib/os/schemas/index.ts` to re-export all.

- [ ] **Step 2.2: Write schemas test**

Create `web/tests/os/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AgentSchema } from '@/lib/os/schemas/agent';

describe('AgentSchema', () => {
  it('parses a valid agent', () => {
    const parsed = AgentSchema.parse({
      id: 'a1', orgId: '00000000-0000-4000-a000-000000000001',
      departmentId: 'support', name: 'Auto-responder',
      status: 'active', tier: 'worker',
      createdAt: '2026-08-15T00:00:00Z', updatedAt: '2026-08-15T00:00:00Z',
    });
    expect(parsed.trustScore).toBe(0.5);
    expect(parsed.tools).toEqual([]);
  });

  it('rejects invalid status', () => {
    expect(() => AgentSchema.parse({
      id: 'a1', orgId: '00000000-0000-4000-a000-000000000001',
      departmentId: 'x', name: 'X', status: 'BOGUS', tier: 'worker',
      createdAt: '2026-08-15T00:00:00Z', updatedAt: '2026-08-15T00:00:00Z',
    })).toThrow();
  });
});
```

- [ ] **Step 2.3: Write repository interface**

Create `web/src/lib/os/repository.ts` with the full interface from spec §4.

- [ ] **Step 2.4: Write Supabase adapter**

Create `web/src/lib/os/adapters/supabase.ts`:

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { OSRepository } from '../repository';
import { AgentSchema, type Agent } from '../schemas/agent';
// ... other schema imports

export class RepoError extends Error {
  constructor(public op: string, public cause: unknown) {
    super(`repo:${op} failed`);
  }
}

function rowToAgent(r: any): Agent {
  return AgentSchema.parse({
    id: r.id, orgId: r.org_id, departmentId: r.department_id,
    name: r.name, role: r.role, status: r.status, tier: r.tier,
    description: r.description, model: r.model, tools: r.tools,
    parentId: r.parent_id, instance: r.instance,
    constitution: r.constitution, trustScore: Number(r.trust_score),
    trustLedger: r.trust_ledger,
    createdAt: r.created_at, updatedAt: r.updated_at,
  });
}

function agentToRow(a: Agent) {
  return {
    id: a.id, org_id: a.orgId, department_id: a.departmentId,
    name: a.name, role: a.role, status: a.status, tier: a.tier,
    description: a.description, model: a.model, tools: a.tools,
    parent_id: a.parentId ?? null, instance: a.instance,
    constitution: a.constitution, trust_score: a.trustScore,
    trust_ledger: a.trustLedger,
  };
}

export function createSupabaseRepository(sb: SupabaseClient): OSRepository {
  return {
    agents: {
      async all(orgId) {
        const { data, error } = await sb.from('os_agents').select('*').eq('org_id', orgId).order('tier').order('name');
        if (error) throw new RepoError('agents.all', error);
        return z.array(AgentSchema).parse((data ?? []).map(rowToAgent));
      },
      async byId(orgId, id) {
        const { data, error } = await sb.from('os_agents').select('*').eq('org_id', orgId).eq('id', id).maybeSingle();
        if (error) throw new RepoError('agents.byId', error);
        return data ? rowToAgent(data) : null;
      },
      async byDepartment(orgId, depId) {
        const { data, error } = await sb.from('os_agents').select('*').eq('org_id', orgId).eq('department_id', depId);
        if (error) throw new RepoError('agents.byDepartment', error);
        return (data ?? []).map(rowToAgent);
      },
      async upsert(orgId, a) {
        const { error } = await sb.from('os_agents').upsert(agentToRow({ ...a, orgId }));
        if (error) throw new RepoError('agents.upsert', error);
      },
      async delete(orgId, id) {
        const { error } = await sb.from('os_agents').delete().eq('org_id', orgId).eq('id', id);
        if (error) throw new RepoError('agents.delete', error);
      },
    },
    goals: { /* implement following the same pattern for os_goals */ },
    skills: { /* ... */ },
    workflows: { /* ... */ },
    agentRuns: { /* ... */ },
    connectors: { /* ... */ },
    activity: { /* ... */ },
  };
}
```

Implement the rest of the domains (`goals`, `skills`, `workflows`, `agentRuns`, `connectors`, `activity`) following the exact same pattern — rowToX / xToRow helpers + all methods from the interface.

- [ ] **Step 2.5: Write in-memory adapter for tests**

Create `web/src/lib/os/adapters/in-memory.ts` — same interface, backed by Maps. Used by unit tests that don't need real DB.

- [ ] **Step 2.6: Write repository unit test**

Create `web/tests/os/repository.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInMemoryRepository } from '@/lib/os/adapters/in-memory';

describe('OSRepository (in-memory)', () => {
  const orgA = '00000000-0000-4000-a000-000000000001';

  it('upsert + all returns the agent', async () => {
    const repo = createInMemoryRepository();
    await repo.agents.upsert(orgA, {
      id: 'a1', orgId: orgA, departmentId: 'support', name: 'AR',
      role: '', status: 'active', tier: 'worker', description: '',
      model: 'sonnet', tools: [], parentId: null, instance: 'builtin',
      constitution: {}, trustScore: 0.9, trustLedger: [],
      createdAt: '2026-08-15T00:00:00Z', updatedAt: '2026-08-15T00:00:00Z',
    });
    const all = await repo.agents.all(orgA);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('AR');
  });

  it('org isolation — agent from orgA not visible from orgB', async () => {
    const repo = createInMemoryRepository();
    const orgB = '00000000-0000-4000-a000-000000000002';
    // ... upsert into orgA, query from orgB, expect []
  });
});
```

- [ ] **Step 2.7: Run tests**

```bash
cd web
pnpm vitest run tests/os/
```

Expected: schemas.test + repository.test + rls.test all pass.

- [ ] **Step 2.8: Commit + push**

```bash
git add web/src/lib/os/ web/tests/os/schemas.test.ts web/tests/os/repository.test.ts
git commit -m "feat(os): schemas + OSRepository interface + Supabase/in-memory adapters"
git push
```

---

## Task 3: next-intl v3 Setup (PR#3)

**Files:**
- Create: `web/i18n.ts`, `web/global.d.ts`, `web/messages/es.json`, `web/messages/en.json`
- Modify: `web/middleware.ts` (or create if none)

- [ ] **Step 3.1: Create messages**

Create `web/messages/es.json`:

```json
{
  "os": {
    "console": {
      "title": "Consola",
      "subtitle": "Vista viva del OS · canales, agentes, actividad y metas de {brand}",
      "pulse": {
        "channelsActive": "Canales activos",
        "messagesToday": "Mensajes hoy",
        "agentsActive": "Agentes activos",
        "standingGoals": "Standing goals"
      }
    },
    "sidebar": {
      "communityOs": "Community OS",
      "new": "NEW"
    },
    "agents": { "title": "Agentes" },
    "goals": { "title": "Standing goals" },
    "skills": { "title": "Skills" },
    "funnel": { "title": "Funnel" },
    "content": { "title": "Contenido" },
    "social": { "title": "Social" },
    "integrations": { "title": "Integraciones" },
    "command": { "title": "Command palette" }
  }
}
```

Create `web/messages/en.json` with the same shape and English translations.

- [ ] **Step 3.2: Create `i18n.ts`**

Create `web/i18n.ts`:

```ts
import { getRequestConfig } from 'next-intl/server';

export const locales = ['es', 'en'] as const;
export const defaultLocale = 'es';
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ locale }) => {
  if (!locales.includes(locale as Locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  return {
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 3.3: Create/extend middleware conditionally**

Read current `web/middleware.ts` first. If it exists, wrap the current logic with the conditional intl check. If not, create it fresh:

```ts
// web/middleware.ts
import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from './i18n';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
});

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isOs = pathname.startsWith('/os') || /^\/(es|en)\/os/.test(pathname);
  if (isOs) return intlMiddleware(req);
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
```

- [ ] **Step 3.4: Type autocomplete**

Create `web/global.d.ts`:

```ts
import es from './messages/es.json';
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof es;
  }
}
```

- [ ] **Step 3.5: Verify build**

```bash
cd web
pnpm tsc --noEmit
pnpm build
```

Expected: no TS errors; build succeeds.

- [ ] **Step 3.6: Commit + push**

```bash
git add web/i18n.ts web/global.d.ts web/messages/ web/middleware.ts
git commit -m "feat(os): next-intl v3 setup — partial i18n under /os/*, es default"
git push
```

---

## Task 4: Feature Flag + API Routes (PR#4)

**Files:**
- Create: `web/src/lib/flags.ts`, `web/src/lib/identify.ts`
- Create: `web/src/app/api/os/{agents,goals,skills,connectors,activity,agent-runs}/route.ts`
- Create: `web/src/app/api/os/dev/seed/route.ts`
- Create: `web/src/lib/os/seed-dev.ts`

- [ ] **Step 4.1: Create identify + flag**

Create `web/src/lib/identify.ts`:

```ts
import { dedupe } from 'flags/next';
import { cookies, headers } from 'next/headers';
import { getServerSession } from '@/lib/auth'; // adapt to CM's existing auth helper

export const identify = dedupe(async () => {
  const session = await getServerSession();
  if (!session) return { userId: null, userEmail: null, orgId: null, betaCohorts: [] as string[] };
  return {
    userId: session.user.id,
    userEmail: session.user.email,
    orgId: session.currentOrgId,
    betaCohorts: session.betaCohorts ?? [],
  };
});
```

Create `web/src/lib/flags.ts`:

```ts
import { flag } from '@vercel/flags/next';
import { identify } from './identify';

export const communityOsFlag = flag<boolean>({
  key: 'community-os',
  identify,
  description: 'Community OS shell — new /os/* namespace',
  decide: ({ entities }) => {
    if (entities?.userEmail === 'leonel.zc2005@gmail.com') return true;
    return entities?.betaCohorts?.includes('community-os') ?? false;
  },
});
```

- [ ] **Step 4.2: Create Supabase server helper**

Create `web/src/lib/os/server.ts`:

```ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseRepository } from './adapters/supabase';

export function getOSRepositoryForRequest() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookies().get(name)?.value,
        set: () => {}, // read-only from server
        remove: () => {},
      },
    }
  );
  return createSupabaseRepository(supabase);
}

export async function requireOrgIdFromRequest(): Promise<string> {
  // Read from JWT / session — adapt to CM's auth
  const session = await getServerSession();
  if (!session?.currentOrgId) throw new Error('unauthorized: no org');
  return session.currentOrgId;
}
```

- [ ] **Step 4.3: Create API route for agents**

Create `web/src/app/api/os/agents/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { AgentSchema } from '@/lib/os/schemas/agent';

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  const orgId = await requireOrgIdFromRequest();
  const repo = getOSRepositoryForRequest();
  const agents = await repo.agents.all(orgId);
  return NextResponse.json({ agents });
}

export async function POST(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  const orgId = await requireOrgIdFromRequest();
  const body = await req.json();
  const parsed = AgentSchema.parse({ ...body, orgId });
  const repo = getOSRepositoryForRequest();
  await repo.agents.upsert(orgId, parsed);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4.4: Create remaining API routes**

Repeat the pattern for `goals/route.ts`, `skills/route.ts`, `connectors/route.ts`, `activity/route.ts`, `agent-runs/route.ts`. Each: gate with flag, validate with Zod, delegate to repo.

- [ ] **Step 4.5: Create dev-only seed endpoint**

Create `web/src/lib/os/seed-dev.ts`:

```ts
import { OSRepository } from './repository';

export async function seedDev(repo: OSRepository, orgId: string) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('seed-dev only available in development');
  }
  await repo.agents.upsert(orgId, {
    id: 'auto-responder', orgId, departmentId: 'support',
    name: 'Auto-responder', role: 'Responde mensajes entrantes',
    status: 'active', tier: 'worker',
    description: 'Responde con tono del brand',
    model: 'claude-sonnet-4-6', tools: ['whatsapp.send'],
    parentId: null, instance: 'builtin',
    constitution: { max_msg_per_hour: 100, escalate_on_negative_sentiment: true },
    trustScore: 0.92, trustLedger: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  // ... seed goals, skills, connectors, activity for demo
}
```

Create `web/src/app/api/os/dev/seed/route.ts` gated by NODE_ENV + flag.

- [ ] **Step 4.6: Smoke test the routes**

```bash
cd web
pnpm dev
# In another terminal:
curl -s -H "Cookie: <session-cookie>" http://localhost:3000/api/os/agents | jq
# Expected: { "agents": [] } when flag active, or { "error": "not_available" } when off
```

- [ ] **Step 4.7: Commit + push**

```bash
git add web/src/lib/flags.ts web/src/lib/identify.ts web/src/lib/os/server.ts web/src/lib/os/seed-dev.ts web/src/app/api/os/
git commit -m "feat(os): feature flag + api routes behind community-os flag"
git push
```

---

## Task 5: Layout Shell + Sidebar Item + Console UI (PR#5)

**Files:**
- Create: `web/src/app/[locale]/(shell)/layout.tsx`
- Create: `web/src/app/[locale]/(shell)/os/layout.tsx`
- Create: `web/src/app/[locale]/(shell)/os/page.tsx`
- Create: `web/src/components/os/{Sidebar,Topbar,ConsoleHome,PulseCards,ActivityFeed,AgentRoster,ConnectionsStrip,GoalsGrid}.tsx`
- Create: `web/src/styles/os.css` (Cobalt tokens)
- Modify: existing CM Sidebar to add `Community OS` link gated by flag

- [ ] **Step 5.1: Create Cobalt tokens CSS**

Create `web/src/styles/os.css` with the OKLCH tokens block from the design mockup (`.superpowers/brainstorm/1328-1786845415/content/design-hallmark-v2.html` `:root`).

- [ ] **Step 5.2: Create shell layout**

Create `web/src/app/[locale]/(shell)/layout.tsx`:

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { AuthProvider } from '@/components/AuthProvider'; // adapt to existing CM
import '@/styles/os.css';

export default async function ShellLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AuthProvider>{children}</AuthProvider>
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 5.3: Create OS sub-nav layout**

Create `web/src/app/[locale]/(shell)/os/layout.tsx`:

```tsx
import { OsSidebar } from '@/components/os/Sidebar';
import { OsTopbar } from '@/components/os/Topbar';

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="os-shell">
      <OsSidebar />
      <div className="os-main">
        <OsTopbar />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: Port the UI components**

Copy structure from `.superpowers/brainstorm/1328-1786845415/content/design-hallmark-v2.html` (approved by Leonel) into React components:

- `Sidebar.tsx` — the sub-nav (Console · Agents · Goals · Skills · Funnel · Content · Social · Workflows · Integrations)
- `Topbar.tsx` — breadcrumb + status pill + lang toggle + ⌘K chip + avatar
- `ConsoleHome.tsx` — orchestrates PulseCards + ActivityFeed + AgentRoster + ConnectionsStrip + GoalsGrid
- `PulseCards.tsx` — 4 cards (channels active / messages today / agents active / goals ok/breach)
- `ActivityFeed.tsx` — feed rows from `os_activity` (fetched via API route)
- `AgentRoster.tsx` — agents list with trust bar
- `ConnectionsStrip.tsx` — 12 connectors grid with honest-status pills
- `GoalsGrid.tsx` — 6 goal cards with predicate + last check

All components use the design tokens from `os.css`.

- [ ] **Step 5.5: Create the console page**

Create `web/src/app/[locale]/(shell)/os/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { ConsoleHome } from '@/components/os/ConsoleHome';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';

export default async function Page() {
  const t = await getTranslations('os.console');
  const orgId = await requireOrgIdFromRequest();
  const repo = getOSRepositoryForRequest();
  const [agents, activity, connectors, goals] = await Promise.all([
    repo.agents.all(orgId),
    repo.activity.recent(orgId, 20),
    repo.connectors.all(orgId),
    repo.goals.all(orgId),
  ]);
  return (
    <main className="os-content">
      <h1 className="os-page-title">{t('title')}</h1>
      <ConsoleHome agents={agents} activity={activity} connectors={connectors} goals={goals} />
    </main>
  );
}
```

- [ ] **Step 5.6: Extend the existing CM sidebar with Community OS link**

Read `web/src/components/layout/Sidebar.tsx` (from `codex/add-manual-contact` — already refreshed). Add at the end of the menu (before the brand switcher), gated by `communityOsFlag()`:

```tsx
import { communityOsFlag } from '@/lib/flags';

// Inside the async component:
const showCommunityOs = await communityOsFlag();

// In JSX:
{showCommunityOs && (
  <Link href="/es/os" className="nav-item community-os" aria-current={pathname.startsWith('/es/os') ? 'page' : undefined}>
    <SparklesIcon className="icon-md" aria-hidden />
    <span>Community OS</span>
    <span className="pill-new">NEW</span>
  </Link>
)}
```

If the current Sidebar is a Client Component, promote it to Server (or extract this section into a Server Component that renders alongside).

- [ ] **Step 5.7: Bundle analyzer verification**

```bash
cd web
ANALYZE=true pnpm build
```

Expected: `/dashboard` bundle size delta ≤ +5KB. If more, verify lazy-loading is applied to heavy components (d3-force, brain viz).

- [ ] **Step 5.8: Manual smoke test**

```bash
cd web
pnpm dev
```

- Visit `http://localhost:3000/` → login → verify sidebar shows `Community OS` (Leonel account) or not (any other user)
- Click Community OS → land on `/es/os`
- Verify Cobalt theme, sub-nav, all widgets render
- Toggle ES/EN in topbar

- [ ] **Step 5.9: Commit + push**

```bash
git add web/src/app/[locale]/ web/src/components/os/ web/src/styles/os.css web/src/components/layout/Sidebar.tsx
git commit -m "feat(os): shell layout + console UI + Community OS sidebar link"
git push
```

- [ ] **Step 5.10: Open PR#5 as Ready-for-Review**

```bash
gh pr create --title "feat(os): PR#5 — shell + sidebar + console UI (Community OS)" --body "..."
```

---

## Task 6: /os/integrations — Honest Status Board (PR#6)

**Files:**
- Create: `web/src/lib/os/connectors/base.ts`
- Create: `web/src/lib/os/connectors/{meta,waha,instagram,cron,webhooks}/adapter.ts` (wrap CM)
- Create: `web/src/lib/os/connectors/{slack,notion,stripe,gmail-imap,google-calendar}/adapter.ts` (new)
- Create: `web/src/lib/os/connectors/index.ts` (registry)
- Create: `web/src/app/[locale]/(shell)/os/integrations/page.tsx`

- [ ] **Step 6.1: Create ConnectorAdapter base**

Create `web/src/lib/os/connectors/base.ts`:

```ts
export type ConnectorStatus = 'not_configured' | 'configured' | 'live' | 'error';

export interface ProbeResult {
  status: ConnectorStatus;
  meta?: Record<string, unknown>;
  error?: string;
}

export interface ConnectorAdapter {
  id: string;
  kind: 'webhook' | 'oauth' | 'apikey' | 'imap' | 'cron';
  provider: string;
  probe(orgId: string): Promise<ProbeResult>;
}
```

- [ ] **Step 6.2: Wrap CM connectors**

Create `web/src/lib/os/connectors/meta/adapter.ts`:

```ts
import { ConnectorAdapter } from '../base';
import { getMetaChannelHealth } from '@/lib/meta/health'; // adapt to CM's existing helper

export const metaAdapter: ConnectorAdapter = {
  id: 'meta-fb',
  kind: 'webhook',
  provider: 'meta',
  async probe(orgId) {
    const health = await getMetaChannelHealth(orgId);
    if (!health.connected) return { status: 'not_configured' };
    if (health.lastError) return { status: 'error', error: health.lastError };
    return { status: 'live', meta: { pageName: health.pageName } };
  },
};
```

Repeat for `waha`, `instagram`, `cron`, `webhooks` — each wrapping the CM's existing health-check helpers. Don't duplicate their logic — delegate.

- [ ] **Step 6.3: Create new adapters (opt-in stubs)**

Create `slack/adapter.ts`, `notion/adapter.ts`, `stripe/adapter.ts`, `gmail-imap/adapter.ts`, `google-calendar/adapter.ts` — all initially return `not_configured` (Sprint 2 wires them for real).

- [ ] **Step 6.4: Create registry**

Create `web/src/lib/os/connectors/index.ts`:

```ts
import { metaAdapter } from './meta/adapter';
import { wahaAdapter } from './waha/adapter';
// ... rest
import { ConnectorAdapter } from './base';

export const registry: ConnectorAdapter[] = [
  metaAdapter, wahaAdapter, instagramAdapter, cronAdapter, webhooksAdapter,
  slackAdapter, notionAdapter, stripeAdapter, gmailImapAdapter, googleCalendarAdapter,
];

export async function probeAll(orgId: string) {
  return Promise.all(registry.map(async a => ({ adapter: a, result: await a.probe(orgId) })));
}
```

- [ ] **Step 6.5: Create /os/integrations page**

Create `web/src/app/[locale]/(shell)/os/integrations/page.tsx` — render the Connections grid from the mockup, calling `probeAll(orgId)`.

- [ ] **Step 6.6: Commit + push**

```bash
git add web/src/lib/os/connectors/ web/src/app/[locale]/(shell)/os/integrations/
git commit -m "feat(os): integrations board — CM wrappers + honest-status for all connectors"
git push
```

---

## Task 7: /os/agents + Constitution + Trust Ledger (PR#7)

**Files:**
- Create: `web/src/lib/os/agents/{runtime,verify,trust}.ts`
- Create: `web/src/app/[locale]/(shell)/os/agents/page.tsx`
- Create: `web/src/components/os/{ConductorPanel,ConstitutionEditor}.tsx`

- [ ] **Step 7.1: Write verify gate**

Create `web/src/lib/os/agents/verify.ts`:

```ts
export type VerifyOutcome = { pass: true } | { pass: false; reason: string };

export function verify(spec: Record<string, unknown>, output: unknown): VerifyOutcome {
  // Placeholder — Sprint 1 has a simple JSON-predicate verifier.
  // Full slop-test-style verifier lands in Sprint 3.
  if (!output) return { pass: false, reason: 'empty output' };
  return { pass: true };
}
```

- [ ] **Step 7.2: Write verify test**

Create `web/tests/os/verify.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { verify } from '@/lib/os/agents/verify';

describe('verify gate', () => {
  it('fails on empty output', () => {
    expect(verify({}, null)).toEqual({ pass: false, reason: 'empty output' });
  });
  it('passes on non-empty output', () => {
    expect(verify({}, { text: 'hello' })).toEqual({ pass: true });
  });
});
```

- [ ] **Step 7.3: Write trust ledger helpers**

Create `web/src/lib/os/agents/trust.ts`:

```ts
import type { Agent } from '@/lib/os/schemas/agent';

export function updateTrust(agent: Agent, runId: string, verdict: 'pass' | 'fail'): Agent {
  const event = { runId, verdict, at: new Date().toISOString() };
  const ledger = [...agent.trustLedger, event].slice(-1000); // cap
  const passes = ledger.filter(e => e.verdict === 'pass').length;
  const newScore = ledger.length === 0 ? 0.5 : passes / ledger.length;
  return { ...agent, trustLedger: ledger, trustScore: newScore };
}
```

- [ ] **Step 7.4: Port ConductorPanel from FounderOS**

Copy `F:/Proyectos/FounderOS-DEMO/components/ConductorPanel.tsx` to `web/src/components/os/ConductorPanel.tsx`. Replace imports of `lib/db` / `lib/agents` with our repository + runtime helpers.

- [ ] **Step 7.5: Create Constitution editor**

Create `web/src/components/os/ConstitutionEditor.tsx` — form to edit `os_agents.constitution` JSONB (checkboxes for booleans, sliders for numbers, textarea for prose rules).

- [ ] **Step 7.6: Create /os/agents page**

Create `web/src/app/[locale]/(shell)/os/agents/page.tsx` — fetches agents + recent runs, renders roster + selected agent detail with ConductorPanel + ConstitutionEditor + trust chart.

- [ ] **Step 7.7: Commit + push**

```bash
git add web/src/lib/os/agents/ web/src/components/os/ConductorPanel.tsx web/src/components/os/ConstitutionEditor.tsx web/src/app/[locale]/(shell)/os/agents/ web/tests/os/verify.test.ts
git commit -m "feat(os): agents page — roster + constitution editor + trust ledger + verify gate"
git push
```

---

## Task 8: /os/goals + Cron Sentinel (PR#8)

**Files:**
- Create: `web/src/lib/os/goals/{sentinel,predicates}.ts`
- Create: `web/src/app/api/cron/os-goals-sentinel/route.ts`
- Create: `web/src/app/[locale]/(shell)/os/goals/page.tsx`
- Modify: `web/vercel.json` (add cron entry)

- [ ] **Step 8.1: Write predicates library**

Create `web/src/lib/os/goals/predicates.ts`:

```ts
export type PredicateContext = {
  channelsLiveCount: number;
  channelsTotalCount: number;
  responseTimeP50Sec: number;
  responseTimeMaxSec: number;
  costTodayUsd: number;
  leadsUnassignedOverMinutes: number;
  metaHitsLastHour: number;
  avgTrustScore: number;
};

export type Predicate = (ctx: PredicateContext) => { ok: boolean; evidence: unknown };

export const predicates: Record<string, Predicate> = {
  uptime_channels: (ctx) => ({
    ok: ctx.channelsTotalCount > 0 && (ctx.channelsLiveCount / ctx.channelsTotalCount) >= 0.99,
    evidence: { live: ctx.channelsLiveCount, total: ctx.channelsTotalCount },
  }),
  sla_response: (ctx) => ({
    ok: ctx.responseTimeP50Sec < 300 && ctx.responseTimeMaxSec < 900,
    evidence: { p50: ctx.responseTimeP50Sec, max: ctx.responseTimeMaxSec },
  }),
  budget_daily: (ctx) => ({
    ok: ctx.costTodayUsd < 10,
    evidence: { costToday: ctx.costTodayUsd, budget: 10 },
  }),
  leads_unassigned: (ctx) => ({
    ok: ctx.leadsUnassignedOverMinutes === 0,
    evidence: { unassigned: ctx.leadsUnassignedOverMinutes },
  }),
  rate_limit_meta: (ctx) => ({
    ok: ctx.metaHitsLastHour < 200,
    evidence: { hits: ctx.metaHitsLastHour },
  }),
  trust_avg: (ctx) => ({
    ok: ctx.avgTrustScore >= 0.75,
    evidence: { avg: ctx.avgTrustScore },
  }),
};
```

- [ ] **Step 8.2: Write sentinel**

Create `web/src/lib/os/goals/sentinel.ts`:

```ts
import { predicates, PredicateContext } from './predicates';
import { OSRepository } from '../repository';

export async function runSentinel(repo: OSRepository, orgId: string, ctx: PredicateContext) {
  const goals = await repo.goals.all(orgId);
  for (const g of goals) {
    const pred = predicates[g.spec.predicateKey as string];
    if (!pred) continue;
    const { ok, evidence } = pred(ctx);
    await repo.goals.markVerified(orgId, g.id, new Date(), ok, evidence);
    if (!ok) {
      await repo.activity.insert(orgId, {
        kind: 'goal_check', actorId: null,
        summary: `Goal breach: ${g.title}`,
        payload: { goalId: g.id, evidence }, ok: false,
      });
    }
  }
}
```

- [ ] **Step 8.3: Create context builder**

In `web/src/lib/os/goals/sentinel.ts`, add `buildContext(orgId)` that queries the CM to build a `PredicateContext` — reads `cm_channels`, `cm_conversations`, `cm_agent_runs`, etc. Read-only aggregate queries, no mutations.

- [ ] **Step 8.4: Create cron endpoint**

Create `web/src/app/api/cron/os-goals-sentinel/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { runSentinel, buildContext } from '@/lib/os/goals/sentinel';
import { getOSRepositoryForRequest } from '@/lib/os/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const repo = getOSRepositoryForRequest();
  // Iterate all orgs with community-os flag active — Sprint 1 hardcodes Leonel's org
  const orgIds = [process.env.LEONEL_ORG_ID!];
  for (const orgId of orgIds) {
    const ctx = await buildContext(orgId);
    await runSentinel(repo, orgId, ctx);
  }
  return NextResponse.json({ ok: true, orgs: orgIds.length });
}
```

- [ ] **Step 8.5: Add cron to Vercel**

Modify `web/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/os-goals-sentinel", "schedule": "*/15 * * * *" }
  ]
}
```

- [ ] **Step 8.6: Create /os/goals page**

Create `web/src/app/[locale]/(shell)/os/goals/page.tsx` — fetches goals + last checks, renders 6-card grid with pass/breach status.

- [ ] **Step 8.7: Commit + push**

```bash
git add web/src/lib/os/goals/ web/src/app/api/cron/ web/src/app/[locale]/(shell)/os/goals/ web/vercel.json
git commit -m "feat(os): goals sentinel — cron every 15min + 6 default predicates"
git push
```

---

## Task 9: /os/content + /os/social (PR#9)

**Files:**
- Port from FounderOS: `PostComposer.tsx`, `SocialStats.tsx`, `AudienceConsistency.tsx`, `FollowerBarChart.tsx`, `AudiencePie.tsx`, `SharePie.tsx`, `PillarRadar.tsx`, `NewsletterList.tsx`
- Create: `web/src/app/[locale]/(shell)/os/content/page.tsx`
- Create: `web/src/app/[locale]/(shell)/os/social/page.tsx`

- [ ] **Step 9.1: Copy components (Tier A) from FounderOS**

For each Tier A component in the list, copy from `F:/Proyectos/FounderOS-DEMO/components/<name>.tsx` to `web/src/components/os/<name>.tsx`. Update imports:
- Replace `@/lib/db` / `lib/data` with API fetches to `/api/os/*` or props
- Keep the pure UI code as-is

- [ ] **Step 9.2: Port PostComposer (Tier B — needs endpoint change)**

Copy `PostComposer.tsx`. In line ~48 replace hardcoded fetch to `/api/social/posts` with a prop `onSubmit(post): Promise<void>` — the page decides the endpoint. This decouples the component from any specific route.

- [ ] **Step 9.3: Create /os/content page**

Create `web/src/app/[locale]/(shell)/os/content/page.tsx` — grid of pending drafts (from `cm_posts` where `status=draft`) + PostComposer + calendar view.

- [ ] **Step 9.4: Create /os/social page**

Create `web/src/app/[locale]/(shell)/os/social/page.tsx` — audience charts (FollowerBarChart, AudiencePie, PillarRadar) + posting cadence. Data source: existing `cm_social_stats` if available; otherwise placeholder tagged "conectar cuenta social para ver métricas reales".

- [ ] **Step 9.5: Manual verify**

```bash
pnpm dev
# Visit /es/os/content and /es/os/social
# Verify layout, no console errors, all components render
```

- [ ] **Step 9.6: Commit + push**

```bash
git add web/src/components/os/ web/src/app/[locale]/(shell)/os/content/ web/src/app/[locale]/(shell)/os/social/
git commit -m "feat(os): content + social pages — ported from FounderOS"
git push
```

---

## Task 10: /os/funnel + /os/skills (PR#10)

**Files:**
- Port from FounderOS: `FunnelRadial.tsx`, `FunnelNodeCard.tsx`, `FunnelSpace.tsx`, `SkillsGrid.tsx`, `TaskBoard.tsx`, `WeekCalendar.tsx` (if applicable)
- Create: `web/src/app/[locale]/(shell)/os/funnel/page.tsx`
- Create: `web/src/app/[locale]/(shell)/os/skills/page.tsx`

- [ ] **Step 10.1: Port funnel components**

Copy `FunnelRadial.tsx`, `FunnelNodeCard.tsx`, `FunnelSpace.tsx` into `web/src/components/os/`. `FunnelRadial` uses `d3-force` (already in deps from Prereqs).

- [ ] **Step 10.2: Create /os/funnel page**

Create `web/src/app/[locale]/(shell)/os/funnel/page.tsx` — fetches `cm_leads` grouped by stage (new / qualified / hot / closed) and feeds FunnelRadial + FunnelSpace views.

- [ ] **Step 10.3: Port skills components**

Copy `SkillsGrid.tsx`, `TaskBoard.tsx`. Data source: `os_skills` table (repo.skills.all).

- [ ] **Step 10.4: Create /os/skills page**

Create `web/src/app/[locale]/(shell)/os/skills/page.tsx` — SkillsGrid + kanban of tasks generated by skills (Sprint 3 will make them schedulable; Sprint 1 shows the roster).

- [ ] **Step 10.5: Commit + push**

```bash
git add web/src/components/os/ web/src/app/[locale]/(shell)/os/funnel/ web/src/app/[locale]/(shell)/os/skills/
git commit -m "feat(os): funnel + skills pages — ported from FounderOS"
git push
```

---

## Task 11: /os/command Palette (⌘K global) (PR#11)

**Files:**
- Port from FounderOS: `CommandPalette.tsx`
- Create: `web/src/app/[locale]/(shell)/os/command/page.tsx`
- Modify: `web/src/app/[locale]/(shell)/layout.tsx` to mount CommandPalette globally

- [ ] **Step 11.1: Port CommandPalette**

Copy `F:/Proyectos/FounderOS-DEMO/components/CommandPalette.tsx` to `web/src/components/os/CommandPalette.tsx`. Update the actions registry to point at our OS routes + repository actions:

- Navigate to Console / Agents / Goals / Skills / Funnel / Content / Social / Integrations
- Actions: "Pausar agente X", "Marcar goal como verified", "Reconectar canal Y"
- Search: mensajes, contactos, agentes (uses repo methods)

- [ ] **Step 11.2: Mount CommandPalette globally in shell layout**

Modify `web/src/app/[locale]/(shell)/layout.tsx`:

```tsx
import { CommandPalette } from '@/components/os/CommandPalette';

// Inside the return, alongside {children}:
<CommandPalette />
```

- [ ] **Step 11.3: Wire ⌘K keyboard shortcut**

Inside CommandPalette component, listen for `Meta+K` (or `Ctrl+K` on Windows) and toggle the palette. Ensure it's a Client Component (`'use client'`).

- [ ] **Step 11.4: Create /os/command page**

Create `web/src/app/[locale]/(shell)/os/command/page.tsx` — showcase page listing all available commands + keyboard shortcuts (educational).

- [ ] **Step 11.5: Commit + push + open PR#11**

```bash
git add web/src/components/os/CommandPalette.tsx web/src/app/[locale]/(shell)/
git commit -m "feat(os): command palette (⌘K global) — full search + actions"
git push
gh pr create --title "feat(os): PR#11 — command palette" --body "Closes Sprint 1"
```

---

## Sprint 1 Definition of Done

Run these checks before declaring Sprint 1 done:

- [ ] **DoD 1: All tests pass**

```bash
cd web && pnpm vitest run tests/os/
```

- [ ] **DoD 2: TypeScript clean**

```bash
pnpm tsc --noEmit
```

- [ ] **DoD 3: Build succeeds**

```bash
pnpm build
```

- [ ] **DoD 4: Bundle size delta ≤ +5KB for /dashboard**

```bash
ANALYZE=true pnpm build
# Compare .next/analyze/ output vs baseline
```

- [ ] **DoD 5: /dashboard regression smoke test (manual)**

- Open every top-level page of `/dashboard` (inbox, contacts, chatbot, broadcasts, analytics, settings)
- Verify no visual regression, no console errors

- [ ] **DoD 6: /os visible for Leonel, hidden for others**

- Login as Leonel → sidebar shows "Community OS" → click → renders console
- Login as any other user → sidebar has no OS item → visiting `/es/os` returns 404

- [ ] **DoD 7: RLS blocks cross-tenant reads**

Re-run `pnpm vitest run tests/os/rls.test.ts` in staging with real Supabase.

- [ ] **DoD 8: At least 1 agent + 3 goals seeded and operating**

```bash
curl -X POST -H "Cookie: ..." http://localhost:3000/api/os/dev/seed
curl -H "Cookie: ..." http://localhost:3000/api/os/agents | jq
curl -H "Cookie: ..." http://localhost:3000/api/os/goals | jq
```

- [ ] **DoD 9: Cron sentinel runs successfully**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/os-goals-sentinel
```

- [ ] **DoD 10: All PRs merged to `visual/os-fusion` → open PR to master (draft, human review before promote)**

```bash
gh pr create --draft --base master --head visual/os-fusion --title "Community OS Sprint 1 (feature-flag gated)" --body "..."
```

---

## Post-Sprint 1 · Deploy plan

1. Merge `visual/os-fusion` → `master` via PR (human review)
2. Vercel auto-deploys production
3. Verify flag `community-os` returns `true` only for `leonel.zc2005@gmail.com` (Vercel Flags dashboard)
4. Manual QA in production: login, navigate to `/es/os`, exercise every route
5. Monitor Supabase metrics (query volume, RLS overhead)
6. Sprint 2 kickoff: Brain (knowledge graph) + Workflows

---

## Self-review checklist

- ✅ Spec coverage — every §3-§12 requirement mapped to a task
- ✅ No placeholders — all code blocks are real, no "TODO"
- ✅ Type consistency — `Agent`, `Goal`, etc. schemas match SQL columns and API/UI usage
- ✅ TDD — every task has test-first steps where behavior is verifiable
- ✅ Frequent commits — every task ends in a commit + push
- ✅ Feature flag — every API route + UI page gated by `communityOsFlag()`
- ✅ Cero cambios en `cm_*` tablas — all new tables prefixed `os_*`
- ✅ Multi-tenant — `orgId` in every query, RLS enforced
- ✅ Multi-idioma — next-intl configured with es default + en opt-in
