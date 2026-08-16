# Community OS · Fusion Design (Community Manager × FounderOS × Agentic-OS)

**Fecha:** 2026-08-15
**Autor:** Leonel + Claude (brainstorming sesión)
**Estado:** Draft aprobado — pendiente user review antes de writing-plans
**Versión:** 1.0
**Rama de trabajo propuesta:** `visual/os-fusion` (a crear desde `codex/add-manual-contact`)

---

## Referencias

- `.superpowers/brainstorm/1328-1786845415/research/i18n-next-intl.md`
- `.superpowers/brainstorm/1328-1786845415/research/data-layer-architecture.md`
- `.superpowers/brainstorm/1328-1786845415/research/components-portability.md`
- `.superpowers/brainstorm/1328-1786845415/research/industry-patterns.md`
- Mockup Hallmark v2: `.superpowers/brainstorm/1328-1786845415/content/design-hallmark-v2.html`
- FounderOS-DEMO fuente: `F:/Proyectos/FounderOS-DEMO/`
- Agentic-OS fuente: `F:/Proyectos/Agentic-OS/`

---

## §1 Filosofía y marco

Fusionar tres proyectos en una capa nueva `/os/*` del Community Manager:

- **CM** — la app en producción (multi-tenant B2B, Meta/WAHA/IG/webhooks/cron/Supabase). Se preserva 100%.
- **FounderOS-DEMO** — dashboard "personal OS" Next.js 14. Aporta la metáfora, la UX (sidebar/topbar/subnav), 54 componentes portables y el patrón `honest-status connectors`.
- **Agentic-OS** — doctrina de agentes autónomos (constitution + trust ledger + standing goals + verify gate). Se embebe como capa de "cerebro" del OS.

**Reglas duras (no negociables):**

1. Cero cambios en el CM existente. Todo lo nuevo vive en `/[locale]/(shell)/os/*`.
2. Aditivo, nunca sustitutivo. `/dashboard` clásico intocable forever (precedentes: GitHub Projects, Linear Insights, Vercel v0).
3. Multi-tenant primero — cada `org_id` aislada por RLS.
4. Feature flag por org — invisible hasta que se habilita.
5. Cero fork de componentes. Componentes compartidos viven en `components/`, solo shells/layouts divergen.

---

## §2 Decisiones tomadas (v1)

Defaults sensatos aplicados en este doc. Revocables con un mensaje del usuario.

| # | Decisión | Valor | Justificación |
|---|---|---|---|
| D1 | Tenant boundary | `org_id` | Macro-boundary del CM multi-agencia; brand_id vive dentro de org |
| D2 | Idioma default | `es` | Usuario colombiano, mercado principal LATAM |
| D3 | Rollout inicial | **Todas las orgs del usuario Leonel** (rollout completo desde día 1 para su cuenta) | Su cuenta ve TODO Community OS activo; el resto de users queda oculto por flag hasta GA cohort |
| D4 | Nombre del módulo + ítem sidebar | **`Community OS`** | Naming completo (no solo "OS") — refleja que es una extensión del Community Manager |
| D5 | Trust ledger storage | Inline JSONB en `os_agents.trust_ledger` | Simple para Sprint 1; promote a `os_trust_events` tabla si >1k runs/agent |
| D6 | Timestamp convention migrations | `YYYYMMDDHHMMSS_slug.sql` | Match con convención Supabase estándar |
| D7 | RLS helper | `os_current_org()` (nuevo) | Aislado del CM; puede migrar a helper compartido si existe |
| D8 | Connector secrets storage | Vercel env vars (Sprint 1) → Supabase Vault (Sprint 3) | Vault requiere setup adicional; env vars ya funciona |
| D9 | Cron goals sentinel cadence | Cada 15 min | Balance entre freshness y load; Vercel cron gratuito hasta 20 jobs |
| D10 | Base branch | `codex/add-manual-contact` | Tiene el UI más fresco (60 commits, profile page, sidebar refresh) |

---

## §3 Routing + i18n (next-intl v3)

**Estrategia:** partial i18n solo bajo `/os/*` con middleware condicional.

**Estructura de archivos:**

