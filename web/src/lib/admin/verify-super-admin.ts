import { createClient } from "@/lib/supabase/server";

export async function verifySuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: agent } = await supabase
    .from("agents")
    .select("id, organization_id, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  return agent?.is_super_admin ? agent : null;
}
