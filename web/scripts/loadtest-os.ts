#!/usr/bin/env tsx
/**
 * OS load test script — Sprint 4
 *
 * Usage:
 *   ORG_ID=<uuid> tsx scripts/loadtest-os.ts [--scenario=sentinel|ingest|agent-runs] [--concurrency=10] [--count=1000]
 *
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, APP_URL
 */
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const SCENARIO = (args.scenario ?? 'sentinel') as 'sentinel' | 'ingest' | 'agent-runs';
const CONCURRENCY = Number(args.concurrency ?? 10);
const COUNT = Number(args.count ?? 100);
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET!;
const ORG_ID = process.env.ORG_ID!;

async function callSentinel() {
  const t0 = Date.now();
  const res = await fetch(`${APP_URL}/api/cron/os-goals-sentinel`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const ms = Date.now() - t0;
  return { ok: res.ok, status: res.status, ms };
}

async function callIngest() {
  const t0 = Date.now();
  const res = await fetch(`${APP_URL}/api/cron/os-brain-ingest`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
}

async function callAgentRun() {
  // Would require agent id + auth. Sprint 4 placeholder.
  await sleep(50);
  return { ok: true, status: 200, ms: 50 };
}

const scenarios = { sentinel: callSentinel, ingest: callIngest, 'agent-runs': callAgentRun };

async function runBatch(fn: () => Promise<{ok:boolean;status:number;ms:number}>, n: number, concurrency: number) {
  const results: Array<{ok:boolean;status:number;ms:number}> = [];
  let i = 0;
  const inFlight = new Set<Promise<void>>();
  async function next() {
    if (i >= n) return;
    const idx = i++;
    const p = fn().then(r => { results.push(r); if (idx % 10 === 0) console.log(`  [${idx}] ${r.status} ${r.ms}ms`); });
    inFlight.add(p);
    await p;
    inFlight.delete(p);
    await next();
  }
  const workers = Array.from({ length: concurrency }, () => next());
  await Promise.all(workers);
  return results;
}

function stats(rs: Array<{ok:boolean;status:number;ms:number}>) {
  const times = rs.map(r => r.ms).sort((a,b)=>a-b);
  const p = (q: number) => times[Math.min(Math.floor(times.length*q), times.length-1)] ?? 0;
  const success = rs.filter(r => r.ok).length;
  return {
    total: rs.length, success, failed: rs.length - success,
    successRate: rs.length ? success/rs.length : 0,
    p50: p(0.5), p95: p(0.95), p99: p(0.99), max: p(1),
  };
}

(async () => {
  console.log(`OS LOAD TEST — scenario=${SCENARIO} count=${COUNT} concurrency=${CONCURRENCY}`);
  const fn = scenarios[SCENARIO];
  if (!fn) throw new Error(`unknown scenario ${SCENARIO}`);
  const t0 = Date.now();
  const results = await runBatch(fn, COUNT, CONCURRENCY);
  const elapsed = (Date.now() - t0) / 1000;
  const s = stats(results);
  const rps = s.total / elapsed;
  console.log('\n=== RESULTS ===');
  console.log(`total: ${s.total} · success: ${s.success} (${(s.successRate*100).toFixed(1)}%) · failed: ${s.failed}`);
  console.log(`p50: ${s.p50}ms · p95: ${s.p95}ms · p99: ${s.p99}ms · max: ${s.max}ms`);
  console.log(`elapsed: ${elapsed.toFixed(1)}s · rps: ${rps.toFixed(2)}`);
  process.exit(s.successRate < 0.95 ? 1 : 0);
})();
