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
    const emailArr = Array.from(cohort.emails);
    const email = entities?.userEmail ?? null;
    let decided = false;
    let reason = 'default_false';
    if (cohort.fullRollout) { decided = true; reason = 'full_rollout'; }
    else if (email && cohort.emails.has(email)) { decided = true; reason = 'email_match'; }
    else if (entities?.orgId && cohort.orgIds.has(entities.orgId)) { decided = true; reason = 'orgId_match'; }
    else if (entities?.orgIds?.some((id: string) => cohort.orgIds.has(id))) { decided = true; reason = 'orgIds_some_match'; }
    console.log('[flag.community-os] decide', { entities, cohortEmails: emailArr, decided, reason });
    return decided;
  },
});
