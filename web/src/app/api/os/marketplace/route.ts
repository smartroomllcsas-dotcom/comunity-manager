import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { getOSRepositoryForRequest } from '@/lib/os/server';

export async function GET(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const url = new URL(req.url);
    const cat = url.searchParams.get('category');
    const repo = await getOSRepositoryForRequest();
    const templates = cat
      ? await repo.templates.byCategory(cat)
      : await repo.templates.all();
    return NextResponse.json({ templates });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