```
web/
  app/
    (dashboard)/                  ← existente, sin locale, intocable
    (agency)/                     ← existente, sin locale, intocable
    (marketing)/                  ← existente, sin locale, intocable
    api/                          ← existente, sin locale, intocable
    [locale]/
      (shell)/                    ← providers compartidos (auth + org + brand + intl)
        os/
          page.tsx                → /es/os · Console
          agents/page.tsx
          integrations/page.tsx
          goals/page.tsx
          skills/page.tsx
          funnel/page.tsx
          content/page.tsx
          social/page.tsx
          command/page.tsx
  messages/
    es.json
    en.json
  middleware.ts                   ← nueva o extender existente condicionalmente
  i18n.ts                         ← nueva
```

**Middleware condicional** (solo `/os/*`):

```ts
// middleware.ts
import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';

const intlMiddleware = createMiddleware({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localePrefix: 'always',
});

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith('/os') || /^\/(es|en)\/os/.test(pathname)) {
    return intlMiddleware(req);
  }
  return; // resto del CM pasa sin tocar
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
```

**Formato COP + USD** (nativo via `Intl`):

```ts
const format = await getFormatter();
format.number(1_500_000, { style: 'currency', currency: 'COP' });
format.number(99.99, { style: 'currency', currency: 'USD' });
```

**TypeScript autocomplete** (missing keys = build error):

```ts
// global.d.ts
import es from '@/messages/es.json';
declare module 'next-intl' { interface AppConfig { Messages: typeof es; } }
```

**hreflang + metadata localizada** en cada page.tsx del OS.

**Detección automática** (Accept-Language header + cookie `NEXT_LOCALE`).

---

## §4 Data layer

**Arquitectura:** repository pattern con adapter Supabase, mirror del `db.ts` de FounderOS.

**Data flow:**

```
Client (RSC/Client Component)
   │  fetch('/api/os/agents')
   ▼
Next.js API Route (web/src/app/api/os/**)
   │  1. authenticate() → { userId, orgId, brandId }
   │  2. zod.parse(input)
   ▼
OSRepository (web/src/lib/os/repository.ts)
   │  scoped by orgId — todas las queries filtran por org_id
   ▼
Supabase Client (supabase-js, anon key + JWT con org_id claim)
   │  RLS: org_id = os_current_org()
   ▼
Postgres (7 tablas os_*, aisladas por prefijo)
   │
   ▼ (realtime channel: postgres_changes on os_activity/os_agent_runs)
Client subscription
```

**7 tablas nuevas** (todas prefijo `os_*`, cero cambios en `cm_*`):

- `os_agents` — roster + constitution + trust_score + trust_ledger (JSONB)
- `os_goals` — standing goals + spec + cadence + last_status + last_evidence
- `os_skills` — skills schedulables + cron
- `os_workflows` — multi-step (shape reservada para Sprint 3)
- `os_agent_runs` — log de runs con tokens/cost
- `os_connectors` — registry unificado con `honest-status` (`not_configured` | `configured` | `live` | `error`)
- `os_activity` — activity feed (Realtime channel)

**SQL migration completo** — ver Appendix B.

**Repository interface:**

