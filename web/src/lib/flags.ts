import { flag } from 'flags/next';
import { identify } from './identify';
import { getSupabaseServiceClient } from './os/supabase-service';

// ─────────────────────────────────────────────────────────────────────────────
// Community OS rollout policy
//
// Cohort data lives in `os_cohorts` table — no redeploy needed to add users.
// Sprint 3: flags.ts reads from DB with 30s in-process cache.
// GA plan: once validated with ~10 orgs, set full_rollout=true via cohort UI.
// ─────────────────────────────────────────────────────────────────────────────

interface CohortData {
  emails: Set<string>;
  orgIds: Set<string>;
  fullRollout: boolean;
}

let cohortCache: { data: CohortData | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};
const CACHE_TTL_MS = 30_000;

async function loadCohort(id: string): Promise<CohortData> {
  if (cohortCache.data && Date.now() - cohortCache.fetchedAt < CACHE_TTL_MS) {
    return cohortCache.data;
  }

  const sb = getSupabaseServiceClient();
  const { data } = await sb
    .from('os_cohorts')
    .select('emails, org_ids, full_rollout')
    .eq('id', id)
    .maybeSingle();

  const result: CohortData = {
    emails: new Set<string>(data?.emails ?? []),
    orgIds: new Set<string>(data?.org_ids ?? []),
    fullRollout: data?.full_rollout ?? false,
  };

  cohortCache = { data: result, fetchedAt: Date.now() };
  return result;
}

export const communityOsFlag = flag<boolean>({
  key: 'community-os',
  identify,
  description: 'Community OS shell (managed via os_cohorts table)',
  defaultValue: false,
  async decide({ entities }) {
    const cohort = await loadCohort('community-os');
    if (cohort.fullRollout) return true;
    if (entities?.userEmail && cohort.emails.has(entities.userEmail)) return true;
    if (entities?.orgId && cohort.orgIds.has(entities.orgId)) return true;
    if (entities?.orgIds?.some((id: string) => cohort.orgIds.has(id))) return true;
    return false;
  },
});
