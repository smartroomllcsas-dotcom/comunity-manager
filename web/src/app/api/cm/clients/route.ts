import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  billingDeniedResponse,
  billingCapacityDeniedResponse,
  billingCapacityErrorResponse,
  checkBillingFeature,
  consumeBillingCapacity,
  releaseBillingCapacity,
  reserveBillingCapacity,
} from "@/lib/billing/service";
import { mysqlQuery, quoteId } from "@/lib/mysql";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { getChannelsNeedingReconnection } from "@/lib/smarttalk/brand-lifecycle";

const ALLOWED_PLATFORMS = new Set([
  "Instagram",
  "Facebook",
  "WhatsApp",
]);

function isLocalMysql() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_DB_PROVIDER || "").toLowerCase() === "mysql"
  );
}

function normalizeBody(body: unknown) {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const industry =
    typeof payload.industry === "string" ? payload.industry.trim() : "";
  const language =
    typeof payload.language === "string" &&
    /^[a-z]{2}(?:-[A-Z]{2})?$/.test(payload.language)
      ? payload.language
      : "es";
  const platforms = Array.isArray(payload.platforms)
    ? [
        ...new Set(
          payload.platforms.filter(
            (platform): platform is string =>
              typeof platform === "string" &&
              ALLOWED_PLATFORMS.has(platform)
          )
        ),
      ]
    : [];

  return { name, industry, language, platforms };
}

export async function GET() {
  if (isLocalMysql()) {
    return Response.json({ error: "No disponible con el proveedor local." }, { status: 501 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });

  const smarttalkAdmin = createAdminClient();
  const publicAdmin = createAdminClient("public");
  const { data: agent } = await smarttalkAdmin
    .from("agents")
    .select("id, organization_id, member_type")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return Response.json({ error: "Agente no encontrado." }, { status: 404 });

  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && assignedBrandIds.length === 0) {
    return Response.json({ clients: [] });
  }

  let query = publicAdmin
    .from("cm_clients")
    .select("id, name, industry, platforms, status, smarttalk_organization_id")
    .eq("smarttalk_organization_id", agent.organization_id)
    .order("name");
  if (assignedBrandIds) query = query.in("id", assignedBrandIds);

  const { data, error } = await query;
  if (error) return Response.json({ error: "No fue posible cargar las marcas." }, { status: 500 });

  const clients = (data || []) as Record<string, unknown>[];

  // Canales que una reactivación no pudo restaurar. Viaja con el listado —y no
  // sólo en la respuesta del POST— para que el aviso sobreviva a una recarga:
  // tras reactivar, la marca ya no está pausada y sin este dato no quedaría en
  // la interfaz ninguna señal de que un canal se quedó fuera.
  const needsReconnection = await getChannelsNeedingReconnection(
    agent.organization_id,
    clients.map((client) => client.id as string),
  );

  return Response.json({
    clients: clients.map((client) => ({
      ...client,
      needs_reconnection: needsReconnection.get(client.id as string) || [],
    })),
  });
}

