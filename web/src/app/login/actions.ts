"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

type LoginResult = { error?: string; cmUserId?: string };

const SESSION_KEY = "cm_user_id";

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = (formData.get("email") as string)?.toLowerCase().trim();
  const password = formData.get("password") as string;
  if (!email || !password) return { error: "Email y contraseña requeridos" };

  const pub = createAdminClient("public");
  const st = createAdminClient("smarttalk");
  const supabase = await createClient();

  const { data: cmUser, error: cmErr } = await pub
    .from("cm_users")
    .select("id, email, password_hash, name, role, plan, cm_client_id")
    .eq("email", email)
    .maybeSingle();

  if (cmErr) return { error: "Error consultando usuarios" };
  if (!cmUser || cmUser.password_hash !== password) {
    return { error: "Email o contraseña inválidos" };
  }

  let { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr) {
    const { data: list } = await pub.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);

    if (existing) {
      await pub.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
      const retry = await supabase.auth.signInWithPassword({ email, password });
      if (retry.error) return { error: `Bridge falló al re-sincronizar contraseña: ${retry.error.message}` };
      signInData = retry.data;
    } else {
      const { data: created, error: createErr } = await pub.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: cmUser.name, source: "cm_bridge" },
      });
      if (createErr || !created?.user) {
        return { error: `Bridge falló al crear auth user: ${createErr?.message}` };
      }
      const fresh = await supabase.auth.signInWithPassword({ email, password });
      if (fresh.error) return { error: `Bridge falló al loguear nuevo auth user: ${fresh.error.message}` };
      signInData = fresh.data;
    }
  }

  const authUserId = signInData!.user!.id;

  const { data: agent } = await st
    .from("agents")
    .select("id, organization_id")
    .eq("id", authUserId)
    .maybeSingle();

  if (!agent) {
    let organizationId: string | null = null;

    if (cmUser.cm_client_id) {
      const { data: bridged } = await pub
        .from("cm_clients")
        .select("smarttalk_organization_id")
        .eq("id", cmUser.cm_client_id)
        .maybeSingle();
      organizationId = bridged?.smarttalk_organization_id ?? null;
    }

    if (!organizationId) {
      const orgName = cmUser.name ? `${cmUser.name} Workspace` : `${email} Workspace`;
      const { data: org, error: orgErr } = await st
        .from("organizations")
        .insert({ name: orgName, cm_client_id: cmUser.cm_client_id ?? null })
        .select("id")
        .single();
      if (orgErr || !org) return { error: `No pude crear organization: ${orgErr?.message}` };
      organizationId = org.id;

      if (cmUser.cm_client_id) {
        await pub
          .from("cm_clients")
          .update({ smarttalk_organization_id: organizationId })
          .eq("id", cmUser.cm_client_id);
      }
    }

    const role = cmUser.role === "admin" ? "admin" : "agent";
    const { error: agentErr } = await st.from("agents").insert({
      id: authUserId,
      organization_id: organizationId,
      email,
      name: cmUser.name ?? email,
      role,
      status: "online",
    });
    if (agentErr) return { error: `No pude crear agent: ${agentErr.message}` };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_KEY, cmUser.id, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}
