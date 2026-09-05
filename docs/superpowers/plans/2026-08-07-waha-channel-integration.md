# WAHA Channel Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-hosted WAHA (WhatsApp HTTP API) service as a new "beta" channel in community-manager, enabling QR-based connection of any WhatsApp number and full API access for inbound/outbound messaging, following the same integration pattern used for `respond_io`.

**Architecture:** Deploy WAHA (NestJS, from `F:\Proyectos\WAHA`) as a Docker container on the existing `server` VPS (same box as `supabase-smartmedia`), exposed at `https://waha.smartgenapp.com` behind the existing Caddy/Nginx reverse proxy. In community-manager, add `waha` as a new `channel_type`, store one session per brand (`session_name = brand_<brand_id>`), and proxy QR/status/send calls from Next.js API routes. Inbound WAHA webhooks (HMAC-SHA512 signed) land in the existing `smarttalk.webhook_events` queue and are drained by the current `/api/inbox/process-webhook-events` cron (extended with a `waha` handler). Outbound sends dispatch to WAHA `POST /api/sendText`. A watchdog cron detects `STOPPED`/`FAILED` sessions and marks the channel `disconnected`.

**Tech Stack:** WAHA (NestJS, Docker) · Next.js 15 App Router · Supabase (self-hosted on `server`) · Postgres (schema `smarttalk`) · vitest 4 · Node crypto (HMAC-SHA512) · TanStack Query (already in `useChannels`) · Vercel Cron.

**Decisions locked in (2026-08-07):**
- Host: VPS `server` (Hostinger, shared with `supabase-smartmedia`)
- Domain: `waha.smartgenapp.com`
- Multi-tenant: 1 sesión por brand en la misma instancia WAHA
- Positioning: canal beta, riesgo de baneo del número debe estar visible en la UI
- Pattern: clonar `respond_io` (proveedor externo con API HTTP + webhook HMAC)

**Branch:** create `feat/waha-channel` off current `codex/billing-subscriptions`.

---

## File Structure

### Files created

| Path | Responsibility |
|---|---|
| `web/supabase/migrations/20260807000000_020_waha_channel.sql` | Add `waha` to `channel_type`, create `smarttalk.waha_sessions` |
| `web/src/lib/waha/client.ts` | Typed HTTP client for WAHA REST API |
| `web/src/lib/waha/client.test.ts` | Unit tests for client (mocked fetch) |
| `web/src/lib/waha/signature.ts` | HMAC-SHA512 verification for WAHA webhooks |
| `web/src/lib/waha/signature.test.ts` | Unit tests for signature helper |
| `web/src/lib/waha/session-name.ts` | Deterministic session name from brand id |
| `web/src/lib/waha/session-name.test.ts` | Unit tests for name derivation |
| `web/src/lib/waha/types.ts` | Shared WAHA event/status/config types |
| `web/src/app/api/channels/waha/route.ts` | POST — create channel + start session |
| `web/src/app/api/channels/waha/route.test.ts` | Integration test for POST (mocked WAHA + admin client) |
| `web/src/app/api/channels/waha/[channelId]/qr/route.ts` | GET — proxy QR image from WAHA |
| `web/src/app/api/channels/waha/[channelId]/status/route.ts` | GET — session status (polled by UI) |
| `web/src/app/api/channels/waha/[channelId]/route.ts` | DELETE — logout + remove session |
| `web/src/app/api/webhook/waha/route.ts` | POST — signed webhook receiver, enqueues in `webhook_events` |
| `web/src/app/api/webhook/waha/route.test.ts` | Integration test — good sig / bad sig / duplicate |
| `web/src/lib/waha/webhook-handler.ts` | Interprets `webhook_events` rows for `channel='waha'` |
| `web/src/lib/waha/webhook-handler.test.ts` | Test that message events insert inbox conversation + message |
| `web/src/lib/waha/sender.ts` | Outbound send for `waha` channel |
| `web/src/lib/waha/sender.test.ts` | Test sender maps channel row → WAHA call |
| `web/src/components/channels/WahaConnect.tsx` | UI: QR modal + status polling + beta warning |
| `web/src/app/api/cron/waha-watchdog/route.ts` | Cron: mark stopped sessions as `disconnected` |
| `web/src/app/api/cron/waha-watchdog/route.test.ts` | Test watchdog reconciliation |
| `web/docs/WAHA_CHANNEL_RUNBOOK.md` | Operator runbook (deploy WAHA, rotate keys, recover sessions) |
| `infra/waha/docker-compose.yml` | Compose file to run on `server` |
| `infra/waha/Caddyfile.snippet` | Reverse proxy snippet for `waha.smartgenapp.com` |
| `infra/waha/.env.example` | Env template for WAHA service |

### Files modified

| Path | Change |
|---|---|
| `web/src/app/api/inbox/process-webhook-events/route.ts` | Route `channel='waha'` rows through `webhook-handler.ts` |
| `web/src/components/channels/AddChannelDialog.tsx` | Add "WhatsApp (WAHA — Beta)" provider option |
| `web/src/lib/inbox/send-message.ts` (or the current outbound dispatcher) | Dispatch `waha` channel via `waha/sender.ts` |
| `web/vercel.json` | Add cron `/api/cron/waha-watchdog` every 5 min |
| `web/.env.example` | Add `WAHA_BASE_URL`, `WAHA_API_KEY`, `WAHA_WEBHOOK_HMAC_SECRET` |
| `web/src/types/database.ts` (or generated) | Include `waha` in Channel type union + `waha_sessions` table |

**Session naming convention:** `brand_<brand_id_no_dashes>` (WAHA session names must be `[a-zA-Z0-9_-]{1,64}`). Deterministic → idempotent restart, safe to re-run after a container replace.

---

## Task 1: Infrastructure — Deploy WAHA on `server` VPS

**Files:**
- Create: `infra/waha/docker-compose.yml`
- Create: `infra/waha/.env.example`
- Create: `infra/waha/Caddyfile.snippet`
- (On `server`) Create: `/opt/waha/docker-compose.yml`, `/opt/waha/.env`, volume dirs

- [ ] **Step 1.1: Write `infra/waha/docker-compose.yml`**

```yaml
services:
  waha:
    image: devlikeapro/waha:latest
    container_name: waha
    restart: unless-stopped
    ports:
      - "127.0.0.1:3010:3000"   # bind to localhost only; Caddy exposes 443
    environment:
      WAHA_API_KEY: ${WAHA_API_KEY}
      WAHA_DASHBOARD_ENABLED: "true"
      WAHA_DASHBOARD_USERNAME: ${WAHA_DASHBOARD_USERNAME}
      WAHA_DASHBOARD_PASSWORD: ${WAHA_DASHBOARD_PASSWORD}
      WHATSAPP_DEFAULT_ENGINE: NOWEB
      WHATSAPP_RESTART_ALL_SESSIONS: "true"
      WAHA_LOG_LEVEL: info
      WAHA_LOG_FORMAT: JSON
      TZ: America/Bogota
    volumes:
      - ./data/sessions:/app/.sessions
      - ./data/files:/app/.files
      - ./data/media:/app/.media
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/ping"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 1.2: Write `infra/waha/.env.example`**

```env
# Static API key used by community-manager to talk to WAHA
# Generate: openssl rand -hex 32
WAHA_API_KEY=

# Basic auth for /dashboard (WAHA admin UI)
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=

# Shared with community-manager Vercel env (WAHA_WEBHOOK_HMAC_SECRET)
# Generate: openssl rand -hex 32
# WAHA reads this per-session via the config payload sent when creating a session.
```

- [ ] **Step 1.3: Write `infra/waha/Caddyfile.snippet`**

```caddy
waha.smartgenapp.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3010 {
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
  }
  # Protect the admin dashboard extra: WAHA has its own Basic Auth via env vars.
}
```

- [ ] **Step 1.4: Commit infra files**

```bash
git add infra/waha
git commit -m "infra(waha): docker-compose, caddy snippet, env template"
```

- [ ] **Step 1.5: Deploy on `server` (out-of-band — run these on the VPS shell)**

```bash
ssh server
sudo mkdir -p /opt/waha/data/{sessions,files,media}
sudo chown -R $USER:$USER /opt/waha
cd /opt/waha
# Copy docker-compose.yml from repo (or git clone the platform repo and symlink)
cp ~/community-manager-platform/infra/waha/docker-compose.yml .
cp ~/community-manager-platform/infra/waha/.env.example .env
openssl rand -hex 32   # → WAHA_API_KEY
openssl rand -hex 32   # → WAHA_WEBHOOK_HMAC_SECRET (paste into Vercel later)
# Edit .env with those two values + choose dashboard password
docker compose pull
docker compose up -d
docker compose logs -f waha   # verify boot
```

- [ ] **Step 1.6: Add Caddy site and reload (on `server`)**

```bash
sudo cp ~/community-manager-platform/infra/waha/Caddyfile.snippet /etc/caddy/sites-available/waha.smartgenapp.com
sudo ln -sf /etc/caddy/sites-available/waha.smartgenapp.com /etc/caddy/sites-enabled/
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

