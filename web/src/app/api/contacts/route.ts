import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  billingDeniedResponse,
  checkBillingFeature,
} from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  getAgentBrandIds,
  getBrandInOrganization,
} from "@/lib/smarttalk/brand-scope";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 80;

type ContactPayload = {
  brandId?: unknown;
  name?: unknown;
  wa_id?: unknown;
  phone?: unknown;
  email?: unknown;
  tags?: unknown;
};

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\s\-()]/g, "");
}

function normalizeTags(value: unknown) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(/[,;]/)
    : [];

  return [
    ...new Set(
      rawTags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH))
        .filter(Boolean)
    ),
  ].slice(0, MAX_TAGS);
}

function parsePayload(body: unknown) {
  const payload = (body && typeof body === "object" ? body : {}) as ContactPayload;
  const brandId = typeof payload.brandId === "string" ? payload.brandId.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const waId = normalizePhone(payload.wa_id ?? payload.phone);
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

  return {
    brandId,
    name,
    waId,
    email,
    tags: normalizeTags(payload.tags),
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient("smarttalk");
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id, organization_id, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (agentError) return Response.json({ error: "No fue posible validar el usuario." }, { status: 500 });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const input = parsePayload(body);
  if (!input.brandId) {
    return Response.json({ error: "La marca es requerida." }, { status: 400 });
  }
  if (!input.name || input.name.length > 160) {
    return Response.json({ error: "El nombre es requerido y debe tener máximo 160 caracteres." }, { status: 400 });
  }
  if (!input.waId || !/^\+?\d{7,30}$/.test(input.waId)) {
    return Response.json({ error: "El teléfono debe tener entre 7 y 30 dígitos." }, { status: 400 });
  }
  if (input.email && (input.email.length > 254 || !/^\S+@\S+\.\S+$/.test(input.email))) {
    return Response.json({ error: "El correo electrónico no es válido." }, { status: 400 });
  }

  const [brand, assignedBrandIds] = await Promise.all([
    getBrandInOrganization(input.brandId, agent.organization_id),
    getAgentBrandIds(agent),
  ]);
  if (!brand || (assignedBrandIds && !assignedBrandIds.includes(input.brandId))) {
    return Response.json({ error: "No autorizado para esta marca." }, { status: 403 });
  }

  const { data: existingContact, error: existingError } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", agent.organization_id)
    .eq("wa_id", input.waId)
    .maybeSingle();
  if (existingError) return Response.json({ error: "No fue posible validar el contacto." }, { status: 500 });
  if (existingContact) {
    return Response.json({ error: "Ya existe un contacto con este teléfono." }, { status: 409 });
  }

  const billingDecision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.CONTACTS_TOTAL,
    requestedUnits: 1,
    source: "api/contacts",
  });
  if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

  const { data: contact, error } = await admin
    .from("contacts")
    .insert({
      organization_id: agent.organization_id,
      brand_id: input.brandId,
      wa_id: input.waId,
      name: input.name,
      tags: input.tags,
      custom_fields: input.email ? { email: input.email } : {},
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "Ya existe un contacto con este teléfono." }, { status: 409 });
    }
    console.error("[contacts] create failed", {
      code: error.code,
      organizationId: agent.organization_id,
      brandId: input.brandId,
    });
    return Response.json({ error: "No fue posible crear el contacto." }, { status: 500 });
  }

  return Response.json({ contact }, { status: 201 });
}
