# PLAN FASE 2 — Post-integración SmartTalk ↔ Community Manager

> Cursor integró el chatbot dentro de `community-manager-platform/web`. Build OK, pero quedan **3 bloques críticos** + 6 mejoras antes de prod.

---

## P0 — BLOQUEOS PRODUCCIÓN (hacer YA)

### P0.1 — Aplicar migraciones y arreglar lint
1. `npx supabase db push` (o tu flujo) sobre el proyecto donde viven `cm_*` y `smarttalk.*`.
2. Verificar en SQL Editor:
   - `SELECT enum_range(NULL::smarttalk.channel_type);` incluye `respond_io`.
   - `SELECT cm_client_id FROM smarttalk.organizations LIMIT 1;` no falla.
   - `SELECT smarttalk_organization_id FROM cm_clients LIMIT 1;` no falla.
3. Arreglar `npm run lint`:
   - Revisar `eslint.config.mjs`: con Next 16 + workspace puede necesitar `rootDir` explícito o `--dir src` en el script.
   - Cambiar script a `"lint": "next lint --dir src"` o `"lint": "eslint src"`.
4. Completar `.env.local` desde `.env.example` (Supabase, Anthropic, WhatsApp, Respond.io, ePayco, CRON_SECRET).

**ACEPTACIÓN**: `npm run build && npm run lint` verde, migraciones aplicadas.

### P0.2 — Decidir webhook único de WhatsApp
**Problema**: existen `/api/webhook/whatsapp` (SmartTalk) y `/webhooks/whatsapp` (Comunity Manager viejo).
1. Elegir UNO como canónico. Recomendado: `/api/webhook/whatsapp` (SmartTalk, persiste en schema correcto).
2. El otro: o se borra, o se convierte en proxy que reenvía al canónico.
3. Actualizar la config en Meta App → Webhook → URL apunta SOLO al canónico.
4. `WHATSAPP_WEBHOOK_VERIFY_TOKEN` debe coincidir.

**ACEPTACIÓN**: Meta verifica el webhook nuevo; mensaje entrante de prueba aparece en `/inbox`.

### P0.3 — Unificar login (el más importante)
**Problema**: agente entra a `/login` (CM, localStorage) y `/st/login` (Supabase). Dos sesiones, dos cuentas, RLS no funciona cruzado.

**Estrategia recomendada (bridge automático, sin migrar usuarios)**:
1. En `/login` (CM): al validar `cm_users`, en el mismo server action llamar `supabase.auth.signInWithPassword({ email, password })`.
2. Si no existe en `auth.users`, crearlo con `supabase.auth.admin.createUser` (server-side, service role) + insert en `smarttalk.agents` con `organization_id = (SELECT smarttalk_organization_id FROM cm_clients WHERE id = cm_user.cm_client_id)`.
3. Sincronizar password en ambos lados (o forzar reset al primer login).
4. Borrar `/st/login` y enlace en sidebar.
5. En `register` (CM): crear `cm_client` + `smarttalk.organization` + `smarttalk.agent` + `cm_user` + `auth.user` en una sola transacción (server action).

**Alternativa rápida si no hay tiempo**: dejar dual y poner banner "También loguéate en Inbox" — DEUDA TÉCNICA explícita.

**ACEPTACIÓN**: un solo login → acceso a panel CM Y a `/inbox` sin re-loguear.

---

## P1 — INTEGRACIÓN FUNCIONAL (siguiente sprint)

### P1.1 — `/clients/[id]` abre inbox filtrado
1. En la vista de cliente CM, botón "Ver conversaciones".
2. Server action: `SELECT smarttalk_organization_id FROM cm_clients WHERE id = $1`.
3. Redirige a `/inbox?org=<uuid>` (o setea cookie `active_org_id`).
4. `/inbox` filtra `conversations` por esa org (ya lo hace RLS si auth unificado).

### P1.2 — Provisión automática al crear cliente CM
Cuando se crea `cm_clients`:
1. Trigger SQL o server action crea `smarttalk.organizations` con `cm_client_id = NEW.id`.
2. Update bidireccional: `UPDATE cm_clients SET smarttalk_organization_id = ...`.
3. Asignar plan `free` por defecto.
4. Crear `smarttalk.agents` para el dueño del cliente.

### P1.3 — Mapeo de roles
- CM: `admin` / `cliente`
- SmartTalk: `admin` / `supervisor` / `agent`

Convención: `cm_users.role='admin'` → `agents.role='admin'`. `cm_users.role='cliente'` → `agents.role='agent'`. Documentar en `CLAUDE.md`.

### P1.4 — Schema exposure + Realtime
1. PostgREST: agregar `smarttalk` en `db.schemas` del Supabase self-hosted.
2. Realtime: habilitar replicación en `smarttalk.messages`, `smarttalk.conversations` para que el inbox reciba live updates.
3. Probar con 2 ventanas: agente envía → otra ventana ve el mensaje sin refresh.

---

## P2 — DEUDA TÉCNICA / NICE-TO-HAVE

### P2.1 — Mantener pendientes del plan original
Estos quedaron del PLAN_CURSOR.md original (chatbot standalone) y siguen aplicando:
- **Worker de broadcasts** (Fase 3 del plan original) — migración 008 + cron `*/5`.
- **UI templates WhatsApp** (Fase 4).
- **Tests vitest** (Fase 5) — al menos webhook HMAC y firma ePayco.
- **Observabilidad** (Fase 6) — Sentry o tabla `app_logs`.

### P2.2 — Limpieza
- Borrar `lib/whatsapp-cm.ts` si no se usa en ninguna ruta nueva (confirmar con `grep -r "whatsapp-cm" src/`).
- Borrar `/webhooks/whatsapp` si se eligió el de SmartTalk en P0.2.
- Actualizar `MAPA_PROYECTO.md` (estaba en `F:\chat bot\chatbot\`, ahora vive en `community-manager-platform/web`).
- README del repo unificado: explicar que `(agency)/` es Comunity y el resto es SmartTalk inbox.

### P2.3 — Branding unificado
- Logo único, colores únicos, sidebar único.
- El AppShell de `(agency)/` y el layout del inbox deberían compartir header.

### P2.4 — Smoke test end-to-end
1. Registrar cliente CM nuevo.
2. Verificar que se creó `smarttalk.organization` automática.
3. Login único.
4. Conectar canal WhatsApp en `/settings/channels`.
5. Enviar mensaje desde otro celular al número.
6. Confirmar que aparece en `/inbox`.
7. Responder desde el inbox.
8. Confirmar que llega al celular.

---

## ORDEN DE EJECUCIÓN SUGERIDO

```
DÍA 1 (4h):
  ├─ P0.1 (migraciones + lint + env)         30 min
  ├─ P0.2 (webhook único)                    30 min
  └─ P0.3 (login unificado)                  3 h

DÍA 2 (4h):
  ├─ P1.1 (clients[id] → inbox)              1 h
  ├─ P1.2 (provisión auto)                   1.5 h
  ├─ P1.3 (roles)                            30 min
  └─ P1.4 (PostgREST + Realtime)             1 h

DÍA 3 (resto):
  └─ P2.1..P2.4 según prioridad de negocio
```

---

## PROMPT LISTO PARA CURSOR

> Lee `PLAN_CURSOR_FASE2.md`. Ejecuta P0.1 paso a paso. Reporta antes de pasar a P0.2. Antes de tocar auth (P0.3), confírmame la estrategia elegida (bridge automático vs migración total).
