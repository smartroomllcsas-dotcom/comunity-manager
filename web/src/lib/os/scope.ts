/**
 * Scope resolver — maps a single `orgId` (which in CM's data model is a
 * `public.cm_clients.id` = one brand) into ALL sibling brands owned by the
 * same `cm_users` user.
 *
 * Needed because `smarttalk.channels.brand_id` FK → `public.cm_clients.id`,
 * while `smarttalk.channels.organization_id` FK → `smarttalk.organizations.id`
 * (a different concept). Adapters that want to surface every channel a user
 * has across their brands must filter by `.in('brand_id', brandIds)`.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export async function resolveBrandIds(cmClientId: string): Promise<string[]> {
  try {
    const admin = createAdminClient('public');
    const { data: current } = await admin
      .from('cm_clients')
      .select('user_id')
      .eq('id', cmClientId)
      .maybeSingle();
    if (!current?.user_id) return [cmClientId];
    const { data: siblings } = await admin
      .from('cm_clients')
      .select('id')
      .eq('user_id', current.user_id);
    const ids = (siblings ?? []).map((s) => s.id as string);
    return ids.length ? ids : [cmClientId];
  } catch {
    return [cmClientId];
  }
}
