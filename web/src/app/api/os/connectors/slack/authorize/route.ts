/**
 * GET /api/os/connectors/slack/authorize
 *
 * Initiates the Slack OAuth 2.0 flow.
 * Builds the Slack authorization URL and redirects the browser to it.
 *
 * Required env vars:
 *   SLACK_CLIENT_ID
 *   SLACK_OAUTH_REDIRECT_URL   (e.g. https://<host>/api/os/connectors/slack/callback)
 *
 * State format (Sprint 2 — simple; Sprint 3 upgrade to HMAC):
 *   "<orgId>.<userId>"  — passed through Slack and verified in callback
 */
import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { signState } from '@/lib/os/oauth-state';

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';

/** Scopes required by the Slack integration (notifications + basic identity) */
const SLACK_SCOPES = [
  'chat:write',
  'chat:write.public',
  'channels:read',
  'team:read',
].join(',');

export async function GET(req: Request) { // req used for redirect URL base
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_OAUTH_REDIRECT_URL;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Slack OAuth not configured — set SLACK_CLIENT_ID and SLACK_OAUTH_REDIRECT_URL' },
      { status: 503 }
    );
  }

  let orgId: string;
  try {
    orgId = await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  // Sprint 3: HMAC-signed state — CSRF hardening.
  const state = signState({ orgId, provider: 'slack' });

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  return NextResponse.redirect(`${SLACK_AUTHORIZE_URL}?${params.toString()}`);
}