export async function POST(request: NextRequest) {
  const input = normalizeBody(await request.json().catch(() => null));
  if (!input.name || input.name.length > 120) {
    return Response.json(
      { error: "El nombre es requerido y debe tener máximo 120 caracteres." },
      { status: 400 }
    );
  }
  if (input.industry.length > 120) {
    return Response.json(
      { error: "La industria debe tener máximo 120 caracteres." },
      { status: 400 }
    );
  }

  if (isLocalMysql()) {
    const cmUserId = request.cookies.get("cm_user_id")?.value;
    if (!cmUserId) {
      return Response.json({ error: "No autorizado." }, { status: 401 });
    }

    const id = randomUUID();
    await mysqlQuery(
      `INSERT INTO ${quoteId("cm_clients")} (${quoteId("id")}, ${quoteId("user_id")}, ${quoteId("name")}, ${quoteId("industry")}, ${quoteId("platforms")}, ${quoteId("language")}, ${quoteId("status")}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        cmUserId,
        input.name,
        input.industry || null,
        JSON.stringify(input.platforms),
        input.language,
        "onboarding",
      ]
    );
    await mysqlQuery(
      `INSERT INTO ${quoteId("cm_activity_log")} (${quoteId("id")}, ${quoteId("user_id")}, ${quoteId("action")}, ${quoteId("status")}) VALUES (?, ?, ?, ?)`,
      [
        randomUUID(),
        cmUserId,
        `Nuevo cliente agregado: ${input.name}`,
        "success",
      ]
    );
    return Response.json({ client: { id } }, { status: 201 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const smarttalkAdmin = createAdminClient();
  const publicAdmin = createAdminClient("public");
  const [{ data: agent }, { data: cmUser }] = await Promise.all([
    smarttalkAdmin
      .from("agents")
      .select("id, organization_id, role, is_super_admin")
      .eq("id", user.id)
      .maybeSingle(),
    publicAdmin
      .from("cm_users")
      .select("id, role")
      .eq("email", user.email.toLowerCase())
      .maybeSingle(),
  ]);

  if (!agent || !cmUser) {
    return Response.json(
      { error: "La cuenta no está vinculada a una agencia." },
      { status: 403 }
    );
  }
  const isSuperAdmin = agent.is_super_admin === true;
  if (!isSuperAdmin && agent.role !== "admin") {
    return Response.json(
      { error: "Solo un administrador puede crear marcas." },
      { status: 403 }
    );
  }

  const billingDecision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.BRANDS_TOTAL,
    requestedUnits: 1,
    source: "api/cm/clients",
  });
  if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

  const capacity = await reserveBillingCapacity({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.BRANDS_TOTAL,
    requestedUnits: 1,
  });
  if (capacity.status === "denied") {
    return billingCapacityDeniedResponse(billingDecision, capacity);
  }
  if (capacity.status === "error") return billingCapacityErrorResponse();
  const reservationId = capacity.status === "reserved" ? capacity.reservationId : null;

  const { data: client, error } = await publicAdmin
    .from("cm_clients")
    .insert({
      user_id: cmUser.id,
      smarttalk_organization_id: agent.organization_id,
      name: input.name,
      industry: input.industry || null,
      platforms: input.platforms,
      language: input.language,
      status: "onboarding",
    })
    .select("*")
    .single();

  if (error) {
    if (reservationId) await releaseBillingCapacity(reservationId);
    console.error("[cm/clients] create failed", {
      code: error.code,
      organizationId: agent.organization_id,
    });
    return Response.json(
      { error: "No fue posible crear la marca." },
      { status: 500 }
    );
  }

  if (reservationId && !(await consumeBillingCapacity(reservationId, client.id))) {
    await releaseBillingCapacity(reservationId);
  }

  const { error: activityError } = await publicAdmin
    .from("cm_activity_log")
    .insert({
      user_id: cmUser.id,
      action: `Nuevo cliente agregado: ${input.name}`,
      status: "success",
    });
  if (activityError) {
    console.warn("[cm/clients] activity log failed", {
      code: activityError.code,
      clientId: client.id,
    });
  }

  return Response.json({ client }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const clientId = typeof payload?.clientId === "string"
    ? payload.clientId.trim()
    : typeof payload?.id === "string"
      ? payload.id.trim()
      : "";
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";

  if (!clientId || !name || name.length > 120) {
    return Response.json(
      { error: "clientId e name son requeridos; el nombre debe tener entre 1 y 120 caracteres." },
      { status: 400 },
    );
  }

  if (isLocalMysql()) {
    const cmUserId = request.cookies.get("cm_user_id")?.value;
    if (!cmUserId) return Response.json({ error: "No autorizado." }, { status: 401 });

    const rows = await mysqlQuery<Array<{ id: string }>>(
      `SELECT ${quoteId("id")} FROM ${quoteId("cm_clients")} WHERE ${quoteId("id")} = ? AND ${quoteId("user_id")} = ? LIMIT 1`,
      [clientId, cmUserId],
    );
    if (!rows[0]) return Response.json({ error: "Marca no encontrada." }, { status: 404 });

    await mysqlQuery(
      `UPDATE ${quoteId("cm_clients")} SET ${quoteId("name")} = ? WHERE ${quoteId("id")} = ? AND ${quoteId("user_id")} = ?`,
      [name, clientId, cmUserId],
    );
    return Response.json({ client: { id: clientId, name } });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });

  const smarttalkAdmin = createAdminClient();
  const publicAdmin = createAdminClient("public");
  const { data: agent } = await smarttalkAdmin
    .from("agents")
    .select("id, organization_id, role, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!agent) return Response.json({ error: "Agente no encontrado." }, { status: 404 });
  if (agent.role !== "admin" && agent.is_super_admin !== true) {
    return Response.json({ error: "Solo un administrador puede editar marcas." }, { status: 403 });
  }

  const { data: brand } = await publicAdmin
    .from("cm_clients")
    .select("id")
    .eq("id", clientId)
    .eq("smarttalk_organization_id", agent.organization_id)
    .maybeSingle();
  if (!brand) return Response.json({ error: "Marca no encontrada." }, { status: 404 });

  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && !assignedBrandIds.includes(clientId)) {
    return Response.json({ error: "No autorizado para esta marca." }, { status: 403 });
  }

  const { data: updated, error } = await publicAdmin
    .from("cm_clients")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("smarttalk_organization_id", agent.organization_id)
    .select("id, name, industry, platforms, status, smarttalk_organization_id, user_id, posts_this_month, brand_voice, language, created_at, updated_at")
    .single();

  if (error) {
    console.error("[cm/clients] rename failed", { code: error.code, clientId });
    return Response.json({ error: "No fue posible actualizar el nombre de la marca." }, { status: 500 });
  }

  return Response.json({ client: updated });
}
