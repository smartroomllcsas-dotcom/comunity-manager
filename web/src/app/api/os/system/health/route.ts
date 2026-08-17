/**
 * OS · System · Health
 *
 * GET → runtime snapshot (Next version, Supabase URL masked, tailnet ping).
 * POST → placeholder for future danger-zone actions (purge / rebuild) → 501.
 */
import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';

function maskUrl(url: string | undefined): string {
  if (!url) return 'not-set';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.slice(0, 8)}••••${u.hostname.slice(-4)}`;
  } catch {
    return url.slice(0, 12) + '••••';
  }
}

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const nextVersion = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('next/package.json').version as string;
    } catch {
      return 'unknown';
    }
  })();

  let serverReachable: boolean | null = null;
  let serverLatencyMs: number | undefined;
  try {
    const start = Date.now();
    const res = await fetch('http://100.103.216.114:8092/health', {
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    }).catch(() => null);
    serverLatencyMs = Date.now() - start;
    serverReachable = res != null && res.ok;
  } catch {
    serverReachable = false;
  }

  return NextResponse.json({
    nextVersion,
    supabaseUrl: maskUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    lastMigration: process.env.LAST_MIGRATION ?? null,
    serverReachable,
    serverLatencyMs,
    timestamp: new Date().toISOString(),
  });
}

export async function POST() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  return NextResponse.json(
    { error: 'not_implemented', message: 'Danger-zone actions ship in Sprint 2.' },
    { status: 501 },
  );
}
