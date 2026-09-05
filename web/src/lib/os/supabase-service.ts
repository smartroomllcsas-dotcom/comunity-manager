/**
 * Supabase service-role client for OS cron jobs (sentinel, scheduler).
 *
 * IMPORTANT: This client bypasses RLS. Never expose it to client-side code.
 * Only import from server-side cron routes or OS background workers.
 */
import { createClient } from '@supabase/supabase-js';

export function getSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
