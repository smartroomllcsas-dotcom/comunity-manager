# Plan de Integración — Inbox tipo respond.io en Community Manager

**Fecha:** 2026-05-14
**Autor:** Leonel + Claude (Opus 4.7)
**Estado:** Borrador para validación
**Repo destino:** `F:/comunity manager/community-manager-platform/web`
**Repo fuente (referencia):** `F:/chat bot/chatbot` (smarttalk)

---

## 1. Diagnóstico (sin teoría)

### community-manager — lo que ya hay
- Next.js 15 + React 19 + TS + Tailwind 4
- Supabase self-hosted (`smartmedia-*.smartgenapp.com`), schema `cm_*` aplicado
- MySQL legacy (`mysql2` cliente) — convive
- **OAuth Meta/FB/IG/WA en producción y aprobado** (`www.comunitymanager.io`) — apps `1491695645279792` y `1629159664853941`
- Webhooks placeholder: `/api/webhook/whatsapp`, `/api/webhook/messenger`, `/webhooks/facebook`, `/webhooks/whatsapp`
- Endpoints WA: `register`, `subscribe`, `test-message`
- Páginas por cliente: `/clients/[clientId]/whatsapp`, `/clients/[clientId]/meta`
- Inbox actual: SOLO `/chat/page.tsx` + `components/ChatMessage.tsx` (placeholder)
- Sin dependencias de UI heavy (no shadcn, no zustand, no tanstack, no @supabase/ssr)

### chatbot/smarttalk — lo que se va a portar
- **29 tablas** schema `smarttalk` (organizations/agents/contacts/conversations/messages/channels/templates/etc.)
- `lib/whatsapp/{api,webhook,token-manager,types}.ts`
- `lib/respond-io/{api,types}.ts`
- `lib/chatbot/{engine,ai}.ts`
- `lib/ai/actions.ts` + `/api/ai/assist`
- 47 API routes (45 son las que importan: messages, conversations, channels, templates, tags, etc.)
- Inbox UI: `ChatWindow`, `MessageBubble`, `MessageInput`, `ConversationList`, `ConversationItem`, `ConversationFilters`, `ContactPanel`, `InternalNotes`, `ClosingDialog`, `SnoozeDropdown`, `AIAssist`
- Stores zustand `inbox.ts`, hooks Tanstack Query

### Gap real
| Área | CM | chatbot | Acción |
|---|---|---|---|
| OAuth Meta | ✅ prod | ✅ embedded signup | **mantener CM** |
| DB schema mensajes | ❌ | ✅ `smarttalk.*` | **portar a `cm_*`** |
| Send unificado | ❌ | ✅ branch logic | **portar** |
| Inbox UI realtime | ❌ | ✅ Supabase Realtime | **portar** |
| Tanstack/Zustand/shadcn | ❌ | ✅ | **agregar** |
| Multi-tenant orgs | ❌ (usa `clients`) | ✅ (`organizations`+`agents`) | **mapear**: `cm.clients` ≈ `org`; `cm.users` ≈ `agents` |
| Chatbot/AI flows | ❌ | ✅ | **fase 2** (no bloqueante) |
| Broadcasts | ❌ | ✅ | **fase 2** |
| Billing ePayco | ❌ | ✅ | **omitir** (CM no lo necesita ahora) |

---

## 2. Estrategia

**Portar el módulo de mensajería de smarttalk como un sub-sistema dentro de CM**, reusando OAuth y dominio que ya están en prod. Un solo deploy, una sola app.

NO se hace fork ni se monta como app separada. Se merge dentro de `web/src/app/(inbox)/...` y `web/src/lib/messaging/...`.

Mapeo de tenancy:
- `smarttalk.organizations` → ya cubierto por `cm_clients` (cada cliente del community manager = tenant)
- `smarttalk.agents` → mapear a `cm_users` (con campo `role: admin|supervisor|agent`)
- Todas las tablas nuevas referencian `client_id` (no `organization_id`) para encajar con CM

---

## 3. Fases concretas

### FASE 0 — Decisiones bloqueantes (1 día)
**Antes de tocar código, confirmar:**