- [ ] **Step 1.7: Add DNS `A` record**

In Hostinger DNS → `smartgenapp.com` zone → add `A` record: `waha` → IP of `server` (same IP as `smartmedia-api.smartgenapp.com`). TTL 300.

- [ ] **Step 1.8: Smoke test WAHA is reachable and auth works**

Run locally (Windows shell):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://waha.smartgenapp.com/ping
# Expected: 200

curl -sS https://waha.smartgenapp.com/api/sessions
# Expected: 401 { "statusCode": 401, "message": "Unauthorized" }

curl -sS -H "X-Api-Key: $WAHA_API_KEY" https://waha.smartgenapp.com/api/sessions
# Expected: 200 [] (empty list)
```

- [ ] **Step 1.9: Commit runbook**

```bash
git add web/docs/WAHA_CHANNEL_RUNBOOK.md   # created in Task 19
```

(Skip commit here — runbook is Task 19; just mark infra done.)

---

## Task 2: Environment configuration

**Files:**
- Modify: `web/.env.example`

- [ ] **Step 2.1: Append WAHA vars to `web/.env.example`**

Add at the end (after the `RESPOND_IO_API_BASE=...` block):

```env
# WAHA (self-hosted WhatsApp HTTP API — canal beta)
# Base URL of the WAHA server (Caddy-proxied HTTPS endpoint)
WAHA_BASE_URL=https://waha.smartgenapp.com
# Static API key that WAHA validates against X-Api-Key header (see infra/waha/.env)
WAHA_API_KEY=
# Shared HMAC secret used by WAHA to sign outgoing webhooks (X-Webhook-Hmac header, SHA-512 hex)
WAHA_WEBHOOK_HMAC_SECRET=
```

- [ ] **Step 2.2: Set the three vars in Vercel Production**

Run from `web/`:

```bash
vercel env add WAHA_BASE_URL production
# paste: https://waha.smartgenapp.com

vercel env add WAHA_API_KEY production
# paste: <same value as /opt/waha/.env on server>

vercel env add WAHA_WEBHOOK_HMAC_SECRET production
# paste: <random 32-byte hex you generated>
```

Verify:

```bash
vercel env ls production | grep WAHA_
# Expected: 3 rows, all Encrypted, all Production
```

- [ ] **Step 2.3: Commit env template**

```bash
git add web/.env.example
git commit -m "chore(env): add WAHA_* variables to example"
```

---

## Task 3: Database migration — Add `waha` type + `waha_sessions` table

**Files:**
- Create: `web/supabase/migrations/20260807000000_020_waha_channel.sql`

- [ ] **Step 3.1: Write the migration**

```sql
-- 020_waha_channel.sql
-- Add WAHA (self-hosted WhatsApp HTTP API) as a channel provider.
-- Credentials live in channels.config (JSONB):
--   { sessionName, hmacSecretHint }
-- The shared WAHA_API_KEY is server-side only (env var, not per-channel).

SET search_path TO smarttalk, public, auth, extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'channel_type' AND e.enumlabel = 'waha'
  ) THEN
    ALTER TYPE channel_type ADD VALUE 'waha';
  END IF;
END$$;

-- Per-session runtime state. One row per WAHA session (~ one row per WhatsApp number).
CREATE TABLE IF NOT EXISTS smarttalk.waha_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL UNIQUE REFERENCES smarttalk.channels(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'STARTING',
  phone_number TEXT,
  push_name TEXT,
  last_qr_at TIMESTAMPTZ,
  last_status_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waha_sessions_status
  ON smarttalk.waha_sessions(status)
  WHERE status IN ('STARTING', 'SCAN_QR_CODE', 'FAILED', 'STOPPED');

CREATE INDEX IF NOT EXISTS idx_waha_sessions_channel
  ON smarttalk.waha_sessions(channel_id);

ALTER TABLE smarttalk.waha_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='smarttalk' AND tablename='waha_sessions' AND policyname='waha_sessions_service_only'
  ) THEN
    CREATE POLICY "waha_sessions_service_only"
      ON smarttalk.waha_sessions FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END$$;

COMMENT ON TABLE smarttalk.waha_sessions IS
  'Runtime state of self-hosted WAHA WhatsApp sessions. session_name = brand_<brand_id_no_dashes>. Beta channel (Sprint 27).';

COMMENT ON COLUMN smarttalk.waha_sessions.status IS
  'Mirrors WAHA session status: STARTING | SCAN_QR_CODE | WORKING | FAILED | STOPPED';
```

- [ ] **Step 3.2: Apply the migration to self-hosted Supabase**

Options (pick one; runbook Task 19 documents both):

**A) via psql from the `server` VPS:**
```bash
ssh server
docker exec -i supabase-smartmedia-db psql -U postgres -d postgres \
  < ~/community-manager-platform/web/supabase/migrations/20260807000000_020_waha_channel.sql
```

**B) via Studio SQL Editor:** open `https://smartmedia-studio.smartgenapp.com`, paste migration, run.

- [ ] **Step 3.3: Verify migration applied**

```bash
docker exec -i supabase-smartmedia-db psql -U postgres -d postgres -c \
  "SELECT unnest(enum_range(NULL::smarttalk.channel_type)) AS t;" | grep -w waha
# Expected: waha

docker exec -i supabase-smartmedia-db psql -U postgres -d postgres -c \
  "SELECT to_regclass('smarttalk.waha_sessions');"
# Expected: smarttalk.waha_sessions
```

- [ ] **Step 3.4: Commit**

```bash
git add web/supabase/migrations/20260807000000_020_waha_channel.sql
git commit -m "feat(db): add waha channel type + waha_sessions table"
```

---

## Task 4: WAHA HTTP client library

**Files:**
- Create: `web/src/lib/waha/types.ts`
- Create: `web/src/lib/waha/client.ts`
- Test: `web/src/lib/waha/client.test.ts`

- [ ] **Step 4.1: Write `types.ts`**

```typescript
// web/src/lib/waha/types.ts
export type WahaSessionStatus =
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"
  | "STOPPED";

export interface WahaSession {
  name: string;
  status: WahaSessionStatus;
  me?: { id: string; pushname?: string };
  engine?: { engine: string; state?: string };
}

export interface WahaCreateSessionInput {
  name: string;
  webhookUrl: string;
  webhookHmacSecret: string;
  events?: string[];
}

export interface WahaMessageEvent {
  id: string;
  timestamp: number;
  event: "message" | "message.any" | "message.ack" | "session.status" | string;
  session: string;
  me?: { id: string; pushname?: string };
  payload: Record<string, unknown>;
}
```

- [ ] **Step 4.2: Write failing test `client.test.ts`**

