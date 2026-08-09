// Enforcement backend · POST /api/chatbot/flows
// ---------------------------------------------------------------------------
// Creación server-side de flujos de chatbot con billing enforcement.
// Antes, FlowEditor.tsx insertaba directamente en `chatbot_flows` desde el
// navegador, saltándose cualquier control de plan. Este endpoint centraliza la
// creación para poder aplicar checkBillingFeature(AUTOMATION_FLOWS) y devolver
// 402 cuando no hay suscripción activa o se alcanzó el límite de flujos.
//
// El superadmin queda sin límites (lo resuelve checkBillingFeature).
// automations.flows se contabiliza como COUNT de filas en `chatbot_flows`
// (ver getCurrentUsage en lib/billing/service.ts), por lo que el propio INSERT
// es el registro de uso: no se llama a recordBillingUsage aquí.

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  billingCapacityDeniedResponse,
  billingCapacityErrorResponse,
  billingDeniedResponse,
  checkBillingFeature,
  consumeBillingCapacity,
  releaseBillingCapacity,
  reserveBillingCapacity,
} from "@/lib/billing/service";

const ALLOWED_TRIGGER_TYPES = new Set(["keyword", "first_message", "menu_option"]);

interface FlowPayload {
  name: string;
  trigger_type: string;
  trigger_value: string;
  is_active: boolean;
  flow_data: { nodes: unknown[] };
}

function validate(body: unknown): { ok: true; value: FlowPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body inválido" };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "El nombre del flujo es requerido" };

  const trigger_type = typeof b.trigger_type === "string" ? b.trigger_type : "keyword";
  if (!ALLOWED_TRIGGER_TYPES.has(trigger_type)) {
    return { ok: false, error: `trigger_type inválido: ${trigger_type}` };
  }

  const trigger_value = typeof b.trigger_value === "string" ? b.trigger_value : "";
  const is_active = b.is_active === true;

  const rawFlow = b.flow_data as { nodes?: unknown } | undefined;
  const nodes = Array.isArray(rawFlow?.nodes) ? (rawFlow!.nodes as unknown[]) : [];

  return {
    ok: true,
    value: { name, trigger_type, trigger_value, is_active, flow_data: { nodes } },
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const rl = await rateLimit(`chatbot-flows:create:${user.id}`, 30, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Demasiadas solicitudes. Intenta más tarde.", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, organization_id")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = validate(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  // Billing enforcement (flujos/chatbot): automations.flows.
  const decision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.AUTOMATION_FLOWS,
    requestedUnits: 1,
    source: "api/chatbot/flows",
  });
  if (!decision.allowed) return billingDeniedResponse(decision);

  const capacity = await reserveBillingCapacity({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.AUTOMATION_FLOWS,
    requestedUnits: 1,
  });
  if (capacity.status === "denied") return billingCapacityDeniedResponse(decision, capacity);
  if (capacity.status === "error") return billingCapacityErrorResponse();
  const reservationId = capacity.status === "reserved" ? capacity.reservationId : null;

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("chatbot_flows")
    .insert({ ...parsed.value, organization_id: agent.organization_id })
    .select("id")
    .single();

  if (error || !inserted) {
    if (reservationId) await releaseBillingCapacity(reservationId);
    return Response.json(
      { error: error?.message || "No se pudo crear el flujo" },
      { status: 500 },
    );
  }

  if (reservationId && !(await consumeBillingCapacity(reservationId, inserted.id))) {
    await releaseBillingCapacity(reservationId);
  }

  return Response.json({ id: inserted.id }, { status: 201 });
}
