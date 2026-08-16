import { flag } from 'flags/next';
import { identify } from './identify';

export const communityOsFlag = flag<boolean>({
  key: 'community-os',
  identify,
  description:
    'Community OS shell — new /os/* namespace with fused FounderOS + Agentic-OS features',
  defaultValue: false,
  decide({ entities }) {
    // Full rollout for Leonel across ALL his orgs
    if (entities?.userEmail === 'leonel.zc2005@gmail.com') return true;
    // Rest: opt-in via beta cohort (Sprint 2-3 rollout)
    return entities?.betaCohorts?.includes('community-os') ?? false;
  },
});
