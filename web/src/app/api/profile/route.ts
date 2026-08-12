/**
 * GET / PATCH /api/profile — datos de la persona que ha iniciado sesión.
 *
 * Tres tablas para un solo perfil
 * -------------------------------
 * La identidad de un usuario vive repartida por razones históricas:
 *
 *   - `smarttalk.agents`        → identidad operativa (nombre, rol, estado).
 *   - `smarttalk.organizations` → agencia a la que pertenece y su teléfono
 *                                 de facturación.
 *   - `public.cm_users`         → usuario legacy del Community Manager, ligado
 *                                 por **correo**, no por id.
 *
 * El nombre se escribe en las dos primeras para que no diverjan: hoy la
 * interfaz lee de `agents` y el CM legacy de `cm_users`, y un perfil que sólo
 * actualizara una dejaría al usuario con dos nombres distintos según por dónde
 * entre.
 *
 * Qué NO se puede tocar desde aquí
 * --------------------------------
 * `role`, `organization_id`, `plan_id`, `is_super_admin`, `password_hash` y
 * cualquier token. La lista blanca es explícita y se aplica **construyendo** el
 * objeto de actualización campo a campo, no filtrando el cuerpo recibido:
 * filtrar es una lista negra disfrazada y falla en cuanto alguien añade una
 * columna sensible nueva.
 *
 * Qué NO se devuelve
 * ------------------
 * Nunca `password_hash`, `access_token`, `webhook_verify_token` ni ningún otro
 * secreto. Los `select()` piden columnas concretas por ese motivo.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Campos que el usuario puede editar. Todo lo demás es de sólo lectura. */
const EDITABLE_FIELDS = ["name", "billingPhone", "organizationName"] as const;

const MAX_NAME = 120;
const MAX_PHONE = 32;
const MAX_ORG_NAME = 120;

export interface ProfilePayload {
  name: string | null;
  email: string | null;
  billingPhone: string | null;
  organizationName: string | null;
  role: string | null;
  status: string | null;
  createdAt: string | null;
  /** El correo no se edita aquí: cambiarlo exige confirmación en Supabase Auth. */
  emailEditable: false;
}

async function loadSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, agent: null, error: "No autenticado." as const };

  const admin = createAdminClient("smarttalk");
  const { data: agent, error } = await admin
    .from("agents")
    // Ni `access_token` ni nada que no se muestre. `is_super_admin` se lee para
    // decidir el rol mostrado, pero no se expone como tal.
    .select("id, organization_id, name, email, role, status, created_at, is_super_admin, member_type")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return { user, agent: null, error: error.message };
  if (!agent) return { user, agent: null, error: "Agente no encontrado." as const };
  return { user, agent, error: null };
}

/** Rol legible. Un super admin lo es por encima de su `role` nominal. */
function displayRole(agent: {
  role?: string | null;
  member_type?: string | null;
  is_super_admin?: boolean | null;
}) {
  if (agent.is_super_admin === true) return "Super administrador";
  const byMemberType: Record<string, string> = {
    agency_user: "Usuario de agencia",
    brand_admin: "Administrador de marca",
    brand_advisor: "Asesor de marca",
  };
  const byRole: Record<string, string> = {
    admin: "Administrador",
    supervisor: "Supervisor",
    agent: "Agente",
  };
  const memberType = agent.member_type ? byMemberType[agent.member_type] : null;
  const role = agent.role ? byRole[agent.role] || agent.role : null;
  if (memberType && role) return `${memberType} · ${role}`;
  return memberType || role || "Sin rol asignado";
}

