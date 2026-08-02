// Sprint 26 · Agente S · Update onboarding step (auth agencia).
//
// PATCH /api/onboarding/<client_id>/step
// Body: { step: 'welcome'|..., data: {...} }
//
// Solo la agencia autenticada duena del cliente puede tocar este endpoint.
// Para self-service (cliente via magic-link) usa PATCH /api/onboarding/<token>.

import { NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VALID_STEPS = [
  "welcome",
  "brand",
  "platforms",
  "content_pillars",
  "preferences",
  "review",
  "done",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ client_id: string }> },
) {
  const { client_id } = await params;
  if (!client_id) {
    return Response.json({ error: "client_id requerido" }, { status: 400 });
  }

  const supa = await createServerSupabase();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalido" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const nextStep =
    typeof b.step === "string" &&
    (VALID_STEPS as readonly string[]).includes(b.step)
      ? (b.step as (typeof VALID_STEPS)[number])
      : null;
  const patchData =
    b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : {};

  const publicAdmin = createAdminClient("public");
  const smarttalkAdmin = createAdminClient();

  // Verificar acceso.
  const [{ data: client }, { data: agent }] = await Promise.all([
    publicAdmin
      .from("cm_clients")
      .select("id, smarttalk_organization_id")
      .eq("id", client_id)
      .maybeSingle(),
    smarttalkAdmin
      .from("agents")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  if (!client) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }
  const clientOrgId =
    (client as { smarttalk_organization_id?: string }).smarttalk_organization_id ??
    null;
  const userOrgId =
    (agent as { organization_id?: string } | null)?.organization_id ?? null;
  if (clientOrgId && userOrgId && clientOrgId !== userOrgId) {
    return Response.json(
      { error: "Sin acceso a este cliente" },
      { status: 403 },
    );
  }

  const { data: state, error: sErr } = await publicAdmin
    .from("cm_onboarding_state")
    .select("id, step, data, completed_steps")
    .eq("client_id", client_id)
    .maybeSingle();
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 });
  if (!state) {
    return Response.json({ error: "State no existe" }, { status: 404 });
  }

  const mergedData = {
    ...(state.data as Record<string, unknown>),
    ...patchData,
  };
  const prevCompleted = Array.isArray(state.completed_steps)
    ? (state.completed_steps as string[])
    : [];
  const completedSteps = Array.from(new Set([...prevCompleted, state.step]));

  const upd: Record<string, unknown> = {
    data: mergedData,
    completed_steps: completedSteps,
    updated_at: new Date().toISOString(),
  };
  if (nextStep) upd.step = nextStep;
  if (nextStep === "done") upd.completed_at = new Date().toISOString();

  const { data: updated, error: uerr } = await publicAdmin
    .from("cm_onboarding_state")
    .update(upd)
    .eq("id", state.id)
    .select("id, step, data, completed_steps, completed_at")
    .maybeSingle();
  if (uerr) return Response.json({ error: uerr.message }, { status: 500 });

  return Response.json({ state: updated });
}
