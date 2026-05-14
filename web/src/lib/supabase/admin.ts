import { createClient } from "@supabase/supabase-js";

type AdminSchema = "smarttalk" | "public";

export function createAdminClient(schema: AdminSchema = "smarttalk") {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema },
    }
  );
}
