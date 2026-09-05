# OS Load Test Scripts

Load testing scripts for the OS (Organizational System) under Sprint 4.

## Requirements

Set these env vars before running:

```bash
export APP_URL=https://your-app.vercel.app   # or http://localhost:3000
export CRON_SECRET=<your-cron-secret>
export ORG_ID=<uuid-of-test-org>
# Optional (not used by fetch scenarios but available for future use):
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
```

`tsx` must be available — it ships as a dev dependency (`pnpm add -D tsx`).

## Running

### Via pnpm scripts (recommended)

```bash
cd web

# Test sentinel cron — 50 calls, concurrency 5
pnpm loadtest:sentinel

# Test brain-ingest cron — 20 calls, concurrency 3
pnpm loadtest:ingest
```

### Direct invocation with custom parameters

```bash
cd web
ORG_ID=<uuid> tsx scripts/loadtest-os.ts --scenario=sentinel --count=200 --concurrency=20
ORG_ID=<uuid> tsx scripts/loadtest-os.ts --scenario=ingest   --count=50  --concurrency=5
ORG_ID=<uuid> tsx scripts/loadtest-os.ts --scenario=agent-runs --count=100 --concurrency=10
```

## Scenarios

| Scenario | Endpoint | Notes |
|---|---|---|
| `sentinel` | `POST /api/cron/os-goals-sentinel` | Checks goal progress for all orgs |
| `ingest` | `POST /api/cron/os-brain-ingest` | Brain chunk ingestion pipeline |
| `agent-runs` | _(placeholder)_ | Concurrent agent execution — Sprint 4 stub |

## Output

```
OS LOAD TEST — scenario=sentinel count=50 concurrency=5
  [0] 200 142ms
  [10] 200 138ms
  ...

=== RESULTS ===
total: 50 · success: 50 (100.0%) · failed: 0
p50: 140ms · p95: 210ms · p99: 250ms · max: 310ms
elapsed: 14.2s · rps: 3.52
```

Exit code `0` = success rate >= 95%. Exit code `1` = below threshold (use in CI).

## CI Integration

```yaml
- name: Load test sentinel
  run: |
    APP_URL=${{ secrets.APP_URL }} \
    CRON_SECRET=${{ secrets.CRON_SECRET }} \
    ORG_ID=${{ secrets.TEST_ORG_ID }} \
    pnpm --filter web loadtest:sentinel
```