```typescript
// web/src/lib/waha/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WahaClient, WahaError } from "./client";

describe("WahaClient", () => {
  const baseUrl = "https://waha.example.com";
  const apiKey = "test-key";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends X-Api-Key on every request", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } })
    );
    const client = new WahaClient({ baseUrl, apiKey });
    await client.listSessions();
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/sessions`,
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Api-Key": apiKey }),
      })
    );
  });

  it("createSession posts webhook config", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "brand_abc", status: "STARTING" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new WahaClient({ baseUrl, apiKey });
    const out = await client.createSession({
      name: "brand_abc",
      webhookUrl: "https://cm.test/api/webhook/waha",
      webhookHmacSecret: "secret",
    });
    expect(out.name).toBe("brand_abc");
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      name: "brand_abc",
      start: true,
      config: {
        webhooks: [
          expect.objectContaining({
            url: "https://cm.test/api/webhook/waha",
            events: expect.arrayContaining(["message"]),
            hmac: { key: "secret" },
          }),
        ],
      },
    });
  });

  it("throws WahaError with status on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 500, headers: { "content-type": "text/plain" } })
    );
    const client = new WahaClient({ baseUrl, apiKey });
    await expect(client.getSession("brand_x")).rejects.toBeInstanceOf(WahaError);
  });

  it("getQr returns image data", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ mimetype: "image/png", data: "iVBOR..." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new WahaClient({ baseUrl, apiKey });
    const qr = await client.getQr("brand_abc");
    expect(qr.mimetype).toBe("image/png");
    expect(qr.data.length).toBeGreaterThan(0);
  });

  it("sendText posts to /api/sendText", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "true_573001112233@c.us_XYZ" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new WahaClient({ baseUrl, apiKey });
    const r = await client.sendText({ session: "brand_abc", chatId: "573001112233@c.us", text: "hola" });
    expect(r.id).toContain("@c.us_");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${baseUrl}/api/sendText`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      session: "brand_abc",
      chatId: "573001112233@c.us",
      text: "hola",
    });
  });
});
```

- [ ] **Step 4.3: Run tests — expect failure**

```bash
cd web && npx vitest run src/lib/waha/client.test.ts
# Expected: FAIL — Cannot find module './client'
```

- [ ] **Step 4.4: Implement `client.ts`**

```typescript
// web/src/lib/waha/client.ts
import type {
  WahaCreateSessionInput,
  WahaSession,
} from "./types";

export interface WahaClientConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class WahaError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
    this.name = "WahaError";
  }
}

const DEFAULT_EVENTS = ["message", "message.any", "message.ack", "session.status"];

export class WahaClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly config: WahaClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.config.apiKey,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new WahaError(res.status, `WAHA ${path} → ${res.status}`, body);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  listSessions(): Promise<WahaSession[]> {
    return this.request<WahaSession[]>("/api/sessions");
  }

  getSession(name: string): Promise<WahaSession> {
    return this.request<WahaSession>(`/api/sessions/${encodeURIComponent(name)}`);
  }

  createSession(input: WahaCreateSessionInput): Promise<WahaSession> {
    return this.request<WahaSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        start: true,
        config: {
          webhooks: [
            {
              url: input.webhookUrl,
              events: input.events ?? DEFAULT_EVENTS,
              hmac: { key: input.webhookHmacSecret },
            },
          ],
        },
      }),
    });
  }

  logout(name: string): Promise<{ result: boolean }> {
    return this.request(`/api/sessions/${encodeURIComponent(name)}/logout`, { method: "POST" });
  }

  deleteSession(name: string): Promise<{ result: boolean }> {
    return this.request(`/api/sessions/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  getQr(name: string): Promise<{ mimetype: string; data: string }> {
    return this.request(`/api/${encodeURIComponent(name)}/auth/qr?format=image`);
  }

  sendText(input: { session: string; chatId: string; text: string }): Promise<{ id: string }> {
    return this.request("/api/sendText", { method: "POST", body: JSON.stringify(input) });
  }
}

export function wahaFromEnv(): WahaClient {
  const baseUrl = process.env.WAHA_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("WAHA_BASE_URL and WAHA_API_KEY must be set");
  }
  return new WahaClient({ baseUrl, apiKey });
}
```

- [ ] **Step 4.5: Run tests — expect pass**

```bash
cd web && npx vitest run src/lib/waha/client.test.ts
# Expected: PASS (5 tests)
```

- [ ] **Step 4.6: Commit**

```bash
git add web/src/lib/waha/types.ts web/src/lib/waha/client.ts web/src/lib/waha/client.test.ts
git commit -m "feat(waha): typed HTTP client + tests"
```

---

## Task 5: WAHA webhook signature validation

**Files:**
- Create: `web/src/lib/waha/signature.ts`
- Test: `web/src/lib/waha/signature.test.ts`

- [ ] **Step 5.1: Write failing test `signature.test.ts`**

```typescript
// web/src/lib/waha/signature.test.ts
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWahaSignature } from "./signature";

const secret = "super-secret-hmac-key";
const body = JSON.stringify({ event: "message", session: "brand_x" });
const validHex = crypto.createHmac("sha512", secret).update(body).digest("hex");

describe("verifyWahaSignature", () => {
  it("accepts a valid SHA-512 HMAC hex signature", () => {
    expect(verifyWahaSignature(body, secret, validHex)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    expect(verifyWahaSignature(body, secret, "0".repeat(128))).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWahaSignature(body, secret, null)).toBe(false);
    expect(verifyWahaSignature(body, secret, "")).toBe(false);
  });

  it("rejects if the body was tampered with", () => {
    const tampered = body.replace("brand_x", "brand_y");
    expect(verifyWahaSignature(tampered, secret, validHex)).toBe(false);
  });

  it("rejects if lengths differ (constant-time safe)", () => {
    expect(verifyWahaSignature(body, secret, "abcd")).toBe(false);
  });
});
```

- [ ] **Step 5.2: Run test — expect failure**

```bash
cd web && npx vitest run src/lib/waha/signature.test.ts
# Expected: FAIL — Cannot find module './signature'
```

- [ ] **Step 5.3: Implement `signature.ts`**

```typescript
// web/src/lib/waha/signature.ts
import crypto from "node:crypto";

