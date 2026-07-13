# Community Manager · Runbook operativo

Última actualización: 2026-07-12

Documento con procedimientos para deploy, rotación de secretos, restore y troubleshooting común.

---

## 1. Arquitectura resumida

- **Frontend + API:** Next.js 16 en Vercel (`https://www.comunitymanager.io`)
- **DB:** Supabase self-hosted `smartmedia` (Tailscale nodo `smartmedia`, `100.124.193.99`)
  - Postgres directo: `smartmedia:5442` (user `postgres`)
  - Pooler: `smartmedia:6544` (user `postgres.smartmedia`)
  - Studio: `https://smartmedia-studio.smartgenapp.com`
  - API pública: `https://smartmedia-api.smartgenapp.com`
- **Container DB:** `sb-smartmedia-db` (Docker en el servidor)
- **Owner del schema smarttalk:** `supabase_admin` (no `postgres` — importante para DDL)

Cifrado de tokens: **AES-256-GCM** con clave `TOKEN_ENCRYPTION_KEY` (32 bytes hex). Ciphertext se guarda en columnas `*_ciphertext`. Lectores usan `resolveToken()` con fallback a la columna legacy plana.

---

## 2. Deploy manual (auto-deploy desconectado desde 2026-04-10)

```bash
# 1. Verificar tests y build local
cd web/
npm test
npx tsc --noEmit
npx next build

# 2. Commit + push
git add <files>
git commit -m "descripción"
git push origin master

# 3. Deploy a producción
vercel --prod --yes
```

### Si hay migración SQL nueva

Aplicar **antes** del deploy vía SSH + docker exec:

```bash
cat web/supabase/migrations/YYYYMMDD_XXX_nombre.sql | \
  tailscale ssh smartmedia@smartmedia \
  "docker exec -i sb-smartmedia-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1"
```

**Importante:** usar `supabase_admin`, no `postgres`. El schema `smarttalk` es propiedad de `supabase_admin` y `postgres` no tiene permisos DDL sobre él.

---

## 3. Rotación de `TOKEN_ENCRYPTION_KEY`

Rotar la clave requiere descifrar con la vieja y recifrar con la nueva. Procedimiento:

```bash
# 1. Generar la nueva clave
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Añadirla temporalmente a Vercel como TOKEN_ENCRYPTION_KEY_NEXT (no reemplazar aún)
vercel env add TOKEN_ENCRYPTION_KEY_NEXT production

# 3. Correr script de rotación local con AMBAS keys
export NEXT_PUBLIC_SUPABASE_URL=<...>
export SUPABASE_SERVICE_ROLE_KEY=<...>
export TOKEN_ENCRYPTION_KEY=<vieja>
export TOKEN_ENCRYPTION_KEY_NEXT=<nueva>
node web/scripts/rotate-tokens.mjs  # (crear este script si aún no existe — modela sobre reencrypt-tokens.mjs)

# 4. Mover TOKEN_ENCRYPTION_KEY_NEXT → TOKEN_ENCRYPTION_KEY en Vercel
vercel env rm TOKEN_ENCRYPTION_KEY production
vercel env add TOKEN_ENCRYPTION_KEY production  # pegar la nueva
vercel env rm TOKEN_ENCRYPTION_KEY_NEXT production

# 5. Redeploy
vercel --prod --yes
```

**Si la clave se pierde:** todos los tokens cifrados quedan irrecuperables. Los canales deben re-conectarse por OAuth. Backup local en `web/.env.production`.

---

## 4. Cifrado inicial de tokens legacy

Una vez tras aplicar la migración 009:

```bash
cd web/
export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' .env.production | xargs)
export TOKEN_ENCRYPTION_KEY=<64 hex>
node scripts/reencrypt-tokens.mjs
```

Idempotente. Solo cifra filas donde `access_token_ciphertext` está NULL y `access_token` (plano) tiene valor.

---

## 5. Backup y restore

### Backup diario automático (ya configurado en el servidor)

Cron en `/etc/cron.d/backup-stacks`: `0 3 * * *` corre `/home/smartmedia/scripts/backup-all-stacks.sh`. Rota 7 días. Best-effort rsync a `serverhome`.

### Restore desde backup

```bash
# 1. SSH al servidor
tailscale ssh smartmedia@smartmedia

# 2. Verificar backups disponibles
ls -la /var/backups/stacks/

# 3. Restaurar dump (ejemplo — reemplaza el path)
docker exec -i sb-smartmedia-db psql -U postgres -d postgres < /var/backups/stacks/smartmedia_2026-07-11_03.sql

# 4. Reiniciar el stack
sudo systemctl restart stack-up-smartmedia
```

**Aviso:** el restore borra estado post-backup (mensajes, conversaciones, etc.). Si es parcial, usar `pg_restore -t <tabla>` con un dump `-Fc`.

---

## 6. Monitoreo

### Health check

```
GET https://www.comunitymanager.io/api/health
```

