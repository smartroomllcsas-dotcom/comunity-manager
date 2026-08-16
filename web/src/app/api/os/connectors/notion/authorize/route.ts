import { NextResponse } from 'next/server';
import { requireOrgIdFromRequest } from '@/lib/os/server';

export async function GET(req: Request) {
  try {
    const orgId = await requireOrgIdFromRequest();
    const clientId = process.env.NOTION_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ error: 'NOTION_CLIENT_ID not configured' }, { status: 500 });
    }
    const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URL!;
    const state = `${orgId}.${Date.now()}`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      owner: 'user',
      redirect_uri: redirectUri,
      state,
    });
    const url = `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
    return NextResponse.redirect(url);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
