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

    // ── 2. CM legacy session (cm_user_id cookie → public.cm_users → cm_clients) ──
    // The CM legacy dashboard uses its own auth (password_hash in public.cm_users),
    // NOT Supabase Auth. When a user logs in via the legacy flow, only the cm_user_id
    // cookie is set — supabase.auth.getUser() returns null. We must resolve email +
    // orgId from public.cm_users + public.cm_clients directly.
    const cmUserId = cookieStore.get('cm_user_id')?.value
      ? decodeURIComponent(cookieStore.get('cm_user_id')!.value)
      : null;

    let orgId: string | null = null;
    let orgIds: string[] = [];
    let legacyEmail: string | null = null;

    if (cmUserId) {
      // Use the anon client on the default (public) schema
      const sbPublic = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: () => {},
          },
        }
      );

      // public.cm_users has (id, email, ...) — no cm_client_id column here
      const { data: cmUser } = await sbPublic
        .from('cm_users')
        .select('id, email')
        .eq('id', cmUserId)
        .maybeSingle();

      if (cmUser?.email) legacyEmail = cmUser.email;

      // Orgs live in public.cm_clients with FK user_id → cm_users.id
      const { data: cmClients } = await sbPublic
        .from('cm_clients')
        .select('id')
        .eq('user_id', cmUserId);

      orgIds = (cmClients ?? []).map((c) => c.id as string);
      orgId = orgIds[0] ?? null;
    }

    const email = authUser?.email ?? legacyEmail;
    const userId = authUser?.id ?? cmUserId ?? null;

    return {
      userId,
      userEmail: email,
      orgId,
      orgIds,
      betaCohorts: [], // Sprint 2: query os_beta_cohorts
    };
  } catch {
    return { userId: null, userEmail: null, orgId: null, orgIds: [], betaCohorts: [] };
  }
});