```ts
export interface OSRepository {
  agents: {
    all(orgId: string): Promise<Agent[]>;
    byId(orgId: string, id: string): Promise<Agent | null>;
    byDepartment(orgId: string, depId: string): Promise<Agent[]>;
    upsert(orgId: string, a: Agent): Promise<void>;
    delete(orgId: string, id: string): Promise<void>;
  };
  goals: {
    all(orgId: string): Promise<Goal[]>;
    byId(orgId: string, id: string): Promise<Goal | null>;
    upsert(orgId: string, g: Goal): Promise<void>;
    markVerified(orgId: string, id: string, at: Date, ok: boolean, evidence: unknown): Promise<void>;
  };
  skills: {
    all(orgId: string): Promise<Skill[]>;
    byId(orgId: string, id: string): Promise<Skill | null>;
    upsert(orgId: string, s: Skill): Promise<void>;
    schedule(orgId: string, id: string, cron: string): Promise<void>;
  };
  workflows: {
    all(orgId: string): Promise<Workflow[]>;
    byId(orgId: string, id: string): Promise<Workflow | null>;
    upsert(orgId: string, w: Workflow): Promise<void>;
  };
  agentRuns: {
    byAgent(orgId: string, agentId: string, limit?: number): Promise<AgentRun[]>;
    recent(orgId: string, limit?: number): Promise<AgentRun[]>;
    insert(orgId: string, run: NewAgentRun): Promise<AgentRun>;
  };
  connectors: {
    all(orgId: string): Promise<Connector[]>;
    byId(orgId: string, id: string): Promise<Connector | null>;
    setStatus(orgId: string, id: string, status: Status, meta?: unknown): Promise<void>;
  };
  activity: {
    recent(orgId: string, limit?: number): Promise<Activity[]>;
    insert(orgId: string, a: NewActivity): Promise<Activity>;
    subscribe(orgId: string, cb: (a: Activity) => void): Unsubscribe;
  };
}
```

**Zod parse en cada boundary:** input `Schema.parse(await req.json())` + output `z.array(Schema).parse(rows)`.

**Realtime:** Supabase Realtime `postgres_changes` en `os_activity` + `os_agent_runs`, filtered `org_id=eq.<uuid>`. Fallback 10s polling.

**Caching:** `fetch(..., { next: { revalidate: 30, tags: ['os:agents:'+orgId] }})` + `revalidateTag()` en mutations.

**Heavy joins:** view Postgres `os_activity_enriched` (activity + agent name en single query).

---

## §5 Component reuse plan (60+ componentes FounderOS)

- **Tier A (54 componentes) — copy tal cual** con nueva ruta de imports
- **Tier B (4 componentes) — adaptar** reemplazando `getDb()` por `OSRepository`
- **Tier C (8 componentes) — descartar** (founder-specific, no aplica a B2B multi-tenant)

**Top 5 componentes de mayor valor:**

1. `PostComposer.tsx` (170L) → `/os/content`
2. `SocialStats.tsx` (64L, formatters + Sparkline + GrowthBadge) → utilidad global
3. `ConductorPanel.tsx` (314L) → `/os/agents`
4. `WorkflowMap.tsx` (264L, d3-force) → `/os/workflows` Sprint 3
5. `FunnelRadial.tsx` (370L) → `/os/funnel`

**Top 5 a descartar:**

1. `KnowledgeGraph.tsx` (2367L over-engineered) — usar `NeuralGraph` + `KnowledgeGraphFullscreen`
2. `PersonaOrgChart.tsx` — concepto founder-only
3. `BusinessIncomeChart.tsx` — personal finance ≠ SaaS metrics
4. `StatementUploader.tsx` — bank statements no aplica
5. `HomeSocialGraph.tsx` — social graph personal

**Dependencias a agregar al CM:**

```json
{
  "dependencies": {
    "next-intl": "^3.22.0",
    "d3-force": "^3.0.0",
    "simple-icons": "^16.27.0",
    "@notionhq/client": "^5.22.0",
    "@slack/web-api": "^7.16.0",
    "@vercel/flags": "^3.1.0"
  }
}
```

**Patrones oro a adoptar del FounderOS:**

1. `lib/` como capa única de verdad (componentes puros UI, toda la lógica en lib)
2. Zod boundaries (`lib/os/schemas/*`)
3. Connectors pluggable (`lib/os/connectors/<id>/adapter.ts`)
4. Lazy loading (`next/dynamic` para brain/funnel/knowledge)
5. Utilidades agrupadas (`formatFollowers`, `GrowthBadge`, `Sparkline` en un módulo)

---

## §6 Feature flag — Vercel Flags SDK + Edge Config

**Por qué Vercel Flags:** ya estamos en Vercel Pro, sin per-seat pricing, <10ms edge, SSR-safe (Server Component evalúa antes del render → sin flicker).

**Flag por user identity — rollout completo para Leonel + resto opt-in:**