export function verifyWahaSignature(
  rawBody: string,
  secret: string,
  signature: string | null | undefined
): boolean {
  if (!signature) return false;
  const provided = signature.trim();
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  if (expected.length !== provided.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}
```

- [ ] **Step 5.4: Run test — expect pass**

```bash
cd web && npx vitest run src/lib/waha/signature.test.ts
# Expected: PASS (5 tests)
```

- [ ] **Step 5.5: Commit**

```bash
git add web/src/lib/waha/signature.ts web/src/lib/waha/signature.test.ts
git commit -m "feat(waha): HMAC-SHA512 webhook signature verification"
```

---

## Task 6: Session name helper

**Files:**
- Create: `web/src/lib/waha/session-name.ts`
- Test: `web/src/lib/waha/session-name.test.ts`

- [ ] **Step 6.1: Write failing test**

```typescript
// web/src/lib/waha/session-name.test.ts
import { describe, it, expect } from "vitest";
import { sessionNameForBrand, isValidWahaSessionName } from "./session-name";

describe("sessionNameForBrand", () => {
  it("prefixes with brand_ and strips dashes", () => {
    expect(sessionNameForBrand("11111111-2222-3333-4444-555555555555")).toBe(
      "brand_11111111222233334444555555555555"
    );
  });

  it("throws on empty id", () => {
    expect(() => sessionNameForBrand("")).toThrow(/brand id/);
  });

  it("throws on non-uuid input", () => {
    expect(() => sessionNameForBrand("not-a-uuid")).toThrow(/uuid/i);
  });
});

describe("isValidWahaSessionName", () => {
  it("accepts our brand_ names", () => {
    expect(isValidWahaSessionName("brand_11111111222233334444555555555555")).toBe(true);
  });
  it("rejects names with disallowed chars", () => {
    expect(isValidWahaSessionName("brand_x!")).toBe(false);
    expect(isValidWahaSessionName("")).toBe(false);
    expect(isValidWahaSessionName("a".repeat(65))).toBe(false);
  });
});
```

- [ ] **Step 6.2: Run test — expect failure**

```bash
cd web && npx vitest run src/lib/waha/session-name.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 6.3: Implement**

```typescript
// web/src/lib/waha/session-name.ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WAHA_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function sessionNameForBrand(brandId: string): string {
  if (!brandId) throw new Error("brand id required");
  if (!UUID_RE.test(brandId)) throw new Error("brand id must be a uuid");
  return `brand_${brandId.replace(/-/g, "")}`;
}

export function isValidWahaSessionName(name: string): boolean {
  return WAHA_NAME_RE.test(name);
}
```

- [ ] **Step 6.4: Run test — expect pass**

```bash
cd web && npx vitest run src/lib/waha/session-name.test.ts
# Expected: PASS (5 tests)
```

- [ ] **Step 6.5: Commit**

```bash
git add web/src/lib/waha/session-name.ts web/src/lib/waha/session-name.test.ts
git commit -m "feat(waha): brand-scoped session name helper"
```

---

## Task 7: API — POST /api/channels/waha (create channel + start session)

**Files:**
- Create: `web/src/app/api/channels/waha/route.ts`
- Test: `web/src/app/api/channels/waha/route.test.ts`

**Contract:**
- Auth: user must be signed in AND have `brand_admin` role for the target brand.
- Body: `{ brandId: string, displayName?: string }`
- Behavior:
  1. Compute `sessionName = brand_<brand_id_no_dashes>`
  2. `INSERT INTO smarttalk.channels (organization_id, type='waha', name, status='pending', config={sessionName, webhookHmacSecretHint:'env:WAHA_WEBHOOK_HMAC_SECRET'})` → get `channelId`
  3. `INSERT INTO smarttalk.waha_sessions (channel_id, session_name, status='STARTING')` (upsert on session_name if the brand already had one — reuse)
  4. Call `waha.createSession({ name: sessionName, webhookUrl: <public /api/webhook/waha>, webhookHmacSecret: env.WAHA_WEBHOOK_HMAC_SECRET })`
  5. Return `{ channelId, sessionName, status }`
- On any WAHA error: mark channel `status='error'`, waha_sessions `last_error=<msg>`, return 502.

- [ ] **Step 7.1: Write failing test**

```typescript
// web/src/app/api/channels/waha/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/supabase/route-handler", () => ({
  createRouteHandlerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/waha/client", () => ({
  wahaFromEnv: vi.fn(),
}));
vi.mock("@/lib/auth/require-brand-admin", () => ({
  requireBrandAdmin: vi.fn(),
}));

const { createAdminClient } = await import("@/lib/supabase/admin");
const { wahaFromEnv } = await import("@/lib/waha/client");
const { requireBrandAdmin } = await import("@/lib/auth/require-brand-admin");

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/channels/waha", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/channels/waha", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.WAHA_BASE_URL = "https://waha.test";
    process.env.WAHA_API_KEY = "k";
    process.env.WAHA_WEBHOOK_HMAC_SECRET = "hmac";
  });

  it("400 on missing brandId", async () => {
    (requireBrandAdmin as any).mockResolvedValue({
      user: { id: "u1" }, organizationId: "org1",
    });
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates channel + waha_session + calls WAHA and returns 201", async () => {
    const brandId = "11111111-2222-3333-4444-555555555555";
    (requireBrandAdmin as any).mockResolvedValue({
      user: { id: "u1" }, organizationId: "org1",
    });
    const insertChannel = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "ch1" }, error: null }) }),
    });
    const upsertSession = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { session_name: `brand_${brandId.replace(/-/g,"")}` }, error: null }) }),
    });
    const updateChannel = vi.fn().mockResolvedValue({ error: null });
    (createAdminClient as any).mockReturnValue({
      schema: () => ({
        from: (table: string) => {
          if (table === "channels") return { insert: insertChannel, update: () => ({ eq: updateChannel }) };
          if (table === "waha_sessions") return { upsert: upsertSession };
          throw new Error("unexpected table " + table);
        },
      }),
    });
    const createSession = vi.fn().mockResolvedValue({ name: `brand_${brandId.replace(/-/g,"")}`, status: "STARTING" });
    (wahaFromEnv as any).mockReturnValue({ createSession });
    const res = await POST(jsonRequest({ brandId, displayName: "WhatsApp Beta" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.channelId).toBe("ch1");
    expect(body.sessionName).toBe(`brand_${brandId.replace(/-/g,"")}`);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        name: `brand_${brandId.replace(/-/g,"")}`,
        webhookHmacSecret: "hmac",
      })
    );
  });

  it("502 when WAHA is unreachable, marks channel error", async () => {
    (requireBrandAdmin as any).mockResolvedValue({ user: { id: "u1" }, organizationId: "org1" });
    const insertChannel = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "ch1" }, error: null }) }),
    });
    const upsertSession = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { session_name: "brand_x" }, error: null }) }),
    });
    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    (createAdminClient as any).mockReturnValue({
      schema: () => ({
        from: (table: string) => {
          if (table === "channels") return { insert: insertChannel, update: () => ({ eq: eqUpdate }) };
          if (table === "waha_sessions") return { upsert: upsertSession, update: () => ({ eq: eqUpdate }) };
          throw new Error("unexpected table " + table);
        },
      }),
    });
    (wahaFromEnv as any).mockReturnValue({
      createSession: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const res = await POST(jsonRequest({ brandId: "11111111-2222-3333-4444-555555555555" }));
    expect(res.status).toBe(502);
    expect(eqUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7.2: Run test — expect failure (route not implemented)**

```bash
cd web && npx vitest run src/app/api/channels/waha/route.test.ts
# Expected: FAIL — Cannot find module './route'
```

- [ ] **Step 7.3: Implement the route**

```typescript
// web/src/app/api/channels/waha/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAdmin } from "@/lib/auth/require-brand-admin";
import { wahaFromEnv, WahaError } from "@/lib/waha/client";
import { sessionNameForBrand } from "@/lib/waha/session-name";

export const dynamic = "force-dynamic";

function publicWebhookUrl() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "https://www.comunitymanager.io";
  const withScheme = base.startsWith("http") ? base : `https://${base}`;
  return `${withScheme}/api/webhook/waha`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.brandId !== "string" || !body.brandId) {
    return NextResponse.json({ error: "brandId required" }, { status: 400 });
  }

  const auth = await requireBrandAdmin(request, body.brandId).catch(() => null);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let sessionName: string;
  try {
    sessionName = sessionNameForBrand(body.brandId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const hmac = process.env.WAHA_WEBHOOK_HMAC_SECRET;
  if (!hmac) return NextResponse.json({ error: "server missing WAHA_WEBHOOK_HMAC_SECRET" }, { status: 500 });

  const admin = createAdminClient();
  const displayName = typeof body.displayName === "string" && body.displayName.trim()
    ? body.displayName.trim()
    : "WhatsApp (WAHA · beta)";

  const { data: channelRow, error: chErr } = await admin
    .schema("smarttalk")
    .from("channels")
    .insert({
      organization_id: auth.organizationId,
      type: "waha",
      name: displayName,
      status: "pending",
      config: { sessionName, brandId: body.brandId, hmacSecretHint: "env:WAHA_WEBHOOK_HMAC_SECRET" },
    })
    .select()
    .single();
  if (chErr || !channelRow) {
    return NextResponse.json({ error: chErr?.message ?? "failed to insert channel" }, { status: 500 });
  }

  const { data: sessRow, error: sessErr } = await admin
    .schema("smarttalk")
    .from("waha_sessions")
    .upsert(
      { channel_id: channelRow.id, session_name: sessionName, status: "STARTING" },
      { onConflict: "session_name" }
    )
    .select()
    .single();
  if (sessErr || !sessRow) {
    return NextResponse.json({ error: sessErr?.message ?? "failed to upsert session" }, { status: 500 });
  }

  const waha = wahaFromEnv();
  try {
    await waha.createSession({
      name: sessionName,
      webhookUrl: publicWebhookUrl(),
      webhookHmacSecret: hmac,
    });
  } catch (e) {
    const msg = e instanceof WahaError ? `${e.message} ${e.body ?? ""}`.trim() : (e as Error).message;
    await admin.schema("smarttalk").from("channels").update({ status: "error" }).eq("id", channelRow.id);
    await admin
      .schema("smarttalk")
      .from("waha_sessions")
      .update({ status: "FAILED", last_error: msg, last_status_at: new Date().toISOString() })
      .eq("channel_id", channelRow.id);
    return NextResponse.json({ error: `WAHA rejected create: ${msg}` }, { status: 502 });
  }

  return NextResponse.json(
    { channelId: channelRow.id, sessionName, status: "STARTING" },
    { status: 201 }
  );
}
```

- [ ] **Step 7.4: Run test — expect pass**

```bash
cd web && npx vitest run src/app/api/channels/waha/route.test.ts
# Expected: PASS (3 tests)
```

- [ ] **Step 7.5: Commit**

```bash
git add web/src/app/api/channels/waha/route.ts web/src/app/api/channels/waha/route.test.ts
git commit -m "feat(api): POST /api/channels/waha creates channel + starts session"
```

---

## Task 8: API — GET /api/channels/waha/[channelId]/qr

**Files:**
- Create: `web/src/app/api/channels/waha/[channelId]/qr/route.ts`

**Contract:**
- Auth: brand-admin over the brand that owns `channelId`
- Behavior: look up `session_name` for `channelId`, call `waha.getQr(sessionName)`, return image bytes or 404 if session is `WORKING` (no QR needed).

- [ ] **Step 8.1: Implement the QR proxy**

```typescript
// web/src/app/api/channels/waha/[channelId]/qr/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAdminForChannel } from "@/lib/auth/require-brand-admin";
import { wahaFromEnv } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { channelId: string } }) {
  const auth = await requireBrandAdminForChannel(request, params.channelId).catch(() => null);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sess, error } = await admin
    .schema("smarttalk")
    .from("waha_sessions")
    .select("session_name, status")
    .eq("channel_id", params.channelId)
    .single();
  if (error || !sess) return NextResponse.json({ error: "channel not found" }, { status: 404 });
  if (sess.status === "WORKING") return NextResponse.json({ error: "session already connected" }, { status: 409 });

  const qr = await wahaFromEnv().getQr(sess.session_name);
  const buf = Buffer.from(qr.data, "base64");
  await admin
    .schema("smarttalk")
    .from("waha_sessions")
    .update({ last_qr_at: new Date().toISOString() })
    .eq("channel_id", params.channelId);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": qr.mimetype,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
```

- [ ] **Step 8.2: Manual smoke via curl (after Task 20 deploy)**

```bash
curl -sS -o /tmp/qr.png -w '%{http_code}\n' \
  -H "Cookie: <session-cookie>" \
  https://www.comunitymanager.io/api/channels/waha/<channelId>/qr
