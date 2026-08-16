/**
 * POST /api/os/connectors/slack/disconnect
 *
 * Revokes the Slack token and marks the connector as not_configured.
 *
 * - Calls auth.revoke on Slack API (best-effort; does not fail if token already invalid).
 * - Clears config.access_token in os_connectors and sets status = 'not_configured'.
 */
import { NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';

export async function POST(_req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  let orgId: string;
  try {
    orgId = await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const sb = getSupabaseServiceClient();

  // Fetch current token to revoke it
  const { data } = await sb
    .from('os_connectors')
    .select('config')
    .eq('org_id', orgId)
    .eq('id', 'slack')
    .maybeSingle();

  const accessToken = (data?.config as any)?.access_token as string | undefined;

  if (accessToken) {
    try {
      const client = new WebClient(accessToken);
      await client.auth.revoke();
    } catch {
      // Best-effort: token may already be invalid — proceed with DB cleanup
    }
  }

  const { error: updateError } = await sb
    .from('os_connectors')
    .update({
      status: 'not_configured',
      config: {},
      last_check_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', 'slack');

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