```ts
// web/src/lib/flags.ts
import { flag } from '@vercel/flags/next';
import { identify } from './identify'; // { userId, userEmail, orgId, orgIds, plan, betaCohorts }

export const communityOsFlag = flag<boolean>({
  key: 'community-os',
  identify,
  decide: ({ entities }) => {
    // Rollout completo — todas las orgs de Leonel siempre ven Community OS
    if (entities.userEmail === 'leonel.zc2005@gmail.com') return true;
    // Resto: solo si opt-in por cohort beta (post-Sprint 1)
    return entities.betaCohorts?.includes('community-os') ?? false;
  },
});
```

**Nota multi-tenant:** el flag identifica por `userId` + `orgId`. Cuando Leonel entra con cualquiera de sus orgs, ve Community OS. Cuando entra otro user (aunque compartan la misma org), no lo ve hasta que se agregue al `betaCohorts`.

**Sidebar SSR (evita flicker):**

```tsx
// web/src/app/(dashboard)/components/Sidebar.tsx (extender existente)
import { communityOsFlag } from "@/lib/flags";

export default async function Sidebar() {
  const showCommunityOs = await communityOsFlag();
  return (
    <nav>
      {/* ... items existentes ... */}
      {showCommunityOs && (
        <Link href="/es/os" className="nav-item community-os">
          <CommunityOsIcon /> Community OS <span className="pill-new">NEW</span>
        </Link>
      )}
    </nav>
  );
}
```

**Rollout progresivo:**

1. **Sprint 1 (día 1):** Leonel identificado por email → ve Community OS en TODAS sus orgs, siempre
2. **Sprint 2-3:** expandir a 3-5 orgs partner agregándolas a `betaCohorts`
3. **GA:** cuando queme post-Sprint 3, flag `decide` retorna `true` para todos

**Prohibido:** `NEXT_PUBLIC_*` como flag (queda en bundle, imposible cambiar sin redeploy).

---

## §7 Theme — Monolith + acento variable por org

**Consenso industria 2026:** Linear, Vercel Dashboard, Raycast, Cursor, Attio, Height → todos monochrome + un acento. Es el consenso de-facto para dashboards operacionales.

**Implementación:**

```tsx
// web/src/app/[locale]/(shell)/layout.tsx
<html
  data-org={brand.id}
  data-theme="dark"
  style={{ '--accent-hue': brand.accentHue }}
>
```

**Tokens** (en `web/src/app/[locale]/(shell)/os/os.css` o Tailwind v4 `@theme`):

```css
:root {
  --paper:      oklch(11% 0.005 250);
  --paper-2:    oklch(14% 0.008 250);
  --paper-3:    oklch(18% 0.012 250);
  --paper-4:    oklch(23% 0.015 250);
  --ink:        oklch(96% 0.005 250);
  --ink-2:      oklch(74% 0.010 250);
  --ink-3:      oklch(52% 0.010 250);
  --ink-4:      oklch(38% 0.008 250);
  --line:       oklch(22% 0.012 250);
  --line-2:     oklch(30% 0.018 250);
  --accent-hue: 250;
  --accent:     oklch(70% 0.14 var(--accent-hue));
  --accent-2:   oklch(55% 0.12 var(--accent-hue));
  --ok:         oklch(72% 0.15 145);
  --warn:       oklch(78% 0.14 75);
  --err:        oklch(66% 0.20 25);
}
```

**Fonts:** Space Grotesk (display) + Inter (body) + JetBrains Mono (num/IDs).

**Sin per-org bundle:** 1 CSS, cambian solo variables. Cada brand puede tener su propio `accentHue` en DB.

---

## §8 Bundle split — 0 KB extra para users que no usan /os

```tsx
// web/src/app/[locale]/(shell)/os/brain/page.tsx
const KnowledgeGraph = dynamic(() => import('./KnowledgeGraph'), {
  ssr: false,
  loading: () => <GraphSkeleton />,
});
```

**Reglas:**

- `d3-force`, `simple-icons`, brain viz → lazy solo cuando entras a `/os`
- Verificar con `@next/bundle-analyzer` post-merge (add npm script `analyze`)
- UN solo `<Providers>` en `app/[locale]/(shell)/layout.tsx` (auth + org + brand + intl) — cero duplicación
- Route Groups `(shell)` no afectan URL

