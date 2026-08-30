import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseRepository } from './adapters/supabase';
import type { OSRepository } from './repository';
import { identify } from '@/lib/identify';

/**
 * Returns an OSRepository bound to the current request's Supabase client.
 * Uses the default schema (public) where os_* tables live.
 */
export async function getOSRepositoryForRequest(): Promise<OSRepository> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // os_* tables live in the public schema (not smarttalk)
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  return createSupabaseRepository(supabase);
}

/**
 * Extracts the orgId from the current session.
 * Throws 'unauthorized: no orgId in session' if not authenticated / no org.
 */
export async function requireOrgIdFromRequest(): Promise<string> {
  const entities = await identify();
  if (!entities?.orgId) {
    throw new Error('unauthorized: no orgId in session');
  }
  return entities.orgId;
}

/**
 * Active org (brand) for the current request — respects the BrandSwitcher
 * cookie via identify(). Returns nulls when unauthenticated (no throw).
 */
export async function getActiveOrgFromRequest(): Promise<{
  orgId: string | null;
  orgName: string | null;
}> {
  const entities = await identify();
  return { orgId: entities?.orgId ?? null, orgName: entities?.orgName ?? null };
}
