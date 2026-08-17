/**
 * GET /api/os/finance/kpis
 *
 * Returns month-to-date income / expenses / net for the caller's brand set
 * (all sibling brands owned by the same cm_users user, via resolveBrandIds).
 */
import { NextResponse } from 'next/server';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { getFinanceKPIs } from '@/lib/finance/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const orgId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(orgId);
    const kpis = await getFinanceKPIs(brandIds);
    return NextResponse.json({ kpis, brandCount: brandIds.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