---

## §9 Agentic-OS embebido

- **Constitution:** `os_agents.constitution jsonb` — reglas duras por agente (ej: `{"never_respond_after_hours": true, "max_msg_per_hour": 100, "escalate_if_negative_sentiment": true}`)
- **Trust ledger:** `os_agents.trust_score` (0..1 rolling) + `os_agents.trust_ledger jsonb` (append-only events `{run_id, verdict, at}`)
- **Standing goals:** `os_goals` con `last_checked_at` + `last_status` + `last_evidence`
- **Verify gate:** función pura `verify(spec, output): pass|fail` antes de log a `os_activity`
- **Cost budget:** `os_agent_runs.cost_usd` sumado por org → circuit breaker si excede `os_goals` de budget

**Cron job de goals sentinel:**

```
web/src/app/api/cron/os-goals-sentinel/route.ts
  → cada 15 min (Vercel cron)
  → itera goals de todas las orgs
  → evalúa predicate contra estado actual
  → marcVerified() con evidence
  → si breach, insert en os_activity
```

---

## §10 Sprint 1 · secuencia de PRs

Sprint 1 = 9 rutas: Console + Integrations + Agents + Goals + Skills + Funnel + Content + Social + Command.

**11 PRs deployables solos (feature flag oculta hasta el final):**

| PR # | Nombre | Alcance | Deps |
|---|---|---|---|
| **1** | `os: db migration + RLS smoke test` | 7 tablas os_* + RLS + helper `os_current_org()` + smoke test | — |
| **2** | `os: schemas + repository interface + supabase adapter` | `lib/os/schemas/*` + `OSRepository` interface + adapter Supabase + Vitest con fake JWT | PR#1 |
| **3** | `os: next-intl setup + messages/{es,en}.json + middleware condicional` | next-intl v3 + middleware + `messages/*` + `global.d.ts` typing | — |
| **4** | `os: feature flag + api routes /api/os/*` | Vercel Flags SDK + `identify()` + rutas API detrás de `osShellFlag` | PR#1, PR#2 |
| **5** | `os: layout shell + sidebar item + console UI` | `app/[locale]/(shell)/layout.tsx` + item OS en sidebar + `/os` console con pulse cards + activity feed + agent roster | PR#3, PR#4 |
| **6** | `os: /os/integrations con honest-status board unificado` | Registry connectors + adapter wrappers para CM (Meta/WAHA/IG/cron) + FounderOS (Slack/Notion/Stripe/IMAP/Calendar) | PR#5 |
| **7** | `os: /os/agents con constitution + trust ledger` | Port de `ConductorPanel` + `AgentActivityFeed` + `AgentChat` + editor de constitution | PR#5 |
| **8** | `os: /os/goals con standing sentinel + cron job` | Port de goals UI + cron `/api/cron/os-goals-sentinel` + evidence viewer | PR#5 |
| **9** | `os: /os/content + /os/social portados de FounderOS` | Port de `PostComposer` + `SocialStats` + `AudienceConsistency` + `FollowerBarChart` + `NewsletterList` | PR#5 |
| **10** | `os: /os/funnel + /os/skills` | Port de `FunnelRadial` + `FunnelNodeCard` + `SkillsGrid` + `TaskBoard` | PR#5 |
| **11** | `os: /os/command palette (⌘K global)` | Command palette + acciones de todas las rutas anteriores | PR#7, PR#8, PR#9, PR#10 |

**ETA:** 2 semanas si vamos rápido. Cada PR ~2-6 horas.

**Feature flag durante todo el Sprint 1:** `community-os` retorna `true` para `email=leonel.zc2005@gmail.com` en cualquiera de sus orgs → Leonel ve TODO Community OS activo desde día 1. Otros users no lo ven hasta que se agregue a `betaCohorts`.

---