- [ ] **Tenancy**: ¿el inbox vive dentro de `/clients/[clientId]/inbox` o es global (`/inbox` con selector)? → Recomendado: **global con filtro por client**, igual que smarttalk.
- [ ] **Schema**: prefijo `cm_msg_*` (queda en mismo schema `cm_*`) vs schema dedicado `cm_messaging.*`. → Recomendado: **schema dedicado** `cm_messaging` para aislar y poder rollback fácil.
- [ ] **Realtime**: confirmar que la instancia self-hosted Supabase tiene Realtime habilitado en `smartmedia` para schema nuevo.
- [ ] **MySQL**: ¿se mantiene MySQL para los datos viejos o se consolida todo a Supabase? → Recomendado: **consolidar todo nuevo en Supabase**, dejar MySQL solo lectura.
- [ ] **AI provider**: usar `ANTHROPIC_API_KEY` real (CM ya tiene `@anthropic-ai/sdk`) o LiteLLM `https://llm.smartgenapp.com/v1`.

### FASE 1 — Base de datos (1 día)
1. Crear `web/supabase/migrations/20260515_messaging_schema.sql` adaptando las migs `001`–`007` del chatbot:
   - Reescribir `organization_id uuid REFERENCES smarttalk.organizations` → `client_id uuid REFERENCES cm_clients`
   - Eliminar tablas: `plans`, `subscriptions`, `payments`, `usage_records`, `invitations`, `agent_teams`, `teams` (CM no las necesita ahora)
   - Mantener: `channels, contacts, conversations, messages, message_templates, internal_notes, contact_field_definitions, contact_segments, contact_activities, tags, lifecycle_stages, lifecycle_history, closing_categories, chatbot_flows, ai_config, knowledge_sources, assignment_rules, quick_replies` (17 tablas, vs 29 originales)
   - Adaptar RLS: `get_client_id_for_user()` reemplaza a `get_agent_org_id()`
2. Aplicar a self-hosted: `npx supabase db push --db-url postgresql://...@smartmedia-db.smartgenapp.com:5432/postgres`
3. Validar con `mcp__claude_ai_Supabase__list_tables` + advisors.

### FASE 2 — Dependencias y libs base (medio día)
1. `cd web && npm i @supabase/ssr @tanstack/react-query zustand sonner cmdk class-variance-authority tailwind-merge date-fns lucide-react @base-ui/react`
2. `npx shadcn@latest init` + agregar `button card dialog dropdown-menu input scroll-area select sheet switch tabs textarea tooltip avatar badge popover separator label`
3. Migrar `src/lib/supabase.ts` actual → `src/lib/supabase/{client,server,middleware,admin}.ts` (4 archivos, patrón SSR del chatbot)
4. Crear `src/lib/messaging/`:
   - `whatsapp/{api,webhook,token-manager,types}.ts` ← copiar y adaptar (cambiar `import { createClient } from '@/lib/supabase/admin'`)
   - `respond-io/{api,types}.ts` (opcional, sólo si cliente requiere usar Respond.io en paralelo)
   - `inbox-engine.ts` (placeholder para chatbot fase futura)

### FASE 3 — API routes (1.5 días)
Mover/crear bajo `web/src/app/api/`:

| Origen smarttalk | Destino CM | Cambio clave |
|---|---|---|
| `/api/messages/send` | `/api/messaging/send` | branch por `channel.type`; usa `cm_messaging.channels` |
| `/api/conversations/[id]/snooze` | igual | — |
| `/api/notes` | `/api/messaging/notes` | — |
| `/api/channels` + `/[id]` + `/[id]/toggle` | `/api/messaging/channels/...` | scope por `client_id` |
| `/api/channels/whatsapp/connect` | **fusionar con `/api/auth/meta/callback` existente** | el callback debe insertar `cm_messaging.channels` row además de lo que hace hoy |
| `/api/contacts/import` + export + fields + segments + tags + lifecycle + closing-categories | `/api/messaging/contacts/...` etc. | — |
| `/api/templates/sync` | `/api/messaging/templates/sync` | — |
| `/api/ai/assist` | igual | usar `ANTHROPIC_API_KEY` actual |
| `/api/webhook/whatsapp` (chatbot) | **reemplazar el de CM** | el de CM hoy es placeholder; el de chatbot persiste mensajes en DB y dispara Realtime |
| `/api/webhook/messenger` (CM) | mantener pero conectar a `cm_messaging.messages` | |

