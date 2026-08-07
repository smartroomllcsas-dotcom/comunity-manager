# WAHA Channel Runbook

Self-hosted WhatsApp HTTP API — deployed as the `waha` channel type. Beta since 2026-08-07.

## Where things live

| Piece | Location |
|---|---|
| WAHA container | `server` (Tailscale IP `100.103.216.114`) · `/opt/waha/docker-compose.yml` |
| Public URL | `https://waha.smartgenapp.com` (Cloudflare Tunnel `smartmedia`, id `a01217a1-964e-4ae9-a81d-d4199d278eb0`) |
| Admin dashboard | `https://waha.smartgenapp.com/dashboard` (Basic Auth — creds in `/opt/waha/.env`) |
| Sessions data | `/opt/waha/data/sessions/` (Docker volume — **backup weekly**) |
| API key | `/opt/waha/.env → WAHA_API_KEY` (must match Vercel env `WAHA_API_KEY`) |
| Webhook HMAC secret | `/opt/waha/.env → WAHA_WEBHOOK_HMAC_SECRET` (must match Vercel env `WAHA_WEBHOOK_HMAC_SECRET`) |
| DB enum + table | `smarttalk.channel_type` (`'waha'`) + `smarttalk.waha_sessions` |
| Migration | `web/supabase/migrations/20260807000000_020_waha_channel.sql` (applied via `psql -U supabase_admin`) |
| Watchdog cron | `/api/cron/waha-watchdog` every 5 min (Vercel Cron) |
| Cloudflared systemd unit | `cloudflared-smartmedia.service` on `server` |
| Cloudflared config | `/etc/cloudflared/config-smartmedia.yml` |

## First-time deploy (already done 2026-08-07)

Repo files: `infra/waha/{docker-compose.yml,.env.example,cloudflared-ingress.snippet}`.

On `server`:

```bash
sudo mkdir -p /opt/waha/data/{sessions,files,media}
sudo cp <repo>/infra/waha/docker-compose.yml /opt/waha/
sudo cp <repo>/infra/waha/.env.example /opt/waha/.env
sudo openssl rand -hex 32  # → WAHA_API_KEY (also to Vercel env)
sudo openssl rand -hex 32  # → WAHA_WEBHOOK_HMAC_SECRET (also to Vercel env)
sudo nano /opt/waha/.env  # fill in the values + WAHA_DASHBOARD_PASSWORD
cd /opt/waha && sudo docker compose pull && sudo docker compose up -d
```

Cloudflare Tunnel:

```bash
sudo cp /etc/cloudflared/config-smartmedia.yml /etc/cloudflared/config-smartmedia.yml.bak-$(date +%F)
sudo nano /etc/cloudflared/config-smartmedia.yml   # insert the ingress block from infra/waha/cloudflared-ingress.snippet
sudo cloudflared tunnel --config /etc/cloudflared/config-smartmedia.yml ingress validate  # → OK
sudo systemctl restart cloudflared-smartmedia
sudo cloudflared tunnel route dns smartmedia waha.smartgenapp.com   # creates CNAME
```