## §11 Risk register + mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Bundle bloat en `/dashboard` | Media | Alto | `next/dynamic` + `@next/bundle-analyzer` CI check en PR#5 |
| RLS bypass por service role | Baja | Crítico | Nunca desde routes client-facing; solo cron/edge functions |
| Doble mantenimiento shell | Alta si crecemos mal | Alto | Regla: componentes de datos compartidos en `components/`, solo layouts divergen |
| Fork drift CM vs OS | Alta | Alto | Prohibido copiar componentes del CM a `/os` — refactor primero |
| Missing translation en prod | Media | Bajo | `tsc --noEmit` como CI gate → build falla si missing key |
| Trust ledger bloat (>1k runs) | Media (post-GA) | Medio | Promote a `os_trust_events` tabla en Sprint 4 |
| Realtime + RLS mismatch | Media | Alto | Solo anon key + JWT válido, nunca service role browser |
| MCP Penpot handshake falla | Alta | Bajo | No bloquea build; Penpot como referencia visual; retomar debug post-Sprint 1 |
| Cron sentinel cuesta más de lo previsto | Baja | Bajo | Vercel cron gratuito hasta 20 jobs; monitor cost |
| Timezone bugs (COP TZ vs UTC) | Media | Medio | Todo `timestamptz` en Postgres; formatting client-side con locale |

---

## §12 Success criteria (Definition of Done Sprint 1)

