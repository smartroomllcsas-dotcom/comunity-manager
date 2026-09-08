/**
 * Datos de la página Home: "¿cómo va mi negocio hoy?" para una empresa (marca).
 * Todo en lenguaje de negocio: leads, chats esperando, lo que atendió la IA,
 * reuniones, canales conectados y embudo. Sólo lectura.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrandChannelSummaries } from "@/lib/smarttalk/brand-channel-summary";
import type { BrandChannelKind, BrandChannelState } from "@/lib/smarttalk/brand-channel-status";

export type HomeBrand = { id: string; name: string };

export type HomeChannel = {
  kind: BrandChannelKind;
  label: string;
  state: BrandChannelState | "activity";
  name: string | null;
  hint: string;
};

export type HomeConversation = {
  id: string;
  contactId: string | null;
  contactName: string;
  channelType: string;
  preview: string;
  lastMessageAt: string | null;
  unread: number;
};

export type HomeLead = {
  id: string;
  name: string;
  phone: string | null;
  stage: string | null;
  source: string;
  createdAt: string;
  meeting: string | null;
};

export type HomeMeeting = { contactId: string; name: string; when: string; startsAt: string | null; title: string | null };

export type HomeOverview = {
  brand: HomeBrand;
  today: {
    newLeads: number;
    waitingReply: number;
    botReplies: number;
    humanReplies: number;
    meetingsUpcoming: number;
    qualifiedWeek: number;
  };
  attention: HomeConversation[];
  unreachableLeads: number;
  pendingSync: number;
  channels: HomeChannel[];
  funnel: Array<{ stage: string; count: number }>;
  recentLeads: HomeLead[];
  meetings: HomeMeeting[];
  week: Array<{ day: string; leads: number; replies: number }>;
};

const CHANNEL_LABEL: Record<BrandChannelKind, string> = {
  whatsapp: "WhatsApp (API oficial)",
  whatsappQr: "WhatsApp por QR",
  instagram: "Instagram",
  messenger: "Messenger",
};

const STAGE_ORDER = ["Nuevo", "Tibio", "Calificado", "Oportunidad", "Cliente", "Perdido"];

function startOfDayBogota(offsetDays = 0): Date {
  // Colombia no tiene horario de verano: UTC-5 fijo.
  const now = new Date();
  const bogota = new Date(now.getTime() - 5 * 3600 * 1000);
  const d = new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate() + offsetDays, 5, 0, 0));
  return d;
}

function sourceLabel(cf: Record<string, unknown> | null, channelType?: string | null): string {
  const src = String(cf?.source || "");
  if (src === "facebook_lead_form") return "Formulario de Facebook";
  const t = (channelType || "").toLowerCase();
  if (t === "waha") return "WhatsApp por QR";
  if (t.includes("whatsapp")) return "WhatsApp";
  if (t === "instagram") return "Instagram";
  if (t === "facebook_messenger") return "Messenger";
  return "Directo";
}

export async function loadHomeOverview(input: { orgId: string; brand: HomeBrand }): Promise<HomeOverview> {
  const admin = createAdminClient("smarttalk");
  const { orgId, brand } = input;
  const todayStart = startOfDayBogota(0).toISOString();
  const weekStart = startOfDayBogota(-6).toISOString();
  const nowIso = new Date().toISOString();
  const in7d = new Date(Date.now() + 7 * 86400_000).toISOString();

  const [stagesRes, contactsRes, convsRes, channelsRes, botRes, humanRes, summaries, wahaEvents] = await Promise.all([
    admin.from("lifecycle_stages").select("id, name, position").eq("organization_id", orgId),
    admin
      .from("contacts")
      .select("id, name, wa_id, created_at, lifecycle_stage_id, custom_fields, visibility_status")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("conversations")
      .select("id, contact_id, channel_id, status, unread_count, last_message_preview, updated_at, assigned_agent_id, metadata")
      .eq("brand_id", brand.id)
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(300),
    admin.from("channels").select("id, type, name, status").eq("brand_id", brand.id),
    admin
      .from("messages")
      .select("created_at, conversation_id, conversations!inner(brand_id)")
      .eq("direction", "outbound")
      .eq("is_bot", true)
      .eq("conversations.brand_id", brand.id)
      .gte("created_at", weekStart)
      .limit(5000),
    admin
      .from("messages")
      .select("created_at, conversation_id, conversations!inner(brand_id)")
      .eq("direction", "outbound")
      .eq("is_bot", false)
      .eq("conversations.brand_id", brand.id)
      .gte("created_at", todayStart)
      .limit(5000),
    loadBrandChannelSummaries(orgId, [brand.id]).catch(() => ({} as Record<string, never>)),
    admin
      .from("webhook_events")
      .select("id")
      .eq("channel", "waha")
      .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .limit(1),
  ]);

  const stages = ((stagesRes.data || []) as Array<{ id: string; name: string; position: number | null }>).sort(
    (a, b) => STAGE_ORDER.indexOf(a.name) - STAGE_ORDER.indexOf(b.name)
  );
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const contacts = ((contactsRes.data || []) as Array<{
    id: string; name: string | null; wa_id: string | null; created_at: string; lifecycle_stage_id: string | null;
    custom_fields: Record<string, unknown> | null; visibility_status: string | null;
  }>).filter((c) => c.visibility_status !== "restricted");
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const channels = (channelsRes.data || []) as Array<{ id: string; type: string; name: string | null; status: string | null }>;
  const channelType = new Map(channels.map((c) => [c.id, c.type]));
  const convs = (convsRes.data || []) as Array<{
    id: string; contact_id: string | null; channel_id: string | null; unread_count: number | null;
    last_message_preview: string | null; updated_at: string; assigned_agent_id: string | null;
  }>;

  // Hoy
  const newLeads = contacts.filter((c) => c.created_at >= todayStart).length;
  const waiting = convs.filter((c) => (c.unread_count ?? 0) > 0);
  const botMsgs = (botRes.data || []) as Array<{ created_at: string }>;
  const botReplies = botMsgs.filter((m) => m.created_at >= todayStart).length;
  const humanReplies = ((humanRes.data || []) as Array<{ created_at: string }>).length;
  const meetings = contacts
    .filter((c) => c.custom_fields?.cita_estado === "agendada" && typeof c.custom_fields?.cita_inicio === "string")
    .map((c) => ({
      contactId: c.id,
      name: c.name || c.wa_id || "Sin nombre",
      when: String(c.custom_fields?.cita_cuando || ""),
      startsAt: String(c.custom_fields?.cita_inicio || ""),
      title: typeof c.custom_fields?.cita_titulo === "string" ? (c.custom_fields.cita_titulo as string) : null,
    }))
    .filter((m) => m.startsAt >= nowIso)
    .sort((a, b) => (a.startsAt || "").localeCompare(b.startsAt || ""));
  const meetingsUpcoming = meetings.filter((m) => (m.startsAt || "") <= in7d).length;
  const qualifiedStages = new Set(stages.filter((s) => ["Calificado", "Oportunidad", "Cliente"].includes(s.name)).map((s) => s.id));
  const qualifiedWeek = contacts.filter((c) => c.created_at >= weekStart && c.lifecycle_stage_id && qualifiedStages.has(c.lifecycle_stage_id)).length;

  // Necesita atención
  const attention: HomeConversation[] = waiting.slice(0, 8).map((c) => {
    const contact = c.contact_id ? contactById.get(c.contact_id) : undefined;
    return {
      id: c.id,
      contactId: c.contact_id,
      contactName: contact?.name || contact?.wa_id || "Sin nombre",
      channelType: c.channel_id ? channelType.get(c.channel_id) || "" : "",
      preview: c.last_message_preview || "",
      lastMessageAt: c.updated_at,
      unread: c.unread_count ?? 0,
    };
  });

  // Leads de formulario: no contactables y pendientes de sincronizar
  const formLeads = contacts.filter((c) => c.custom_fields?.source === "facebook_lead_form");
  const touch = (c: (typeof contacts)[number]) => String(c.custom_fields?.wa_first_touch || "");
  const unreachableLeads = formLeads.filter((c) => touch(c).startsWith("fallido (") || touch(c) === "no_enviado (invalid_phone)").length;
  const stopIds = new Set(stages.filter((s) => s.name === "Perdido").map((s) => s.id));
  const pendingSync = formLeads.filter(
    (c) => touch(c) !== "enviado" && !touch(c).startsWith("fallido (") && touch(c) !== "no_enviado (invalid_phone)" &&
      !(c.lifecycle_stage_id && stopIds.has(c.lifecycle_stage_id)) && c.custom_fields?.do_not_contact !== true
  ).length;

  // Canales
  const summary = (summaries as Record<string, Record<BrandChannelKind, { state: BrandChannelState; name: string | null; channelId: string | null }>>)[brand.id];
  const hasWahaActivity = ((wahaEvents.data || []) as unknown[]).length > 0;
  const kinds: BrandChannelKind[] = ["whatsapp", "whatsappQr", "instagram", "messenger"];
  const homeChannels: HomeChannel[] = kinds.map((kind) => {
    const s = summary?.[kind];
    let state: HomeChannel["state"] = s?.state ?? "missing";
    let hint = "";
    if (kind === "whatsappQr" && s?.channelId && hasWahaActivity && state !== "active") {
      state = "activity";
      hint = "Recibiendo mensajes en las últimas 24 h";
    }
    if (state === "missing") hint = "Sin conectar";
    if (state === "active") hint = "Conectado";
    if (state === "error") hint = "Con error: revisar en Canales";
    if (state === "disconnected" && !hint) hint = "Desconectado";
    return { kind, label: CHANNEL_LABEL[kind], state, name: s?.name ?? null, hint };
  });

  // Embudo
  const funnel = stages.map((s) => ({ stage: s.name, count: contacts.filter((c) => c.lifecycle_stage_id === s.id).length }));
  const sinEtapa = contacts.filter((c) => !c.lifecycle_stage_id).length;
  if (sinEtapa > 0) funnel.unshift({ stage: "Sin etapa", count: sinEtapa });

  // Últimos leads
  const convByContact = new Map<string, (typeof convs)[number]>();
  for (const c of convs) if (c.contact_id && !convByContact.has(c.contact_id)) convByContact.set(c.contact_id, c);
  const recentLeads: HomeLead[] = contacts.slice(0, 8).map((c) => {
    const conv = convByContact.get(c.id);
    return {
      id: c.id,
      name: c.name || c.wa_id || "Sin nombre",
      phone: c.wa_id && /^\d{7,}$/.test(c.wa_id) ? `+${c.wa_id}` : null,
      stage: c.lifecycle_stage_id ? stageName.get(c.lifecycle_stage_id) || null : null,
      source: sourceLabel(c.custom_fields, conv?.channel_id ? channelType.get(conv.channel_id) : null),
      createdAt: c.created_at,
      meeting: c.custom_fields?.cita_estado === "agendada" ? String(c.custom_fields?.cita_cuando || "agendada") : null,
    };
  });

  // Semana: leads nuevos y respuestas de la IA por día
  const week: HomeOverview["week"] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfDayBogota(-i);
    const dayEnd = startOfDayBogota(-i + 1);
    const a = dayStart.toISOString();
    const b = dayEnd.toISOString();
    week.push({
      day: dayStart.toLocaleDateString("es-CO", { weekday: "short", timeZone: "America/Bogota" }),
      leads: contacts.filter((c) => c.created_at >= a && c.created_at < b).length,
      replies: botMsgs.filter((m) => m.created_at >= a && m.created_at < b).length,
    });
  }

  return {
    brand,
    today: { newLeads, waitingReply: waiting.length, botReplies, humanReplies, meetingsUpcoming, qualifiedWeek },
    attention,
    unreachableLeads,
    pendingSync,
    channels: homeChannels,
    funnel,
    recentLeads,
    meetings: meetings.slice(0, 5),
    week,
  };
}

/** Marcas visibles para el usuario (mismo criterio que /api/cm/clients). */
export async function loadHomeBrands(userId: string, orgId: string): Promise<HomeBrand[]> {
  const smarttalk = createAdminClient("smarttalk");
  const pub = createAdminClient("public");
  const { data: agent } = await smarttalk
    .from("agents")
    .select("id, organization_id, member_type, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  let allowed: string[] | null = null;
  if (agent) {
    const { getAgentBrandIds } = await import("@/lib/smarttalk/brand-scope");
    allowed = await getAgentBrandIds(agent as never);
  }
  if (allowed && allowed.length === 0) return [];
  let q = pub.from("cm_clients").select("id, name").eq("smarttalk_organization_id", orgId).order("name");
  if (allowed) q = q.in("id", allowed);
  const { data } = await q;
  return ((data || []) as HomeBrand[]).filter((b) => !/^\[QA/i.test(b.name));
}

/**
 * Identidad para la Home: organización de SmartTalk + usuario.
 * `identify()` en la sesión legacy devuelve como orgId el id de la primera
 * marca (cm_clients), no la organización; por eso la Home decía "no tienes
 * empresa". Se resuelve igual que /api/cm/clients: usuario de Supabase Auth →
 * fila en smarttalk.agents → organization_id. Si no hay sesión de Auth, se
 * traduce la marca a su organización.
 */
export async function resolveHomeIdentity(): Promise<{ userId: string; orgId: string } | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: agent } = await createAdminClient("smarttalk")
        .from("agents")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      if (agent?.organization_id) return { userId: user.id, orgId: agent.organization_id as string };
    }
  } catch {
    // sigue con la sesión legacy
  }
  try {
    const { identify } = await import("@/lib/identify");
    const ent = await identify();
    if (!ent.userId || !ent.orgId) return null;
    const { data: brand } = await createAdminClient("public")
      .from("cm_clients")
      .select("smarttalk_organization_id")
      .eq("id", ent.orgId)
      .maybeSingle();
    const orgId = (brand?.smarttalk_organization_id as string | null) || ent.orgId;
    return { userId: ent.userId, orgId };
  } catch {
    return null;
  }
}