Smoke:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://waha.smartgenapp.com/ping                # → 200
curl -sS -o /dev/null -w '%{http_code}\n' https://waha.smartgenapp.com/api/sessions        # → 401
curl -sS -H "X-Api-Key: $KEY" https://waha.smartgenapp.com/api/sessions                    # → 200 []
```

## Common ops

### Restart WAHA container

```bash
ssh server
cd /opt/waha && sudo docker compose restart waha
sudo docker logs waha --tail 30 -f
```

### Restart the Cloudflare Tunnel (affects 11 subdomains — do only if needed)

```bash
sudo systemctl restart cloudflared-smartmedia
sudo systemctl status cloudflared-smartmedia --no-pager
```

### Add a new brand session (from the app)

Settings → Channels → Add channel → "WhatsApp (WAHA · Beta)" → scan QR from the target phone within ~30 seconds.

### Manually delete a stuck session

```bash
KEY=$(grep ^WAHA_API_KEY= /opt/waha/.env | cut -d= -f2)
curl -sS -X DELETE -H "X-Api-Key: $KEY" https://waha.smartgenapp.com/api/sessions/brand_<id>
```

### Rotate the API key

1. Generate: `openssl rand -hex 32`
2. Update Vercel Production env `WAHA_API_KEY`, redeploy the web app (`vercel --prod --yes` from `web/`).
3. SSH to `server`, edit `/opt/waha/.env`, `sudo docker compose up -d` (recreates container with new key). ~5s window where CM cannot reach WAHA.

### Rotate the HMAC secret

Same as above for `WAHA_WEBHOOK_HMAC_SECRET`. **Additionally** all existing sessions must be re-created (the HMAC is baked into each session's webhook config). Simplest: delete + re-create each session from the UI.

### Backup the sessions volume

```bash
ssh server
sudo tar czf ~/waha-sessions-$(date +%F).tgz -C /opt/waha data/sessions
# Restore: stop container, extract into /opt/waha, start container.
```

## Multi-tenant model

- 1 sesión por brand.
- `session_name = brand_<brand_uuid_no_dashes>` (see `web/src/lib/waha/session-name.ts`).
- All sessions share the same WAHA instance; WAHA supports this natively.
- One row in `smarttalk.waha_sessions` per session, one row in `smarttalk.channels` (type='waha') per brand.

## Troubleshooting

**Symptom: UI shows `SCAN_QR_CODE` forever.**
- Check `/api/channels/waha/<id>/status` — this endpoint hits WAHA directly and syncs state.
- QRs expire every ~30s; the modal auto-refreshes every 25s.
- `sudo docker logs waha --tail 100 | grep -iE 'error|qr'`

**Symptom: watchdog cron marks sessions `disconnected` right after connecting.**
- WAHA container restarted and lost session state (volume issue).
- Verify `/opt/waha/data/sessions/` is intact and mounted correctly (`sudo docker inspect waha | grep -A3 Mounts`).

**Symptom: `POST /api/channels/waha/connect` returns 502.**
- Vercel cannot reach `waha.smartgenapp.com`.
- From your laptop: `curl -sS -o /dev/null -w '%{http_code}\n' https://waha.smartgenapp.com/ping` — should be 200.
- If not: `sudo systemctl status cloudflared-smartmedia`; check `sudo journalctl -u cloudflared-smartmedia -n 30`.

**Symptom: WAHA logs say `401 Unauthorized` on webhook receipt.**
- HMAC secret drift between Vercel and `/opt/waha/.env`.
- Both must be identical. Compare, re-align, restart WAHA (`docker compose up -d`), re-create sessions from UI.

**Symptom: DB error `must be owner of type channel_type` when applying a WAHA migration.**
- Connect as `supabase_admin` (superuser), not `postgres`:
  ```bash
  PGPASSWORD='...' psql -h 127.0.0.1 -p 6002 -U supabase_admin -d postgres -f mig.sql
  ```

## Rollback

The Task 1 change to `cloudflared-smartmedia` can be reverted:

```bash
ssh server
sudo cp /etc/cloudflared/config-smartmedia.yml.bak-2026-08-07-* /etc/cloudflared/config-smartmedia.yml
sudo systemctl restart cloudflared-smartmedia
```

To remove WAHA entirely:

```bash
cd /opt/waha && sudo docker compose down -v   # -v also removes the sessions volume!
sudo rm -rf /opt/waha
# In Vercel: remove WAHA_* env vars.
# In Cloudflare Dashboard: delete the waha CNAME record.
# In DB: DELETE FROM smarttalk.channels WHERE type='waha';  (RLS-guarded, needs supabase_admin)
```

## Known limitations (2026-08-07 beta)

- **Message ingestion inbound is a no-op.** The webhook enqueues events into `smarttalk.webhook_events`, and the cron `process-webhook-events` handles only `session.status` for `channel='waha'` (returns `ok:true` no-op for `message` events). Full inbox integration (contacts + conversations + messages upserts, mirroring respond-io) is deferred to a follow-up sprint.
- **Outbound sending is not wired into the central inbox dispatcher.** `web/src/lib/waha/sender.ts` exists but is not yet called from the "reply from inbox" flow.
- **Beta positioning.** UI shows a warning: "Canal no oficial. Riesgo de baneo si se detecta uso automatizado agresivo." Clients must acknowledge before using.