# Expected: 200 and /tmp/qr.png ~5 KB
```

- [ ] **Step 8.3: Commit**

```bash
git add web/src/app/api/channels/waha/\[channelId\]/qr/route.ts
git commit -m "feat(api): GET /api/channels/waha/[id]/qr proxies WAHA QR image"
```

---

## Task 9: API — GET /api/channels/waha/[channelId]/status

**Files:**
- Create: `web/src/app/api/channels/waha/[channelId]/status/route.ts`

- [ ] **Step 9.1: Implement**

```typescript
// web/src/app/api/channels/waha/[channelId]/status/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAdminForChannel } from "@/lib/auth/require-brand-admin";
import { wahaFromEnv } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { channelId: string } }) {
  const auth = await requireBrandAdminForChannel(request, params.channelId).catch(() => null);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sess } = await admin
    .schema("smarttalk")
    .from("waha_sessions")
    .select("session_name, status, phone_number, push_name, last_status_at, last_error")
    .eq("channel_id", params.channelId)
    .single();
  if (!sess) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Refresh from WAHA (fire-and-forget error is acceptable — DB has last known)
  try {
    const live = await wahaFromEnv().getSession(sess.session_name);
    const update: Record<string, unknown> = {
      status: live.status,
      last_status_at: new Date().toISOString(),
    };
    if (live.me?.id) update.phone_number = live.me.id.split("@")[0];
    if (live.me?.pushname) update.push_name = live.me.pushname;
    await admin.schema("smarttalk").from("waha_sessions").update(update).eq("channel_id", params.channelId);
    if (live.status === "WORKING") {
      await admin.schema("smarttalk").from("channels").update({ status: "active", connected_at: new Date().toISOString() }).eq("id", params.channelId);
    }
    return NextResponse.json({ ...sess, ...update });
  } catch {
    return NextResponse.json(sess);
  }
}
```

- [ ] **Step 9.2: Commit**

```bash
git add web/src/app/api/channels/waha/\[channelId\]/status/route.ts
git commit -m "feat(api): GET /api/channels/waha/[id]/status polls WAHA + syncs DB"
```

---

## Task 10: API — DELETE /api/channels/waha/[channelId]

**Files:**
- Create: `web/src/app/api/channels/waha/[channelId]/route.ts`

- [ ] **Step 10.1: Implement**

```typescript
// web/src/app/api/channels/waha/[channelId]/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBrandAdminForChannel } from "@/lib/auth/require-brand-admin";
import { wahaFromEnv } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: { channelId: string } }) {
  const auth = await requireBrandAdminForChannel(request, params.channelId).catch(() => null);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sess } = await admin
    .schema("smarttalk")
    .from("waha_sessions")
    .select("session_name")
    .eq("channel_id", params.channelId)
    .single();
  if (sess?.session_name) {
    const waha = wahaFromEnv();
    try { await waha.logout(sess.session_name); } catch { /* best-effort */ }
    try { await waha.deleteSession(sess.session_name); } catch { /* best-effort */ }
  }
  await admin.schema("smarttalk").from("waha_sessions").delete().eq("channel_id", params.channelId);
  await admin.schema("smarttalk").from("channels").update({ status: "disconnected" }).eq("id", params.channelId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 10.2: Commit**

```bash
git add web/src/app/api/channels/waha/\[channelId\]/route.ts
git commit -m "feat(api): DELETE /api/channels/waha/[id] logs out + removes session"
```

---

## Task 11: Webhook receiver — POST /api/webhook/waha

**Files:**
- Create: `web/src/app/api/webhook/waha/route.ts`
- Test: `web/src/app/api/webhook/waha/route.test.ts`

**Contract:**
- Verify `X-Webhook-Hmac` header against `WAHA_WEBHOOK_HMAC_SECRET`
- Rate limit 200/min per IP (same as respond_io)
- Enqueue `{ channel: 'waha', payload }` into `smarttalk.webhook_events`
- Respond 200 within 500 ms — worker does the heavy lifting

- [ ] **Step 11.1: Write failing test**

```typescript
// web/src/app/api/webhook/waha/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  rateLimitWithWhitelist: vi.fn().mockResolvedValue({ ok: true }),
}));

const { createAdminClient } = await import("@/lib/supabase/admin");
const { POST } = await import("./route");

function makeReq(body: string, sig?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (sig !== undefined) headers.set("x-webhook-hmac", sig);
  return new Request("http://localhost/api/webhook/waha", { method: "POST", body, headers });
}

describe("POST /api/webhook/waha", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.WAHA_WEBHOOK_HMAC_SECRET = "shhh";
  });

  it("401 without signature", async () => {
    const res = await POST(makeReq(JSON.stringify({ x: 1 })));
    expect(res.status).toBe(401);
  });

  it("401 with wrong signature", async () => {
    const res = await POST(makeReq(JSON.stringify({ x: 1 }), "0".repeat(128)));
    expect(res.status).toBe(401);
  });

  it("200 with good signature, enqueues event", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    (createAdminClient as any).mockReturnValue({
      schema: () => ({ from: () => ({ insert }) }),
    });
    const body = JSON.stringify({ event: "message", session: "brand_abc", payload: { body: "hi" } });
    const sig = crypto.createHmac("sha512", "shhh").update(body).digest("hex");
    const res = await POST(makeReq(body, sig));
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "waha", status: "pending" })
    );
  });
});
```

- [ ] **Step 11.2: Run test — expect failure**

```bash
cd web && npx vitest run src/app/api/webhook/waha/route.test.ts
# Expected: FAIL — Cannot find module './route'
```

- [ ] **Step 11.3: Implement**

```typescript
// web/src/app/api/webhook/waha/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimitWithWhitelist } from "@/lib/rate-limit";
import { verifyWahaSignature } from "@/lib/waha/signature";

export const dynamic = "force-dynamic";

const RL = 200;
const RL_WINDOW = 60_000;

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const rl = await rateLimitWithWhitelist(ip, `webhook-waha:${ip}`, RL, RL_WINDOW);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } }
    );
  }

  const secret = process.env.WAHA_WEBHOOK_HMAC_SECRET;
  if (!secret) return NextResponse.json({ error: "server misconfig" }, { status: 500 });

  const raw = await request.text();
  const sig = request.headers.get("x-webhook-hmac");
  if (!verifyWahaSignature(raw, secret, sig)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .schema("smarttalk")
    .from("webhook_events")
    .insert({ channel: "waha", payload: parsed, status: "pending" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 11.4: Run test — expect pass**

```bash
cd web && npx vitest run src/app/api/webhook/waha/route.test.ts
# Expected: PASS (3 tests)
```

- [ ] **Step 11.5: Commit**

```bash
git add web/src/app/api/webhook/waha
git commit -m "feat(webhook): /api/webhook/waha HMAC-verified enqueue"
```

---

## Task 12: Worker — handle `channel='waha'` in process-webhook-events

**Files:**
- Create: `web/src/lib/waha/webhook-handler.ts`
- Test: `web/src/lib/waha/webhook-handler.test.ts`
- Modify: `web/src/app/api/inbox/process-webhook-events/route.ts` — route `channel='waha'` rows through the new handler

**Handler behavior:**
- `event=session.status`: update `smarttalk.waha_sessions.status`, and if `WORKING` mark linked channel `active`; if `FAILED|STOPPED` mark `disconnected`.
- `event=message` (or `message.any`): find channel via `session` name → resolve organization → insert an inbound message into inbox (mirror the shape used by respond-io handler).
- `event=message.ack`: update the corresponding outbound message ack (best-effort; log-and-continue if not found).

- [ ] **Step 12.1: Write failing test (session.status + message)**

```typescript
// web/src/lib/waha/webhook-handler.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleWahaEvent } from "./webhook-handler";

function makeAdmin(overrides: any = {}) {
  const calls: Record<string, any[]> = { channels: [], waha_sessions: [], inbox_events: [] };
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: { id: "ch1", organization_id: "org1" }, error: null }),
      }),
    }),
    update: (v: any) => {
      calls[table] = calls[table] ?? [];
      calls[table].push({ update: v });
      return { eq: () => Promise.resolve({ error: null }) };
    },
    insert: (v: any) => {
      calls[table] = calls[table] ?? [];
      calls[table].push({ insert: v });
      return Promise.resolve({ error: null });
    },
  });
  return {
    admin: { schema: () => ({ from }) },
    calls,
    ...overrides,
  };
}

describe("handleWahaEvent", () => {
  it("session.status WORKING → channel active + session WORKING", async () => {
    const { admin, calls } = makeAdmin();
    await handleWahaEvent(admin as any, {
      event: "session.status",
      session: "brand_abc",
      payload: { status: "WORKING", me: { id: "573001112233@c.us", pushname: "Leo" } },
    } as any);
    expect(calls.waha_sessions.some((c: any) => c.update?.status === "WORKING")).toBe(true);
    expect(calls.channels.some((c: any) => c.update?.status === "active")).toBe(true);
  });

  it("message event → inbox_events insert with inbound direction", async () => {
    const { admin, calls } = makeAdmin();
    await handleWahaEvent(admin as any, {
      event: "message",
      session: "brand_abc",
      payload: { from: "573009998877@c.us", body: "hola", fromMe: false, timestamp: 1700000000 },
    } as any);
    const inserted = calls.inbox_events.find((c: any) => c.insert?.direction === "inbound");
    expect(inserted).toBeTruthy();
    expect(inserted.insert.channel_id).toBe("ch1");
  });
});
```

- [ ] **Step 12.2: Run test — expect failure**

```bash
cd web && npx vitest run src/lib/waha/webhook-handler.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 12.3: Implement `webhook-handler.ts`**

