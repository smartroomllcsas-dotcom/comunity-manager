/**
 * Enviar A MANO el primer contacto con la plantilla Utility de la empresa.
 *
 * Desde el 16 de septiembre esto ocurre solo: si Meta bloquea la plantilla de
 * marketing (131049 y parecidos), la plataforma reintenta con la Utility antes
 * de avisar al asesor. Pero los leads que fallaron ANTES de ese cambio se
 * quedaron sin primer contacto, y para esos hace falta un botón.
 *
 * GET  → si este contacto puede recibirlo y con qué plantilla.
 * POST → lo envía y deja nota en el chat.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { getFirstTouchUtilitySettings } from "@/lib/whatsapp/cloud/first-touch-utility";

type ContactRow = {
  id: string;
  name: string | null;
  wa_id: string | null;
  brand_id: string | null;
  organization_id: string;
  custom_fields: Record<string, unknown> | null;
};

/**
 * `smarttalk.contacts` no tiene columna `phone`: el número llega del formulario
 * y queda en `custom_fields.phone`. `wa_id` es el de WhatsApp cuando existe.
 */
function phoneOf(contact: ContactRow): string {
  const cf = (contact.custom_fields || {}) as Record<string, unknown>;
  const raw =
    contact.wa_id ||
    (typeof cf.phone === "string" ? cf.phone : "") ||
    (typeof cf.phone_number === "string" ? cf.phone_number : "");
  return String(raw || "").replace(/[^\d]/g, "");
}

async function authorize(contactId: string) {
  const supabase = await createClient();
  const admin = createAdminClient("smarttalk");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, is_super_admin, role, member_type")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };

  const { data: contact } = await admin
    .from("contacts")
    .select("id, name, wa_id, brand_id, organization_id, custom_fields")
    .eq("id", contactId)
    .eq("organization_id", agent.organization_id)
    .maybeSingle();
  if (!contact) return { error: NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 }) };

  const assignedBrandIds = agent.is_super_admin ? null : await getAgentBrandIds(agent);
  if (assignedBrandIds && contact.brand_id && !assignedBrandIds.includes(contact.brand_id)) {
    return { error: NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 }) };
  }
  return { admin, agent, contact: contact as ContactRow };
}

/** Lo que la pantalla necesita para decidir si muestra el botón. */
async function describe(contact: ContactRow) {
  const cf = (contact.custom_fields || {}) as Record<string, unknown>;
  const firstTouch = typeof cf.wa_first_touch === "string" ? cf.wa_first_touch : null;
  const failed = Boolean(firstTouch && /fallid/i.test(firstTouch));
  const phone = phoneOf(contact);

  if (!contact.brand_id) return { available: false, reason: "El contacto no tiene empresa asignada.", failed, firstTouch };
  if (!phone || phone.length < 7) return { available: false, reason: "El contacto no tiene un número válido.", failed, firstTouch };

  const utility = await getFirstTouchUtilitySettings(contact.brand_id);
  if (!utility.enabled || !utility.template_id) {
    return {
      available: false,
      reason: "Esta empresa no tiene plantilla Utility de respaldo. Elígela en Automatización de leads.",
      failed,
      firstTouch,
    };
  }

  const admin = createAdminClient("smarttalk");
  const { data: tpl } = await admin
    .from("cm_wa_templates")
    .select("name, status")
    .eq("id", utility.template_id)
    .maybeSingle();

  return {
    available: true,
    templateName: (tpl?.name as string) || "plantilla Utility",
    templateStatus: (tpl?.status as string) || null,
    failed,
    firstTouch,
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  return NextResponse.json(await describe(auth.contact));
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  const { admin, agent, contact } = auth;

  const state = await describe(contact);
  if (!state.available) return NextResponse.json({ error: state.reason }, { status: 422 });

  const phone = phoneOf(contact);
  const { retryFirstTouchWithUtility } = await import("@/lib/whatsapp/cloud/lead-engagement");
  const result = await retryFirstTouchWithUtility({
    clientId: contact.brand_id as string,
    phone,
    leadName: contact.name,
  });

  if (!result.sent) {
    return NextResponse.json(
      { error: `WhatsApp no lo aceptó: ${result.reason || "sin motivo"}` },
      { status: 502 }
    );
  }

  // Queda registrado en la ficha y en el chat, con el asesor que lo mandó.
  const cf = { ...((contact.custom_fields || {}) as Record<string, unknown>) };
  cf.wa_first_touch = `enviado a mano con plantilla Utility (${state.templateName})`;
  delete cf.wa_first_touch_failed_at;
  await admin.from("contacts").update({ custom_fields: cf }).eq("id", contact.id);

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("contact_id", contact.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conv?.id) {
    const { addSystemNote } = await import("@/lib/smarttalk/internal-notes");
    await addSystemNote({
      conversationId: conv.id as string,
      agentId: agent.id as string,
      content: `Primer contacto enviado a mano con la plantilla Utility "${state.templateName}".`,
    });
  }

  return NextResponse.json({ ok: true, detail: `Enviado con "${state.templateName}"` });
}