- ✅ `/dashboard` clásico funciona idéntico post-merge (0 regresiones — validar con smoke test manual + Vercel preview)
- ✅ `/os` invisible para users sin flag activo (verificar con user de prueba sin cohort)
- ✅ Bundle size de `/dashboard` sin cambios ±5KB (verificar con `@next/bundle-analyzer` before/after)
- ✅ RLS smoke test: 2 orgs, cada una solo ve su data (test unitario en PR#1)
- ✅ Test de i18n: `/es/os` + `/en/os` renderizan con traducciones (Vitest snapshot)
- ✅ TypeScript build sin errores + missing translations = error de build
- ✅ Al menos 1 agente con constitution + trust ledger operando en tu org
- ✅ Al menos 3 standing goals verificados por cron
- ✅ Connections board muestra estado real de Meta + WAHA + IG + cron + webhooks (los 5 principales del CM)
- ✅ Deployado a Vercel production con flag activo para tu org

---

## §13 Post-Sprint 1 (2-4)

**Sprint 2 · Brain:**
- `/os/brain` — knowledge graph por marca
- Ingesta: mensajes históricos + contactos + tags
- Componentes: `NeuralGraph`, `KnowledgeGraphFullscreen`, `BrainCore`, `BrainDump`
- Nueva tabla `os_knowledge_nodes` + `os_knowledge_edges`

**Sprint 3 · Workflows + Skills schedulables:**
- `/os/workflows` — multi-step (`os_workflows.steps` shape final)
- Skills ejecutables por cron (`os_skills.schedule`)
- Componente `WorkflowMap` (d3-force)

**Sprint 4 · Post-GA hardening:**
- Trust ledger → tabla dedicada si volumen >1k/agent
- Supabase Vault para connector secrets
- Rollout beta cohort 5-10 orgs
- Theme picker por org (accentHue per brand)

---

## Appendix A · Research reports

- **i18n:** `.superpowers/brainstorm/1328-1786845415/research/i18n-next-intl.md` (next-intl v3, middleware condicional, gotchas Turbopack)
- **Data layer:** `.superpowers/brainstorm/1328-1786845415/research/data-layer-architecture.md` (repository + adapter + 10 gotchas + 6 decisiones humanas)
- **Portabilidad:** `.superpowers/brainstorm/1328-1786845415/research/components-portability.md` (54 A / 4 B / 8 C + top 5 valor + top 5 descarte)
- **Industria:** `.superpowers/brainstorm/1328-1786845415/research/industry-patterns.md` (feature flags Vercel, theme monolith, namespace paralelo)

---

## Appendix B · SQL migration completo

Archivo: `web/supabase/migrations/20260815120000_os_sprint1.sql`

```sql
-- ============================================================================
-- FounderOS × Agentic-OS Sprint 1
-- 7 tablas prefijo os_*, multi-tenant via org_id
-- Cero cambios en tablas cm_* existentes
-- ============================================================================

CREATE TABLE os_agents (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id   text NOT NULL,
  name            text NOT NULL,
  role            text NOT NULL DEFAULT '',
  status          text NOT NULL CHECK (status IN ('active','idle','training','planned')),
  tier            text NOT NULL CHECK (tier IN ('lead','specialist','worker')),
  description     text NOT NULL DEFAULT '',
  model           text NOT NULL DEFAULT '',
  tools           jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_id       text,
  instance        text NOT NULL DEFAULT 'builtin',
  constitution    jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust_score     numeric NOT NULL DEFAULT 0.5,
  trust_ledger    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_agents_org_dep_idx ON os_agents (org_id, department_id);
CREATE INDEX os_agents_org_tier_idx ON os_agents (org_id, tier);

CREATE TABLE os_goals (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           text NOT NULL,
  spec            jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_agent_id  text REFERENCES os_agents(id) ON DELETE SET NULL,
  cadence         text NOT NULL,
  last_checked_at timestamptz,
  last_status     text CHECK (last_status IN ('ok','breach','unknown')),
  last_evidence   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_goals_org_idx ON os_goals (org_id);

CREATE TABLE os_skills (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        text NOT NULL,
  description     text NOT NULL DEFAULT '',
  owner_agent_id  text REFERENCES os_agents(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'planned' CHECK (status IN ('live','learning','planned')),
  tools           jsonb NOT NULL DEFAULT '[]'::jsonb,
  markdown        text NOT NULL DEFAULT '',
  schedule        text,
  ord             int NOT NULL DEFAULT 0
);
CREATE INDEX os_skills_org_idx ON os_skills (org_id);

CREATE TABLE os_workflows (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  subtitle        text NOT NULL DEFAULT '',
  revenue_usd     int NOT NULL DEFAULT 0,
  ord             int NOT NULL DEFAULT 0,
  steps           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_workflows_org_idx ON os_workflows (org_id);

CREATE TABLE os_agent_runs (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id        text NOT NULL REFERENCES os_agents(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL,
  finished_at     timestamptz,
  ok              boolean,
  summary         text NOT NULL DEFAULT '',
  input           jsonb,
  output          jsonb,
  tokens_in       int,
  tokens_out      int,
  cost_usd        numeric
);
CREATE INDEX os_agent_runs_org_started_idx ON os_agent_runs (org_id, started_at DESC);
CREATE INDEX os_agent_runs_agent_idx ON os_agent_runs (agent_id, started_at DESC);

CREATE TABLE os_connectors (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  provider        text NOT NULL,
  status          text NOT NULL CHECK (status IN ('not_configured','configured','live','error')),
  last_check_at   timestamptz,
  last_error      text,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref      text,
  UNIQUE (org_id, id)
);
CREATE INDEX os_connectors_org_status_idx ON os_connectors (org_id, status);

CREATE TABLE os_activity (
  id              bigserial PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  actor_id        text,
  at              timestamptz NOT NULL DEFAULT now(),
  summary         text NOT NULL DEFAULT '',
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok              boolean
);
CREATE INDEX os_activity_org_at_idx ON os_activity (org_id, at DESC);

-- RLS helper
CREATE OR REPLACE FUNCTION os_current_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'org_id','')::uuid
$$;

-- Enable RLS on all 7 tables
ALTER TABLE os_agents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_goals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_skills      ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_workflows   ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_agent_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_connectors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_activity    ENABLE ROW LEVEL SECURITY;

-- RLS policies (loop)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['os_agents','os_goals','os_skills','os_workflows',
                           'os_agent_runs','os_connectors','os_activity']
  LOOP
    EXECUTE format($f$
      CREATE POLICY %I_tenant_read  ON %I FOR SELECT USING (org_id = os_current_org());
      CREATE POLICY %I_tenant_write ON %I FOR ALL    USING (org_id = os_current_org())
                                                     WITH CHECK (org_id = os_current_org());
    $f$, t, t, t, t);
  END LOOP;
END $$;

-- View para activity feed enriched (evita N+1)
CREATE OR REPLACE VIEW os_activity_enriched AS
SELECT
  a.*,
  ag.name AS actor_name,
  ag.tier AS actor_tier
FROM os_activity a
LEFT JOIN os_agents ag ON ag.id = a.actor_id AND ag.org_id = a.org_id;

ALTER VIEW os_activity_enriched SET (security_invoker = true);
```

---

## Appendix C · Layout de directorios nuevos

```
web/
  src/
    app/
      [locale]/
        (shell)/
          layout.tsx                     ← providers compartidos
          os/
            layout.tsx                   ← sub-nav OS + page container
            page.tsx                     ← Console
            agents/page.tsx
            goals/page.tsx
            skills/page.tsx
            funnel/page.tsx
            content/page.tsx
            social/page.tsx
            workflows/page.tsx
            integrations/page.tsx
            command/page.tsx
      api/
        os/
          agents/route.ts
          goals/route.ts
          skills/route.ts
          workflows/route.ts
          connectors/route.ts
          activity/route.ts
          agent-runs/route.ts
          dev/seed/route.ts              ← NODE_ENV=development only
        cron/
          os-goals-sentinel/route.ts     ← Vercel cron cada 15min
    lib/
      os/
        repository.ts                    ← interface OSRepository
        adapters/
          supabase.ts                    ← default adapter
          in-memory.ts                   ← para tests
        schemas/
          agent.ts
          goal.ts
          skill.ts
          workflow.ts
          agent-run.ts
          connector.ts
          activity.ts
          index.ts
        connectors/
          base.ts                        ← ConnectorAdapter interface
          meta/adapter.ts                ← wrapper CM Meta
          waha/adapter.ts                ← wrapper CM WAHA
          instagram/adapter.ts           ← wrapper CM IG
          cron/adapter.ts                ← wrapper CM cron
          webhooks/adapter.ts            ← wrapper CM webhooks
          slack/adapter.ts               ← nuevo FounderOS
          notion/adapter.ts              ← nuevo FounderOS
          stripe/adapter.ts              ← nuevo FounderOS
          gmail-imap/adapter.ts          ← nuevo FounderOS
          google-calendar/adapter.ts     ← nuevo FounderOS
          index.ts                       ← registry
        agents/
          runtime.ts                     ← agent runner
          verify.ts                      ← verify gate
          trust.ts                       ← trust ledger helpers
        goals/
          sentinel.ts                    ← evalúa goals
          predicates.ts                  ← library de predicates
        seed-dev.ts                      ← NODE_ENV=development only
      flags.ts                           ← Vercel Flags
      identify.ts                        ← org identify para flag
    components/
      os/
        Sidebar.tsx                      ← OS sub-nav (dentro de shell)
        ConsoleHome.tsx
        ActivityFeed.tsx
        AgentRoster.tsx
        ConnectionsStrip.tsx
        GoalsGrid.tsx
        PulseCards.tsx
        ConductorPanel.tsx               ← portado FounderOS
        PostComposer.tsx                 ← portado FounderOS
        SocialStats.tsx                  ← portado FounderOS
        FunnelRadial.tsx                 ← portado FounderOS
        SkillsGrid.tsx                   ← portado FounderOS
        WorkflowMap.tsx                  ← portado FounderOS (Sprint 3)
        CommandPalette.tsx               ← portado FounderOS
        terminal.tsx                     ← primitivos (Badge, Dot, SectionHead)
  messages/
    es.json
    en.json
  middleware.ts                          ← extender con next-intl condicional
  next.config.ts                         ← agregar analyze script
  supabase/
    migrations/
      20260815120000_os_sprint1.sql
```

---

## Notas finales

- Rama de trabajo: `visual/os-fusion` derivada de `codex/add-manual-contact` (60 commits del programador, más UI fresco)
- Todo lo intocable del CM se blindó en la sesión de brainstorming
- MCP Penpot registrado pero handshake pendiente — no bloquea, se retoma post-Sprint 1
- Design visual: `.superpowers/brainstorm/1328-1786845415/content/design-hallmark-v2.html` (aprobado por Leonel)
- Este doc es la spec definitiva. Cambios requieren update explícito y commit nuevo

**Siguiente paso:** Leonel revisa este doc → aprueba/pide cambios → invoco `superpowers:writing-plans` para el plan PR-por-PR ejecutable.