```typescript
// web/src/lib/waha/webhook-handler.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WahaMessageEvent } from "./types";

type Admin = SupabaseClient;

export async function handleWahaEvent(admin: Admin, event: WahaMessageEvent): Promise<void> {
  const sessionName = event.session;
  if (!sessionName) return;

  const { data: sess } = await admin
    .schema("smarttalk")
    .from("waha_sessions")
    .select("channel_id")
    .eq("session_name", sessionName)
    .single();
  if (!sess) return;

  const { data: channel } = await admin
    .schema("smarttalk")
    .from("channels")
    .select("id, organization_id")
    .eq("id", (sess as any).channel_id)
    .single();
  if (!channel) return;

  if (event.event === "session.status") {
    const status = String((event.payload as any).status ?? "");
    const now = new Date().toISOString();
    const meId = (event.payload as any).me?.id as string | undefined;
    const push = (event.payload as any).me?.pushname as string | undefined;

    const updateSess: Record<string, unknown> = { status, last_status_at: now };
    if (meId) updateSess.phone_number = meId.split("@")[0];
    if (push) updateSess.push_name = push;
    await admin.schema("smarttalk").from("waha_sessions").update(updateSess).eq("session_name", sessionName);

    const chStatus =
      status === "WORKING" ? "active" :
      status === "FAILED" || status === "STOPPED" ? "disconnected" :
      "pending";
    await admin.schema("smarttalk").from("channels").update({ status: chStatus }).eq("id", (channel as any).id);
    return;
  }

  if (event.event === "message" || event.event === "message.any") {
    const p = event.payload as any;
    if (p.fromMe) return;
    const fromJid = String(p.from ?? "");
    const phone = fromJid.split("@")[0];
    if (!phone) return;

    await admin.schema("smarttalk").from("inbox_events").insert({
      organization_id: (channel as any).organization_id,
      channel_id: (channel as any).id,
      provider: "waha",
      direction: "inbound",
      external_message_id: p.id ?? null,
      from_phone: phone,
      body: typeof p.body === "string" ? p.body : null,
      raw: p,
      received_at: p.timestamp
        ? new Date(Number(p.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    });
    return;
  }

  // message.ack — best-effort update on outbound message
  if (event.event === "message.ack") {
    const p = event.payload as any;
    if (!p.id) return;
    await admin
      .schema("smarttalk")
      .from("inbox_events")
      .update({ ack_status: p.ack ?? null, ack_at: new Date().toISOString() })
      .eq("external_message_id", p.id);
  }
}
```

> **Note for engineer:** if `smarttalk.inbox_events` is not the actual sink table, replace with whichever table `RESPOND_IO_HANDLER` currently writes to (check `web/src/lib/respond-io/webhook-handler.ts` — same signature/shape). Mirror it exactly; the test above just asserts direction+channel_id fields.

- [ ] **Step 12.4: Wire into `process-webhook-events/route.ts`**

Open `web/src/app/api/inbox/process-webhook-events/route.ts`. Find the branch that dispatches per `channel`. Add:

```typescript
} else if (row.channel === "waha") {
  const { handleWahaEvent } = await import("@/lib/waha/webhook-handler");
  await handleWahaEvent(admin, row.payload as any);
}
```

- [ ] **Step 12.5: Run all tests — expect pass**

```bash
cd web && npx vitest run src/lib/waha
# Expected: PASS (client + signature + session-name + webhook-handler)
```

- [ ] **Step 12.6: Commit**

```bash
git add web/src/lib/waha/webhook-handler.ts web/src/lib/waha/webhook-handler.test.ts web/src/app/api/inbox/process-webhook-events/route.ts
git commit -m "feat(worker): process waha events (status + message + ack)"
```

---

## Task 13: Outbound sender — send WhatsApp text through WAHA

**Files:**
- Create: `web/src/lib/waha/sender.ts`
- Test: `web/src/lib/waha/sender.test.ts`
- Modify: whichever module dispatches inbox outbound sends (search: `grep -rn "channel.type === 'respond_io'" web/src/lib`)

- [ ] **Step 13.1: Write failing test**

```typescript
// web/src/lib/waha/sender.test.ts
import { describe, it, expect, vi } from "vitest";
import { sendWahaText } from "./sender";

describe("sendWahaText", () => {
  it("maps phone → JID and calls WahaClient.sendText", async () => {
    const sendText = vi.fn().mockResolvedValue({ id: "abc" });
    const admin = {
      schema: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { session_name: "brand_x" }, error: null }) }) }),
        }),
      }),
    } as any;
    const out = await sendWahaText({
      admin,
      channelId: "ch1",
      toPhone: "573001112233",
      text: "hola",
      client: { sendText } as any,
    });
    expect(sendText).toHaveBeenCalledWith({ session: "brand_x", chatId: "573001112233@c.us", text: "hola" });
    expect(out.externalId).toBe("abc");
  });

  it("throws if channel has no session", async () => {
    const admin = {
      schema: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        }),
      }),
    } as any;
    await expect(
      sendWahaText({ admin, channelId: "ch1", toPhone: "573001112233", text: "hi", client: { sendText: vi.fn() } as any })
    ).rejects.toThrow(/no waha session/i);
  });
});
```

- [ ] **Step 13.2: Run test — expect failure**

```bash
cd web && npx vitest run src/lib/waha/sender.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 13.3: Implement `sender.ts`**

```typescript
// web/src/lib/waha/sender.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WahaClient } from "./client";

export interface SendWahaInput {
  admin: SupabaseClient;
  channelId: string;
  toPhone: string;   // digits only, no + or @c.us
  text: string;
  client: WahaClient;
}

export async function sendWahaText(input: SendWahaInput): Promise<{ externalId: string }> {
  const digits = input.toPhone.replace(/\D/g, "");
  if (!digits) throw new Error("toPhone empty");
  const { data: sess } = await input.admin
    .schema("smarttalk")
    .from("waha_sessions")
    .select("session_name")
    .eq("channel_id", input.channelId)
    .single();
  if (!sess) throw new Error("no waha session for channel");
  const r = await input.client.sendText({
    session: (sess as any).session_name,
    chatId: `${digits}@c.us`,
    text: input.text,
  });
  return { externalId: r.id };
}
```

- [ ] **Step 13.4: Wire into inbox dispatcher**

Find the file that already dispatches respond-io (`grep -rn "respond_io" web/src/lib | head`), add a branch:

```typescript
} else if (channel.type === "waha") {
  const { sendWahaText } = await import("@/lib/waha/sender");
  const { wahaFromEnv } = await import("@/lib/waha/client");
  const r = await sendWahaText({
    admin, channelId: channel.id, toPhone: destination, text: body, client: wahaFromEnv(),
  });
  externalId = r.externalId;
}
```

- [ ] **Step 13.5: Run tests — expect pass**

```bash
cd web && npx vitest run src/lib/waha/sender.test.ts
# Expected: PASS (2 tests)
```

- [ ] **Step 13.6: Commit**

```bash
git add web/src/lib/waha/sender.ts web/src/lib/waha/sender.test.ts web/src/lib/inbox
git commit -m "feat(sender): outbound WAHA text send + inbox dispatch"
```

---

## Task 14: UI — WahaConnect component

**Files:**
- Create: `web/src/components/channels/WahaConnect.tsx`

**Behavior:**
1. Button "Conectar WhatsApp (Beta)" → opens dialog with a **beta warning** (riesgo de baneo).
2. On confirm → POST `/api/channels/waha` with brandId. On 201 → save `channelId`.
3. Fetch `/api/channels/waha/[channelId]/qr` → show `<img>`. Refresh every 25 s until status is `WORKING`.
4. Poll `/api/channels/waha/[channelId]/status` every 3 s. On `WORKING` → close dialog + toast success. On `FAILED` → show error.
5. Second button "Desconectar" that DELETEs the channel.

- [ ] **Step 14.1: Implement the component**

```tsx
// web/src/components/channels/WahaConnect.tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  brandId: string;
  onConnected?: (channelId: string) => void;
}

type Status = "IDLE" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED" | "STOPPED";

