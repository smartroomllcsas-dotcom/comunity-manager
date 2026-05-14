"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function register(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;
  const orgName = formData.get("orgName") as string;

  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError || !authData.user) {
    return { error: authError?.message || "Error al crear usuario" };
  }

  const { data: org, error: orgError } = await admin
    .from("organizations").insert({ name: orgName }).select("id").single();
  if (orgError || !org) {
    return { error: "Error al crear organización" };
  }

  const { error: agentError } = await admin.from("agents").insert({
    id: authData.user.id, organization_id: org.id, name, email, role: "admin", status: "online",
  });
  if (agentError) {
    return { error: "Error al crear agente" };
  }
  redirect("/inbox");
}
