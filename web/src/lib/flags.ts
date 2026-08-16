import { flag } from 'flags/next';
import { identify } from './identify';

// ─────────────────────────────────────────────────────────────────────────────
// Community OS rollout policy
//
// 1. FULL_ROLLOUT_EMAILS: users who ALWAYS see Community OS (owners, admins).
//    Add an email here to give a user the OS immediately in all their orgs.
//
// 2. BETA_COHORT_ORGS: org IDs whose members see the OS regardless of the
//    user-level betaCohorts array. Add a UUID here to onboard a whole org to
//    the OS beta without editing individual user records.
//
// 3. betaCohorts (per-user, from identify()): expected to include the string
//    "community-os" for users manually added to the beta list. Populated by
//    an admin UI (Sprint 3) or manually via SQL until then.
//
// GA plan: once we've validated with ~10 orgs, change decide() to always
// return true and delete the two constants below.
// ─────────────────────────────────────────────────────────────────────────────

const FULL_ROLLOUT_EMAILS = new Set<string>([
  'leonel.zc2005@gmail.com',
  // add teammate emails here as they onboard
]);

const BETA_COHORT_ORGS = new Set<string>([
  // add org UUIDs here to enable Community OS for entire orgs
  // e.g. 'a1b2c3d4-...',
]);

export const communityOsFlag = flag<boolean>({
  key: 'community-os',
  identify,
  description:
    'Community OS shell — new /os/* namespace with fused FounderOS + Agentic-OS features',
  defaultValue: false,
  decide({ entities }) {
    if (entities?.userEmail && FULL_ROLLOUT_EMAILS.has(entities.userEmail)) return true;
    if (entities?.orgId && BETA_COHORT_ORGS.has(entities.orgId)) return true;
    if (entities?.orgIds?.some((id: string) => BETA_COHORT_ORGS.has(id))) return true;
    return entities?.betaCohorts?.includes('community-os') ?? false;
  },
});
