import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { wrapSecret } from '@/lib/os/crypto';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ error: 'missing code or state' }, { status: 400 });
  }

  const orgId = state.split('.')[0]; // TODO HMAC verify
  if (!orgId) {
    return NextResponse.json({ error: 'invalid state' }, { status: 400 });
  }

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

  const data = await tokenRes.json();

  if (!data.access_token) {
    return NextResponse.json({ error: 'oauth_failed', details: data }, { status: 500 });
  }

  const sb = getSupabaseServiceClient();
  await sb.from('os_connectors').upsert(
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

  return NextResponse.redirect(new URL('/es/os/integrations?notion=connected', req.url));
}
