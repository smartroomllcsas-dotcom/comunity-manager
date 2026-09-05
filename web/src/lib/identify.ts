import { dedupe } from 'flags/next';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Service-role client for identify() only. Needed because public.cm_users has RLS
 * enabled, and identify() runs before any user JWT is bound. Never used for
 * client-facing mutations — read-only helper strictly for flag evaluation.
 */
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

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
      // Use service-role client — public.cm_users has RLS on and there is no
      // JWT bound at this point, so anon queries return 0 rows.
      const sb = serviceClient();

      const { data: cmUser } = await sb
        .from('cm_users')
        .select('id, email')
        .eq('id', cmUserId)
        .maybeSingle();

      if (cmUser?.email) legacyEmail = cmUser.email.trim().toLowerCase();

      // Orgs live in public.cm_clients with FK user_id → cm_users.id
      const { data: cmClients } = await sb
        .from('cm_clients')
        .select('id')
        .eq('user_id', cmUserId);

      orgIds = (cmClients ?? []).map((c) => c.id as string);
      orgId = orgIds[0] ?? null;
    }

    const rawEmail = authUser?.email ?? legacyEmail;
    const email = rawEmail ? rawEmail.trim().toLowerCase() : null;
    const userId = authUser?.id ?? cmUserId ?? null;

    // TEMP diagnostic (remove after Community OS visibility confirmed in prod)
    console.log('[identify] result', {
      hasCookie: !!cmUserId,
      cmUserIdPrefix: cmUserId ? cmUserId.slice(0, 8) : null,
      authUserEmail: authUser?.email ?? null,
      legacyEmail,
      finalEmail: email,
      orgCount: orgIds.length,
    });

    return {
      userId,
      userEmail: email,
      orgId,
      orgIds,
      betaCohorts: [], // Sprint 2: query os_beta_cohorts
    };
  } catch (e) {
    console.error('[identify] threw', e instanceof Error ? e.message : String(e));
    return { userId: null, userEmail: null, orgId: null, orgIds: [], betaCohorts: [] };
  }
});
