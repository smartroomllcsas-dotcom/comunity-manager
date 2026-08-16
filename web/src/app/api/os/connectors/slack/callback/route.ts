/**
 * GET /api/os/connectors/slack/callback
 *
 * Receives the OAuth callback from Slack after user authorizes the app.
 * Exchanges the `code` for an access token and persists it in `os_connectors`.
 *
 * Required env vars:
 *   SLACK_CLIENT_ID
 *   SLACK_CLIENT_SECRET
 *   SLACK_OAUTH_REDIRECT_URL
 *
 * NOTE: End-to-end smoke test requires a real Slack app with the above env vars
 * configured and the redirect URL registered in the Slack app settings.
 *
 * State verification (Sprint 2 — simplistic):
 *   state === orgId  (plain string, no HMAC).
 *   Sprint 3 upgrade: sign state with HMAC-SHA256 using APPROVAL_HMAC_SECRET.
 */
import { NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { communityOsFlag } from '@/lib/flags';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { wrapSecret } from '@/lib/os/crypto';

export async function GET(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const slackError = url.searchParams.get('error');

  // User denied the authorization
  if (slackError) {
    const dest = new URL('/es/os/integrations', req.url);
    dest.searchParams.set('slack', 'denied');
    return NextResponse.redirect(dest.toString());
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'missing params: code or state' }, { status: 400 });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_OAUTH_REDIRECT_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Slack OAuth not configured — set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_OAUTH_REDIRECT_URL' },
      { status: 503 }
    );
  }

  // Sprint 2: state IS the orgId (plain). Sprint 3: verify HMAC signature.
  const orgId = state;
  if (!orgId) {
    return NextResponse.json({ error: 'invalid state: could not extract orgId' }, { status: 400 });
  }

  try {
    const client = new WebClient();
    const result = await client.oauth.v2.access({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    if (!result.ok) {
      throw new Error((result as any).error ?? 'Slack oauth.v2.access returned ok=false');
    }

    const accessToken = (result as any).access_token as string;
    const teamName = (result as any).team?.name as string | undefined;
    const teamId = (result as any).team?.id as string | undefined;
    const botUserId = (result as any).bot_user_id as string | undefined;

    const sb = getSupabaseServiceClient();
    const { error: upsertError } = await sb.from('os_connectors').upsert(
      {
        id: 'slack',
        org_id: orgId,
        kind: 'oauth',
        provider: 'slack',
        status: 'live',
        config: {
          access_token: wrapSecret(accessToken),
          team_name: teamName ?? null,
          team_id: teamId ?? null,
          bot_user_id: botUserId ?? null,
        },
        last_check_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,id' }
    );

    if (upsertError) throw new Error(`DB upsert failed: ${upsertError.message}`);

    const dest = new URL('/es/os/integrations', req.url);
    dest.searchParams.set('slack', 'connected');
    return NextResponse.redirect(dest.toString());
  } catch (e: any) {
    // Redirect with error so the UI can surface it without a raw JSON page
    const dest = new URL('/es/os/integrations', req.url);
    dest.searchParams.set('slack', 'error');
    dest.searchParams.set('slack_err', encodeURIComponent(e.message ?? 'unknown'));
    return NextResponse.redirect(dest.toString());
  }
}