Respuesta OK: `{ ok: true, database: {ok:true}, webhookEvents: {pending, failed, dead, oldestPendingAgeSec} }`.

Se considera **degraded** si:
- `oldestPendingAgeSec > 300` (pending >5 min)
- `dead > 0`

Sugerido: agregar a UptimeRobot / BetterStack contra este endpoint con alerta si el JSON contiene `"ok":false` o `"degraded":true`.

### Cron jobs activos (Vercel)

- `0 3 * * *` → `/api/cron/refresh-tokens` (renueva Meta tokens que expiran en 7 días)
- `*/2 * * * *` → `/api/inbox/process-webhook-events` (procesa cola de webhook_events y dispara alertas de dead letters)

### Alertas dead-letter

Configurar `WEBHOOK_ALERT_URL` en Vercel (webhook Slack/Discord/n8n). Cuando el cron detecta `webhook_events` con `status=failed AND attempts >= 3`, envía un POST con `{ text, dead_count, samples }`. Cooldown interno de 15 min para no spammear.

---

## 7. Troubleshooting

### 7.1 Webhook Meta responde 401 "Invalid signature"

- Verificar que `META_APP_SECRET` (Facebook/Messenger), `META_IG_APP_SECRET` (Instagram) o `WHATSAPP_APP_SECRET` estén configurados y coincidan con el dashboard de Meta App.
- Rotar app secret en el dashboard → actualizar Vercel → redeploy.

### 7.2 Webhook responde 500 "queue_write_failed"

- La cola `webhook_events` no acepta escrituras. Verificar:
  ```
  SELECT * FROM smarttalk.webhook_events LIMIT 1;  -- ¿existe la tabla?
  ```
- Si no existe, la migración 011 no se aplicó. Aplicarla y redeploy.

### 7.3 OAuth Instagram redirige con `ig_error=state_expired`

- Normal si el usuario tardó >15 min entre autorizar y volver. Reiniciar el flujo.
- Si es persistente en usuarios que autorizan rápido, revisar horario del servidor (`docker exec sb-smartmedia-db date`).

### 7.4 Token expirado en un canal

- Detectado por `refreshExpiringTokens` (cron 3am). Si un canal cae en `status='error'`:
  ```sql
  SELECT id, name, token_expires_at FROM smarttalk.channels WHERE status='error';
  ```
- Reconectar por OAuth desde el UI del cliente correspondiente.

### 7.5 Migración SQL falla con "must be owner of table X"

- Usar `-U supabase_admin` en vez de `-U postgres`. El schema `smarttalk` es propiedad de `supabase_admin`.

### 7.6 MCP `supabase-selfhosted` no arranca (`spawn EINVAL`)

- Node 24 bloquea `spawn` de `.cmd` sin `shell:true` (CVE-2024-27980).
- Verificar que el config en `~/.claude.json` use:
  ```json
  {
    "command": "node",
    "args": ["--import", "tsx", "<path a src/index.ts>"]
  }
  ```
- Reiniciar Claude Code.

### 7.7 Instagram sync deja mensajes viejos afuera

- Cap por sync: 100 conversaciones × 100 mensajes. Cursor persistente en `inbox_sync_state.metadata.conversationsCursor` (desde Sprint 9) retoma en cada corrida hasta agotar el histórico.
- Los mensajes nuevos igual llegan por webhook push — el sync solo cubre backfill inicial.

---

## 7-bis. Rotación de secretos Meta (App Secrets y Verify Tokens)

Los tres app secrets (`META_APP_SECRET` para FB/Messenger, `META_IG_APP_SECRET` para Instagram, `WHATSAPP_APP_SECRET` para WhatsApp) y los dos verify tokens deben rotarse periódicamente (recomendado: cada 90 días o si sospechás compromiso).

**Riesgo:** durante la rotación hay una ventana en la que Meta puede firmar con la vieja mientras el app ya usa la nueva → webhook rechazado con 401. La rotación siempre debe hacerse **sin bajar el webhook** — se cambia el app secret en el dashboard de Meta y en Vercel casi simultáneamente.

### Procedimiento para `META_APP_SECRET`, `META_IG_APP_SECRET`, `WHATSAPP_APP_SECRET`

Todos los secrets funcionan igual — este ejemplo usa `META_APP_SECRET` (FB/Messenger App):

1. **Preparar la nueva clave.**
   - Ir al Meta Developer dashboard → tu App → Settings → Basic
   - Copiar el App Secret actual (temp) — no lo vayas a perder
2. **Añadir la nueva al Vercel primero** (con nombre alternativo):
   ```bash
   vercel env add META_APP_SECRET_NEXT production
   # pegar el mismo valor que aún hay en el dashboard (rotación se hace en el dashboard)
   ```
3. **Actualizar el código temporalmente** para aceptar ambos secrets. En `lib/smarttalk/meta-webhook.ts`, modifica `getMetaAppSecret` para probar primero `META_APP_SECRET_NEXT` luego `META_APP_SECRET`. Deploy.
4. **Regenerar el secret en el dashboard.**
   - En el Meta Developer dashboard → App → Settings → Basic → **Reset App Secret**
   - Copiá el nuevo App Secret
