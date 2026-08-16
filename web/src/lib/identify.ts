import { dedupe } from 'flags/next';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface UserEntities {
  userId: string | null;
  userEmail: string | null;
  orgId: string | null;
  orgIds: string[];
  betaCohorts: string[];
}

/**
 * identify() — resolves the current user's entities for feature flag decisions.
 *
 * Auth strategy:
 * 1. Use @supabase/ssr createServerClient to read the Supabase Auth session from cookies.
 * 2. email comes from supabase.auth.getUser() (verified server-side).
 * 3. orgId comes from the cm_users table via the cm_user_id cookie (CM's custom session).
 *    cm_client_id is the org identifier in the CM data model.
 * 4. betaCohorts: not yet stored — empty array (Sprint 2 will populate via os_beta_cohorts).
 */
export const identify = dedupe(async (): Promise<UserEntities> => {
  try {
    const cookieStore = await cookies();

    // ── 1. Supabase Auth session (gets verified email) ────────────────────
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {}, // read-only in identify
        },
      }
    );

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    // ── 2. CM custom session (cm_user_id cookie → cm_client_id as orgId) ──
    const cmUserId = cookieStore.get('cm_user_id')?.value
      ? decodeURIComponent(cookieStore.get('cm_user_id')!.value)
      : null;

    let orgId: string | null = null;

    if (cmUserId) {
      // Query cm_users table (schema: smarttalk) to get cm_client_id
      const sbSmartalk = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          db: { schema: 'smarttalk' },
          cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: () => {},
          },
        }
      );

      const { data: cmUser } = await sbSmartalk
        .from('cm_users')
        .select('cm_client_id, email')
        .eq('id', cmUserId)
        .single();

      orgId = cmUser?.cm_client_id ?? null;
    }

    const email = authUser?.email ?? null;
    const userId = authUser?.id ?? cmUserId ?? null;

    return {
      userId,
      userEmail: email,
      orgId,
      orgIds: orgId ? [orgId] : [],
      betaCohorts: [], // Sprint 2: query os_beta_cohorts
    };
  } catch {
    return { userId: null, userEmail: null, orgId: null, orgIds: [], betaCohorts: [] };
  }
});
