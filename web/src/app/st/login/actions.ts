"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return { error: error.message };
  }

  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id, organization_id, organizations(is_active)")
    .eq("id", authData.user.id)
    .single();

  if (agentError || !agent) {
    await supabase.auth.signOut();
    return { error: "No se encontro una cuenta de agente asociada. Contacta a tu administrador." };
  }

  const org = agent.organizations as unknown as { is_active: boolean } | null;
  if (org && org.is_active === false) {
    await supabase.auth.signOut();
    return { error: "Tu organizacion esta desactivada. Contacta al soporte." };
  }

  redirect("/inbox");
}