export default function WahaConnect({ brandId, onConnected }: Props) {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("IDLE");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const qrRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (qrRef.current) { clearInterval(qrRef.current); qrRef.current = null; }
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    setQrUrl(null);
  }, [qrUrl]);

  const refreshQr = useCallback(async (id: string) => {
    const res = await fetch(`/api/channels/waha/${id}/qr`, { cache: "no-store" });
    if (res.status === 409) return; // WORKING
    if (!res.ok) { setError(`QR fetch failed: ${res.status}`); return; }
    const blob = await res.blob();
    setQrUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  }, []);

  const pollStatus = useCallback(async (id: string) => {
    const res = await fetch(`/api/channels/waha/${id}/status`, { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setStatus(j.status as Status);
    if (j.status === "WORKING") {
      cleanup();
      onConnected?.(id);
      setOpen(false);
    }
    if (j.status === "FAILED" || j.status === "STOPPED") {
      setError(j.last_error ?? "Sesión terminó en estado " + j.status);
    }
  }, [cleanup, onConnected]);

  const start = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/channels/waha", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandId }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return;
    }
    const j = await res.json();
    setChannelId(j.channelId);
    setStatus(j.status as Status);
    await refreshQr(j.channelId);
    qrRef.current = setInterval(() => refreshQr(j.channelId), 25_000);
    pollRef.current = setInterval(() => pollStatus(j.channelId), 3_000);
  }, [brandId, refreshQr, pollStatus]);

  useEffect(() => () => cleanup(), [cleanup]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void start(); }}
        className="rounded bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700"
      >
        Conectar WhatsApp (Beta)
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Conectar WhatsApp — canal beta</h3>
            <p className="mt-2 text-sm text-amber-700">
              ⚠ Canal no oficial. Usa la Web de WhatsApp bajo tu propio riesgo.
              El número puede ser suspendido por Meta si se detecta uso automatizado agresivo.
            </p>
            <div className="mt-4 flex items-center justify-center">
              {qrUrl ? (
                <img src={qrUrl} alt="QR code" className="h-64 w-64" />
              ) : (
                <div className="text-sm text-gray-500">
                  {status === "IDLE" ? "Iniciando sesión…" : `Estado: ${status}`}
                </div>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-between">
              <button className="text-sm text-gray-500 hover:underline" onClick={() => { cleanup(); setOpen(false); }}>
                Cancelar
              </button>
              <span className="text-xs text-gray-400">Estado: {status}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 14.2: Commit**

```bash
git add web/src/components/channels/WahaConnect.tsx
git commit -m "feat(ui): WahaConnect component with QR polling + beta warning"
```

---

## Task 15: UI — Register WAHA in AddChannelDialog

**Files:**
- Modify: `web/src/components/channels/AddChannelDialog.tsx`

- [ ] **Step 15.1: Locate the provider list**

Open the file, find the array/object that enumerates providers (respond-io, whatsapp cloud, etc.). Look for the block that renders `<RespondIoConnect />`.

- [ ] **Step 15.2: Import WahaConnect and add a provider option**

At the top of the file:

```tsx
import WahaConnect from "./WahaConnect";
```

In the provider list (mirror how `respond_io` is rendered — same wrapper, same section header). Add:

```tsx
{
  key: "waha",
  label: "WhatsApp (WAHA · Beta)",
  description: "Conecta cualquier número por QR usando nuestro servidor WAHA. Canal no oficial, con riesgo de baneo.",
  render: (brandId: string, onConnected: (id: string) => void) => (
    <WahaConnect brandId={brandId} onConnected={onConnected} />
  ),
},
```

If the file uses `if/else if` blocks instead of a list, add:

```tsx
) : provider === "waha" ? (
  <WahaConnect brandId={brandId} onConnected={onConnected} />
```

- [ ] **Step 15.3: Manual UI check (dev)**

```bash
cd web && npm run dev
# Visit http://localhost:3000/dashboard/settings/channels
# Click "Agregar canal" → see "WhatsApp (WAHA · Beta)" in the list.
```

- [ ] **Step 15.4: Commit**

```bash
git add web/src/components/channels/AddChannelDialog.tsx
git commit -m "feat(ui): expose WAHA (beta) provider in AddChannelDialog"
```

---

## Task 16: Watchdog cron

**Files:**
- Create: `web/src/app/api/cron/waha-watchdog/route.ts`
- Test: `web/src/app/api/cron/waha-watchdog/route.test.ts`
- Modify: `web/vercel.json`

**Behavior every 5 min:**
- For each `smarttalk.waha_sessions` where `last_status_at > NOW() - '10 minutes'` is FALSE, call `waha.getSession(name)`. Update row + linked channel status.
- Rate-cap: max 100 sessions per run (paginate later if needed).

- [ ] **Step 16.1: Write failing test**

```typescript
// web/src/app/api/cron/waha-watchdog/route.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/waha/client", () => ({ wahaFromEnv: vi.fn() }));

const { createAdminClient } = await import("@/lib/supabase/admin");
const { wahaFromEnv } = await import("@/lib/waha/client");
const { GET } = await import("./route");

describe("GET /api/cron/waha-watchdog", () => {
  it("marks stopped sessions as disconnected", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const updates: any[] = [];
    (createAdminClient as any).mockReturnValue({
      schema: () => ({
        from: (t: string) => ({
          select: () => ({
            lt: () => ({
              limit: () => Promise.resolve({
                data: [{ id: "s1", session_name: "brand_a", channel_id: "ch1" }],
                error: null,
              }),
            }),
          }),
          update: (v: any) => ({
            eq: () => { updates.push({ table: t, v }); return Promise.resolve({ error: null }); },
          }),
        }),
      }),
    });
    (wahaFromEnv as any).mockReturnValue({
      getSession: vi.fn().mockResolvedValue({ name: "brand_a", status: "STOPPED" }),
    });
    const req = new Request("http://x/api/cron/waha-watchdog", {
      headers: { authorization: "Bearer s3cr3t" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(updates.find((u) => u.table === "channels" && u.v.status === "disconnected")).toBeTruthy();
  });

  it("401 without cron secret", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await GET(new Request("http://x/api/cron/waha-watchdog"));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 16.2: Run test — expect failure**

```bash
cd web && npx vitest run src/app/api/cron/waha-watchdog/route.test.ts
# Expected: FAIL
```

- [ ] **Step 16.3: Implement**

```typescript
// web/src/app/api/cron/waha-watchdog/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { wahaFromEnv, WahaError } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .schema("smarttalk")
    .from("waha_sessions")
    .select("id, session_name, channel_id")
    .lt("last_status_at", cutoff)
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const waha = wahaFromEnv();
  let checked = 0, updated = 0;
  for (const row of rows ?? []) {
    checked++;
    try {
      const live = await waha.getSession((row as any).session_name);
      const chStatus =
        live.status === "WORKING" ? "active" :
        live.status === "FAILED" || live.status === "STOPPED" ? "disconnected" :
        "pending";
      await admin.schema("smarttalk").from("waha_sessions")
        .update({ status: live.status, last_status_at: new Date().toISOString() })
        .eq("id", (row as any).id);
      await admin.schema("smarttalk").from("channels")
        .update({ status: chStatus })
        .eq("id", (row as any).channel_id);
      updated++;
    } catch (e) {
      const msg = e instanceof WahaError ? e.message : (e as Error).message;
      await admin.schema("smarttalk").from("waha_sessions")
        .update({ status: "FAILED", last_error: msg, last_status_at: new Date().toISOString() })
        .eq("id", (row as any).id);
      await admin.schema("smarttalk").from("channels")
        .update({ status: "disconnected" })
        .eq("id", (row as any).channel_id);
    }
  }
  return NextResponse.json({ ok: true, checked, updated });
}
```

- [ ] **Step 16.4: Run test — expect pass**

```bash
cd web && npx vitest run src/app/api/cron/waha-watchdog/route.test.ts
# Expected: PASS (2 tests)
```

- [ ] **Step 16.5: Register cron in `web/vercel.json`**

Open `web/vercel.json` and add inside `crons`:

```json
{
  "path": "/api/cron/waha-watchdog",
  "schedule": "*/5 * * * *"
}
```

Final `crons` array (7 entries):

```json
"crons": [
  { "path": "/api/cron/refresh-tokens",              "schedule": "0 3 * * *" },
  { "path": "/api/inbox/process-webhook-events",     "schedule": "*/2 * * * *" },
  { "path": "/api/inbox/archive-old",                "schedule": "30 4 * * *" },
  { "path": "/api/inbox/auto-close-idle",            "schedule": "0 5 * * *" },
  { "path": "/api/cron/billing-lifecycle",           "schedule": "15 4 * * *" },
  { "path": "/api/cron/reap-scheduled",              "schedule": "*/5 * * * *" },
  { "path": "/api/cron/waha-watchdog",               "schedule": "*/5 * * * *" }
]
```

- [ ] **Step 16.6: Commit**

```bash
git add web/src/app/api/cron/waha-watchdog web/vercel.json
git commit -m "feat(cron): waha-watchdog reconciles session state every 5 min"
```

---

## Task 17: End-to-end integration test (dev-only, tagged)

**Files:**
- Create: `web/tests/waha.e2e.test.mjs`

Runs only when `WAHA_E2E=1` and the WAHA server is reachable. Verifies real HTTP round-trip.

- [ ] **Step 17.1: Write the E2E**

```javascript
// web/tests/waha.e2e.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const SHOULD_RUN = process.env.WAHA_E2E === "1";
const base = process.env.WAHA_BASE_URL;
const key = process.env.WAHA_API_KEY;

test("WAHA server reachable", { skip: !SHOULD_RUN }, async () => {
  const res = await fetch(`${base}/ping`);
  assert.equal(res.status, 200);
});

test("WAHA authorized listSessions", { skip: !SHOULD_RUN }, async () => {
  const res = await fetch(`${base}/api/sessions`, { headers: { "X-Api-Key": key } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test("WAHA rejects wrong key", { skip: !SHOULD_RUN }, async () => {
  const res = await fetch(`${base}/api/sessions`, { headers: { "X-Api-Key": "wrong" } });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 17.2: Run locally against the deployed WAHA**

```bash
cd web
WAHA_E2E=1 WAHA_BASE_URL=https://waha.smartgenapp.com WAHA_API_KEY=<the-key> \
  node --test --experimental-strip-types tests/waha.e2e.test.mjs
# Expected: 3 tests pass. Without env vars: all 3 skipped.
```

- [ ] **Step 17.3: Commit**

```bash
git add web/tests/waha.e2e.test.mjs
git commit -m "test(waha): opt-in e2e connectivity test"
```

---

## Task 18: Operator runbook

**Files:**
- Create: `web/docs/WAHA_CHANNEL_RUNBOOK.md`

- [ ] **Step 18.1: Write the runbook**

```markdown
# WAHA Channel Runbook

Self-hosted WhatsApp HTTP API — deployed as the `waha` channel type. Sprint 27.

## Where things live

| Piece | Location |
|---|---|
| WAHA container | `server` VPS · `/opt/waha/docker-compose.yml` |
| Public URL | `https://waha.smartgenapp.com` (Caddy reverse proxy) |
| Admin dashboard | `https://waha.smartgenapp.com/dashboard` (Basic Auth) |
| Sessions data | `/opt/waha/data/sessions/` (Docker volume) — **backup weekly** |
| API key | `/opt/waha/.env → WAHA_API_KEY` (also in Vercel env `WAHA_API_KEY`) |
| Webhook HMAC secret | `/opt/waha/.env → WAHA_WEBHOOK_HMAC_SECRET` (also in Vercel env) |
| DB tables | `smarttalk.channels (type='waha')`, `smarttalk.waha_sessions` |
| Migration | `web/supabase/migrations/20260807000000_020_waha_channel.sql` |

## Deploy WAHA (first time)

See `infra/waha/` in the repo. Copy `docker-compose.yml`, `.env.example` (rename to `.env`), and `Caddyfile.snippet` to the server. Generate two secrets:
```
openssl rand -hex 32   # WAHA_API_KEY
openssl rand -hex 32   # WAHA_WEBHOOK_HMAC_SECRET
```
Set both in Vercel Production env vars (`WAHA_API_KEY`, `WAHA_WEBHOOK_HMAC_SECRET`) — they must match.

## Common operations

### Restart WAHA container
```bash
ssh server
cd /opt/waha
docker compose restart waha
docker compose logs -f waha
```

### Add a new brand session (from the app)
Settings → Channels → Add channel → "WhatsApp (WAHA · Beta)" → scan QR from the target phone.

### Delete a stuck session manually
```bash
ssh server
docker exec -i waha \
  curl -s -X DELETE -H "X-Api-Key: $WAHA_API_KEY" http://localhost:3000/api/sessions/brand_<id>
```

### Rotate the API key
1. Generate new key: `openssl rand -hex 32`
2. Update Vercel env `WAHA_API_KEY` (Production), redeploy the app.
3. SSH to server, update `/opt/waha/.env`, restart WAHA (`docker compose up -d waha`).
4. During the restart there will be ~10 s where community-manager cannot call WAHA. Watchdog will report failures for that cycle.

### Rotate the HMAC secret
Same as above but for `WAHA_WEBHOOK_HMAC_SECRET`. Additionally, all existing sessions must be re-created (WAHA stores the HMAC per session). Script:
```bash
# TODO(operator): loop over smarttalk.waha_sessions and PUT the new webhook config
```

### Backup sessions volume
```bash
ssh server
tar czf /root/waha-sessions-$(date +%F).tgz -C /opt/waha data/sessions
# Restore: stop container, extract into /opt/waha, start container.
```

## Troubleshooting

**Symptom:** UI shows `SCAN_QR_CODE` forever.
- Check `/api/channels/waha/<id>/status` — refreshes from WAHA.
- Check WAHA logs: `docker compose logs waha | tail -100`.
- Verify the phone did not scan a stale QR (they expire after ~30 s).

**Symptom:** Watchdog marks sessions `disconnected` right after connect.
- WAHA container might have restarted. Sessions in `NOWEB` engine survive restarts if the volume is intact.
- Check that `/opt/waha/data/sessions/` is preserved across `docker compose down`.

**Symptom:** `POST /api/channels/waha` returns 502.
- Vercel cannot reach `waha.smartgenapp.com`. Curl from Vercel logs; check DNS + Caddy + firewall.

**Symptom:** Webhook returns 401 in WAHA logs.
- HMAC secret drift between Vercel and the server `.env`. Compare both, re-align, restart container, re-create sessions.
```

- [ ] **Step 18.2: Commit**

```bash
git add web/docs/WAHA_CHANNEL_RUNBOOK.md
git commit -m "docs: WAHA channel runbook (deploy, ops, troubleshooting)"
```

---

## Task 19: Full test suite + build

- [ ] **Step 19.1: Run the whole test suite**

```bash
cd web && npm test
# Expected: all previous tests still pass + new WAHA suite passes
```

- [ ] **Step 19.2: Type-check + build**

```bash
cd web && npm run build
# Expected: build succeeds. Fix any TS errors before shipping.
```

- [ ] **Step 19.3: If anything fails**

Fix in place. Do NOT skip tests. If a test can't be made to pass in this sprint, remove it (with explicit justification in the commit) rather than skip.

- [ ] **Step 19.4: Commit any fixes**

```bash
git commit -am "fix: address build/test failures for WAHA integration"
```

---

## Task 20: Deploy + smoke test

- [ ] **Step 20.1: Push the branch**

```bash
git push -u origin feat/waha-channel
```

- [ ] **Step 20.2: Open PR against `codex/billing-subscriptions`** (or `master` if that's the current merge target — check with the maintainer)

```bash
gh pr create --title "feat: WAHA (beta) WhatsApp channel" \
  --body-file docs/superpowers/plans/2026-08-07-waha-channel-integration.md
```

- [ ] **Step 20.3: After merge, deploy to production (auto-deploy is disconnected)**

```bash
cd web
vercel --prod --yes
```

- [ ] **Step 20.4: Smoke test in production**

```bash
# 1. Watchdog cron reachable
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://www.comunitymanager.io/api/cron/waha-watchdog
# Expected: 200

# 2. Webhook endpoint rejects unsigned
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST -H "content-type: application/json" \
  -d '{"x":1}' https://www.comunitymanager.io/api/webhook/waha
# Expected: 401

# 3. Open the UI and connect a real phone (Leo's personal WhatsApp is fine for first test)
# Navigate: https://www.comunitymanager.io/dashboard/settings/channels
# Click "Agregar canal" → "WhatsApp (WAHA · Beta)" → scan QR
# Expected: within ~15 s, status flips to WORKING and channel appears in the list.

# 4. Send a message from the phone to itself (or another number) via the connected session
# Verify it appears in Inbox within ~10 s (webhook → queue → cron every 2 min).
```

- [ ] **Step 20.5: If everything green, update project memory**

Add to `C:\Users\Leonel\.claude\projects\F--comunity-manager\memory\`:

- New file `project_waha_channel.md` with URL, session name convention, ops entry points, watchdog schedule.

- [ ] **Step 20.6: Announce in the changelog**

Update whichever release-notes doc the team uses (grep for `CHANGELOG.md` or `RELEASE_NOTES`). Entry:

```
### Added
- **WhatsApp (WAHA · beta) channel.** Self-hosted, QR-based connection for any WhatsApp number. Multi-tenant: one session per brand. See `web/docs/WAHA_CHANNEL_RUNBOOK.md`.
```

---

## Post-ship monitoring (first 48 h)

- Every hour, check `SELECT status, count(*) FROM smarttalk.waha_sessions GROUP BY status;` — flag any spike in `FAILED`/`STOPPED`.
- Watch Vercel function logs for `/api/webhook/waha` — 401s indicate HMAC drift; 500s indicate a schema or handler bug.
- On the server: `docker stats waha` — memory should stay under 500 MB per active session.
- If a customer's number gets banned: mark channel `disconnected` in Studio, notify the customer (they signed the beta warning). Document the incident.