export async function GET() {
  const { user, agent, error } = await loadSession();
  if (!user) return NextResponse.json({ error }, { status: 401 });
  if (!agent) return NextResponse.json({ error }, { status: error === "Agente no encontrado." ? 404 : 500 });

  const admin = createAdminClient("smarttalk");
  const { data: organization } = await admin
    .from("organizations")
    .select("id, name, billing_phone")
    .eq("id", agent.organization_id)
    .maybeSingle();

  // El correo autenticado es la clave hacia el usuario legacy: `cm_users` no
  // comparte identificador con `agents`.
  const email = (agent.email as string | null) || user.email || null;
  let legacyName: string | null = null;
  if (email) {
    const publicAdmin = createAdminClient("public");
    const { data: legacyUser } = await publicAdmin
      .from("cm_users")
      // Explícitamente sin `password_hash`.
      .select("id, name, email, avatar_url")
      .eq("email", email)
      .maybeSingle();
    legacyName = (legacyUser as { name?: string | null } | null)?.name ?? null;
  }

  const payload: ProfilePayload = {
    // `agents` manda; `cm_users` sólo cubre a quien todavía no tiene nombre ahí.
    name: (agent.name as string | null) || legacyName,
    email,
    billingPhone: (organization as { billing_phone?: string | null } | null)?.billing_phone ?? null,
    organizationName: (organization as { name?: string | null } | null)?.name ?? null,
    role: displayRole(agent),
    status: (agent.status as string | null) ?? null,
    createdAt: (agent.created_at as string | null) ?? null,
    emailEditable: false,
  };

  return NextResponse.json({ profile: payload });
}

function readText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function PATCH(request: NextRequest) {
  const { user, agent, error } = await loadSession();
  if (!user) return NextResponse.json({ error }, { status: 401 });
  if (!agent) return NextResponse.json({ error }, { status: error === "Agente no encontrado." ? 404 : 500 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // Se rechaza de forma explícita en vez de ignorar en silencio: quien intenta
  // subir su propio rol merece un error, no un 200 que parece haber funcionado.
  const forbidden = [
    "role",
    "organization_id",
    "organizationId",
    "plan_id",
    "planId",
    "is_super_admin",
    "isSuperAdmin",
    "password_hash",
    "password",
    "access_token",
    "accessToken",
    "member_type",
    "memberType",
    "status",
    "email",
  ].filter((field) => field in body);

  if (forbidden.length > 0) {
    return NextResponse.json(
      {
        error: "Estos campos no se pueden modificar desde el perfil.",
        fields: forbidden,
        editable: EDITABLE_FIELDS,
      },
      { status: 400 },
    );
  }

  const name = readText(body.name, MAX_NAME);
  const billingPhone = readText(body.billingPhone, MAX_PHONE);
  const organizationName = readText(body.organizationName, MAX_ORG_NAME);

  if (name === undefined && billingPhone === undefined && organizationName === undefined) {
    return NextResponse.json(
      { error: "Nada que actualizar.", editable: EDITABLE_FIELDS },
      { status: 400 },
    );
  }
  if (name === null) {
    return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
  }

  const admin = createAdminClient("smarttalk");

  if (name !== undefined) {
    const { error: agentError } = await admin
      .from("agents")
      .update({ name })
      .eq("id", agent.id);
    if (agentError) {
      return NextResponse.json({ error: agentError.message }, { status: 500 });
    }
  }

  // El nombre de la organización y el teléfono son la misma fila: una sola
  // escritura evita dejarla a medias.
  const orgUpdate: Record<string, string | null> = {};
  if (organizationName !== undefined) {
    if (organizationName === null) {
      return NextResponse.json(
        { error: "El nombre de la agencia no puede quedar vacío." },
        { status: 400 },
      );
    }
    orgUpdate.name = organizationName;
  }
  if (billingPhone !== undefined) orgUpdate.billing_phone = billingPhone;

  if (Object.keys(orgUpdate).length > 0) {
    const { error: orgError } = await admin
      .from("organizations")
      .update(orgUpdate)
      .eq("id", agent.organization_id);
    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }
  }

  // El usuario legacy se sincroniza al final y **sin bloquear**: es un espejo,
  // no la fuente de verdad. Si falla, el perfil ya quedó guardado donde importa
  // y forzar un 500 haría creer que no se guardó nada.
  const email = (agent.email as string | null) || user.email || null;
  const warnings: string[] = [];
  if (name !== undefined && email) {
    const publicAdmin = createAdminClient("public");
    const { error: legacyError } = await publicAdmin
      .from("cm_users")
      .update({ name })
      .eq("email", email);
    if (legacyError) {
      warnings.push("No se pudo sincronizar el nombre con el perfil legacy.");
      console.warn(
        `[profile] cm_users sync failed ${JSON.stringify({ agent_id: agent.id, error: legacyError.message })}`,
      );
    }
  }

  const refreshed = await GET();
  const body2 = (await refreshed.json()) as { profile?: ProfilePayload };

  return NextResponse.json({
    ok: true,
    profile: body2.profile ?? null,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