5. **Actualizar `META_APP_SECRET` en Vercel** con el nuevo valor:
   ```bash
   vercel env rm META_APP_SECRET production
   vercel env add META_APP_SECRET production
   # pegar el NUEVO valor del dashboard
   ```
6. **Redeploy** para que la variable actualizada tome efecto:
   ```bash
   vercel --prod --yes
   ```
7. **Verificar que los webhooks siguen entrando 200**:
   ```bash
   # Enviar test payload desde el Meta dashboard o esperar tráfico real
   # y consultar los logs de Vercel Functions
   curl -s https://www.comunitymanager.io/api/health | jq .webhookEvents
   ```
8. **Limpiar la alternancia temporal.**
   - Quitar `META_APP_SECRET_NEXT` de Vercel
   - Revertir el cambio en `getMetaAppSecret` (o dejar el fallback si te resulta útil)

### Procedimiento para `META_WEBHOOK_VERIFY_TOKEN` y `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Los verify tokens son estáticos y solo se usan en el GET inicial de verificación del webhook — no en los POST reales. Rotarlos requiere:

1. Generar nuevo valor: `openssl rand -hex 32`
2. Añadir a Vercel: `vercel env add META_WEBHOOK_VERIFY_TOKEN production` (o `WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
3. Redeploy
4. En el Meta dashboard → App → Webhooks → editar la subscripción y pegar el nuevo verify token → Meta enviará un GET al webhook para verificar
5. Si Meta confirma la verificación, la rotación está completa

### Checklist post-rotación

- [ ] `curl /api/health` responde `ok: true`
- [ ] `webhook_events` tiene inserts recientes (< 5 min)
- [ ] Sin errores 401 "Invalid signature" en los últimos 30 min en Vercel logs
- [ ] `.env.production` local actualizado con el nuevo valor (para el reencrypt-tokens.mjs si aplica)
- [ ] Nueva clave guardada en el password manager

---

## 8. Secretos activos en producción

Todos en Vercel `production` env. Backup local en `web/.env.production` (excluido de git).

| Var | Uso | Rotación |
|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM tokens Meta | Ver §3 |
| `META_APP_SECRET` | HMAC webhooks FB/Messenger | Meta App Dashboard → renovar 90d |
| `META_IG_APP_SECRET` | HMAC webhook Instagram | Meta App Dashboard → renovar 90d |
| `WHATSAPP_APP_SECRET` | HMAC webhook WhatsApp | Meta App Dashboard → renovar 90d |
| `META_WEBHOOK_VERIFY_TOKEN` | GET verify token | Al azar, se sincroniza con dashboard |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | GET verify WhatsApp | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT service role | En el .env del stack en el servidor |
| `CRON_SECRET` | Autoriza Vercel Cron | Rotar semestralmente |
| `WEBHOOK_ALERT_URL` | (opcional) URL Slack/Discord para dead letters | — |

---

## 9. Contactos y accesos

- **Servidor smartmedia:** SSH via Tailscale (`tailscale ssh smartmedia@smartmedia`, pass `me112410`)
- **Vercel project:** `smartroomllcsas-2167/cg-moda/comunityagent`
- **Meta App IDs:** FB `1491695645279792`, IG `1629159664853941`, WA config `994300759657345`
- **Docs adicionales:** `C:\Users\Leonel\Desktop\Stack-Smartgenapp\ACCESOS_BASES_S1.md` (passwords de todas las DBs)

---

## 10. Historial de sprints de hardening (2026-07-12)

- **Sprint 1:** bcrypt passwords, HttpOnly cookies, HMAC webhooks Meta, bucket privado + signed URLs, rate limit login, whitelist tokens.
- **Sprint 2:** cifrado AES-256-GCM, RLS restrictivo, UNIQUE indexes idempotencia, `after()` desacople Meta, Realtime frontend, Zod messages/send.
- **Sprint 3:** filtros server-side, errores UI, cifrado WhatsApp writers/readers, `reencrypt-tokens.mjs`, tests parser Meta (29 casos).
- **Sprint 4:** MIME magic-bytes, owner check delete, `inbox_sync_state` serverless-safe, tests token-crypto (12 casos).
- **Sprint 5:** OAuth state estricto, cola persistente `webhook_events`, cron `/api/inbox/process-webhook-events`, fixtures E2E (10 casos).
- **Sprint 6:** refactor MessageInput 676→493 líneas (`useVoiceRecorder`, `TemplateBanner`, `EmojiStickerPicker`), fix MCP supabase-selfhosted, paginación mensajes Instagram.
- **Sprint 7:** `next.config` remotePatterns, paginación `fetchMessengerParticipantIdentity`, cap CONVERSATION 100 con log de warning.
- **Sprint 8:** `/api/health` con métricas de queue, alertas dead-letter con cooldown, runbook.
