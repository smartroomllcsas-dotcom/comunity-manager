import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { identify } from '@/lib/identify';

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  const ent = await identify();
  if (!ent.userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });
  return NextResponse.json({
    userId: ent.userId,
    email: ent.userEmail ?? '',
    name: ent.userEmail?.split('@')[0] ?? '',
    avatar: null,
  });
}