### FASE 4 — UI Inbox (2 días)
1. Crear ruta `web/src/app/(inbox)/inbox/page.tsx` (con `AppShell` actual de CM; sólo agregar item "Inbox" al `Sidebar.tsx`)
2. Copiar componentes de `chatbot/src/components/inbox/*` → `web/src/components/inbox/*`
3. Crear `web/src/stores/inbox.ts` (zustand) y `web/src/components/providers/QueryProvider.tsx`
4. Envolver `app/layout.tsx` con `QueryProvider`
5. Suscripción Realtime al canal `cm_messaging:messages` filtrada por `client_id` activo
6. Verificar que filtros, búsqueda, asignación, snooze, notas internas y AI assist funcionan con datos reales

### FASE 5 — Cron y mantenimiento (medio día)
1. Agregar a `web/vercel.json`:
```json
{ "crons": [
  { "path": "/api/cron/refresh-tokens", "schedule": "0 3 * * *" },
  { "path": "/api/cron/process-broadcasts", "schedule": "*/5 * * * *" }
]}
```
2. Portar `lib/whatsapp/token-manager.ts` y crear `/api/cron/refresh-tokens` con `CRON_SECRET`.
3. Generar `CRON_SECRET` con `openssl rand -hex 32` y agregar a Vercel envs.

### FASE 6 — Smoke test end-to-end (medio día)
1. Conectar 1 número WA real desde `/inbox` → embedded signup → callback → row en `cm_messaging.channels`.
2. Enviar WA al número de prueba → verificar que llega a `/api/webhook/whatsapp` → aparece en inbox vía Realtime.
3. Responder desde UI → verificar que llega al teléfono.
4. Probar AI assist con conversación real.
5. Crear template, sincronizar con Meta, mandar broadcast a 5 números de prueba.

### FASE 7 — Diferidos (post-MVP)
- Chatbot builder visual (`FlowEditor`/`FlowNode`)
- Knowledge base + AI agents autónomos
- Broadcasts con cola y métricas
- Billing ePayco (sólo si CM lo va a vender como SaaS)
- Conector Respond.io paralelo (sólo si hay cliente que ya tenga workspace ahí)

---

## 4. Riesgos específicos

| Riesgo | Mitigación |
|---|---|
| Conflicto entre webhook WA actual de CM y el nuevo | Hacer diff de los 2 archivos, mergear con cuidado, mantener verify_token actual |
| Realtime no habilitado en self-hosted Supabase | Validar en Fase 0 corriendo `select * from pg_publication_tables;` |
| Mapeo `clients` ↔ `organizations` rompe RLS | Crear vista `current_client_id()` y testear con 2 usuarios distintos antes de Fase 4 |
| Tanstack Query + RSC + Next 15 caches viejos | Marcar fetches con `dynamic = 'force-dynamic'` en routes del inbox |
| OAuth callback existente cambia de comportamiento | Bandera `MESSAGING_ENABLED` en env para activar el insert en `channels` solo cuando esté listo |
| Tokens WA larga duración expiran sin cron | Cron `refresh-tokens` activo desde día 1 (Fase 5) |
| Bundle size sube mucho con shadcn + zustand + tanstack | Lazy load del inbox con `dynamic(() => import(...), { ssr: false })` |

---

## 5. Próxima acción inmediata

Responder estas 5 preguntas (Fase 0) y arranco con el SQL de migración:

1. ¿Inbox global con selector de cliente, o `/clients/[id]/inbox`?
2. ¿Schema dedicado `cm_messaging` o tablas `cm_msg_*`?
3. ¿Self-hosted Supabase tiene Realtime habilitado? (puedo verificar con MCP)
4. ¿Anthropic real o LiteLLM?
5. ¿Mantenemos MySQL en paralelo o consolidamos a Supabase?

Cuando me pases las respuestas, escribo la migración SQL en una sola pasada.
