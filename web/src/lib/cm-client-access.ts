import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mysqlQuery, quoteId } from "@/lib/mysql";
import { isGlobalAdminEmail } from "@/lib/platform-admin";
import { isBrandScopedMember } from "@/lib/smarttalk/brand-scope";

interface CmClientAccess {
  clientId: string;
  /**
   * Identificador en `public.cm_users` con el que operar sobre esta marca.
   *
   * Normalmente es el del usuario que pide. Pero un usuario **invitado** vive
   * en `smarttalk.agents` y en `brand_advisor_assignments`, y puede no tener
   * fila en `cm_users`: ese registro pertenece al modelo anterior a las
   * agencias. Cuando el acceso llega por organización y no hay `cm_users`, se
   * usa `cm_clients.user_id` —el propietario histórico de la marca— como
   * identificador legacy.
   *
   * Es una columna `NOT NULL REFERENCES cm_users(id)`, así que el valor siempre
   * existe y siempre es una clave válida para las tablas que lo referencian.
   * Nunca se crea un usuario durante una comprobación de permisos.
   */
  cmUserId: string;
  organizationId: string | null;
}

function isLocalMysql() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_DB_PROVIDER || "").toLowerCase() === "mysql"
  );
}

export async function getCmClientAccess(
  request: NextRequest,
  clientId: string
): Promise<CmClientAccess | null> {
  if (isLocalMysql()) {
    const cmUserId = request.cookies.get("cm_user_id")?.value;
    if (!cmUserId) return null;
    const rows = await mysqlQuery<Array<{ id: string }>>(
      `SELECT ${quoteId("id")} FROM ${quoteId("cm_clients")} WHERE ${quoteId("id")} = ? AND ${quoteId("user_id")} = ? LIMIT 1`,
      [clientId, cmUserId]
    );
    return rows[0]
      ? {
          clientId: rows[0].id,
          cmUserId,
          organizationId: null,
        }
      : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const publicAdmin = createAdminClient("public");
  const smarttalkAdmin = createAdminClient();
  const [{ data: cmUser }, { data: agent }] = await Promise.all([
    publicAdmin
      .from("cm_users")
      .select("id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle(),
    smarttalkAdmin
      .from("agents")
      .select("id, organization_id, member_type, is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  // Falta `cm_users` NO es motivo suficiente para denegar.
  //
  // Un usuario aceptado por invitación se crea en `smarttalk.agents` y en
  // `brand_advisor_assignments`, pero no necesariamente en `public.cm_users`,
  // que es una tabla del modelo anterior a las agencias. Devolver `null` aquí
  // dejaba fuera a administradores y asesores perfectamente autorizados, y el
  // síntoma era desconcertante: la invitación se aceptaba, el usuario entraba,
  // y la marca no aparecía por ningún lado.
  //
  // Lo que `cm_users` sí determina es la **propiedad histórica**; sin esa fila
  // simplemente no hay propiedad que comprobar, y el acceso tiene que llegar
  // por organización.
  if (!cmUser && !agent) return null;

  const { data: client } = await publicAdmin
    .from("cm_clients")
    .select("id, user_id, smarttalk_organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return null;
  const isSuperAdmin =
    agent?.is_super_admin === true || isGlobalAdminEmail(user.email);
  const ownsClient = Boolean(cmUser) && client.user_id === cmUser!.id;
  const belongsToAgency =
    Boolean(agent?.organization_id) &&
    client.smarttalk_organization_id === agent?.organization_id;
  if (!isSuperAdmin && !ownsClient && !belongsToAgency) return null;
  if (!isSuperAdmin && agent && isBrandScopedMember(agent)) {
    const { data: assignment } = await smarttalkAdmin
      .from("brand_advisor_assignments")
      .select("id")
      .eq("agent_id", agent.id)
      .eq("brand_id", client.id)
      .maybeSingle();
    if (!assignment) return null;
  }

  return {
    clientId: client.id,
    // Sin `cm_users` propio se opera con el propietario histórico de la marca.
    // Véase el comentario del tipo: no se inventa ningún usuario.
    cmUserId: cmUser?.id ?? client.user_id,
    organizationId: client.smarttalk_organization_id || null,
  };
}

/**
 * Marcas que este usuario puede ver, sin pedir una concreta.
 *
 * Es la versión «listado» de `getCmClientAccess`, y existe para que las rutas
 * que devuelven varias marcas no tengan que inventarse su propio criterio. La
 * que lo hacía —`GET /api/whatsapp/accounts`— filtraba por
 * `cm_clients.user_id` contra la cookie `cm_user_id`, y eso deja fuera a todo
 * el mundo menos al propietario original: un administrador de agencia o un
 * asesor asignado no veían las cuentas de su propia marca.
 *
 * Las reglas son deliberadamente las mismas que las de `getCmClientAccess`:
 *
 *   - la marca pertenece a la organización del agente, **o** el usuario es su
 *     propietario histórico (`cm_clients.user_id`), que es como quedaron las
 *     marcas anteriores a las agencias;
 *   - si el miembro está acotado por marca (`brand_advisor`), se intersecta con
 *     `brand_advisor_assignments`.
 *
 * El superadministrador conserva el alcance global en la comprobación por
 * marca —`getCmClientAccess` le concede cualquiera—; aquí el listado se
 * mantiene acotado a su organización y a lo suyo, igual que hace
 * `GET /api/cm/clients`. Devolver todas las marcas de la plataforma en un
 * listado de cuentas sería un cambio de comportamiento, no una corrección de
 * permisos.
 *
 * Devuelve `null` cuando no hay sesión y `[]` cuando la hay pero no alcanza a
 * ninguna marca. Quien llama debe distinguirlos —401 frente a lista vacía— y
 * no consultar nunca «sin filtro».
 */
export async function listAccessibleCmClientIds(
  request: NextRequest,
): Promise<string[] | null> {
  if (isLocalMysql()) {
    const cmUserId = request.cookies.get("cm_user_id")?.value;
    if (!cmUserId) return null;
    const rows = await mysqlQuery<Array<{ id: string }>>(
      `SELECT ${quoteId("id")} FROM ${quoteId("cm_clients")} WHERE ${quoteId("user_id")} = ?`,
      [cmUserId],
    );
    return rows.map((row) => row.id);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const publicAdmin = createAdminClient("public");
  const smarttalkAdmin = createAdminClient();
  const [{ data: cmUser }, { data: agent }] = await Promise.all([
    publicAdmin
      .from("cm_users")
      .select("id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle(),
    smarttalkAdmin
      .from("agents")
      .select("id, organization_id, member_type, is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  // Mismo criterio que `getCmClientAccess`: un usuario invitado puede no tener
  // fila en `cm_users` y aun así estar autorizado por su organización. Sólo se
  // deniega cuando no hay ni `cm_users` ni agente, que es no ser nadie aquí.
  if (!cmUser && !agent) return null;

  const { data: clients, error } = await publicAdmin
    .from("cm_clients")
    .select("id, user_id, smarttalk_organization_id");
  // Un fallo de lectura no puede convertirse en «todas las marcas»: se
  // devuelve vacío y quien llama responde una lista vacía.
  if (error) return [];

  const organizationId = agent?.organization_id || null;
  const visible = ((clients || []) as Array<{
    id: string;
    user_id: string | null;
    smarttalk_organization_id: string | null;
  }>).filter(
    (client) =>
      // La propiedad histórica sólo se evalúa cuando hay `cm_users`.
      (Boolean(cmUser) && client.user_id === cmUser!.id) ||
      (Boolean(organizationId) && client.smarttalk_organization_id === organizationId),
  );

  if (!agent || !isBrandScopedMember(agent) || agent.is_super_admin === true) {
    return visible.map((client) => client.id);
  }

  const { data: assignments } = await smarttalkAdmin
    .from("brand_advisor_assignments")
    .select("brand_id")
    .eq("agent_id", agent.id);
  const assigned = new Set(
    ((assignments || []) as Array<{ brand_id: string }>).map((row) => row.brand_id),
  );
  return visible.filter((client) => assigned.has(client.id)).map((client) => client.id);
}
