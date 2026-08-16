import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { verifyState } from '@/lib/os/oauth-state';
import { wrapSecret } from '@/lib/os/crypto';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ error: 'missing code or state' }, { status: 400 });
  }

  // Sprint 3: verify HMAC-signed state — rejects tampered/expired/wrong-provider tokens.
  const validated = verifyState(state, 'notion');
  if (!validated) {
    return NextResponse.json({ error: 'invalid or expired state' }, { status: 401 });
  }
  const orgId = validated.orgId;

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Notion OAuth env vars not configured' }, { status: 500 });
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  try {
    const data = await tokenRes.json();

    if (!data.access_token) {
      // Log the full response internally; do NOT return provider payload to the client
      // (may include refresh tokens, workspace hints, or error strings with sensitive data).
      console.error('[notion.callback] token exchange failed:', JSON.stringify(data).slice(0, 500));
      const dest = new URL('/es/os/integrations', req.url);
      dest.searchParams.set('notion', 'error');
      dest.searchParams.set('code', 'oauth_failed');
      return NextResponse.redirect(dest.toString());
    }

    const sb = getSupabaseServiceClient();
    const { error: upsertError } = await sb.from('os_connectors').upsert(
      {
        id: 'notion',
        org_id: orgId,
        kind: 'oauth',
        provider: 'notion',
        status: 'live',
        config: {
          access_token: wrapSecret(data.access_token),
          workspace_name: data.workspace_name,
          workspace_id: data.workspace_id,
          bot_id: data.bot_id,
        },
        last_check_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,id' },
    );

    if (upsertError) throw new Error('db_upsert_failed');

    const dest = new URL('/es/os/integrations', req.url);
    dest.searchParams.set('notion', 'connected');
    return NextResponse.redirect(dest.toString());
  } catch (e: unknown) {
    console.error('[notion.callback] failed:', e instanceof Error ? e.message : String(e));
    const dest = new URL('/es/os/integrations', req.url);
    dest.searchParams.set('notion', 'error');
    dest.searchParams.set('code', 'oauth_failed');
    return NextResponse.redirect(dest.toString());
  }
}
