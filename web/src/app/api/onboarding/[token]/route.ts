// Sprint 26 · Agente S · Onboarding self-service PUBLIC endpoint (sin auth).
//
// GET   /api/onboarding/<token>  → devuelve state + client info (no sensible)
// PATCH /api/onboarding/<token>  → cliente actualiza step/data (misma sesion magic-link)
//
// Verificamos HMAC del token; cruzamos SHA-256(token) contra
// cm_onboarding_state.invite_token_hash. Si válido y no expirado.

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyOnboardingToken,
  hashOnboardingToken,
} from "@/lib/onboarding/tokens";

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

async function loadContext(token: string) {
  const decoded = verifyOnboardingToken(token);
  if (!decoded.valid) {
    return { error: "Enlace expirado o invalido", status: 410 as const };
  }
  const admin = createAdminClient("public");
  const th = hashOnboardingToken(token);
  const { data: state, error } = await admin
    .from("cm_onboarding_state")
    .select(
      "id, client_id, organization_id, step, data, completed_steps, invite_expires_at, completed_at",
    )
    .eq("invite_token_hash", th)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 as const };
  if (!state) {
    return { error: "Enlace no encontrado", status: 410 as const };
  }
  return { state, decoded, admin };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await loadContext(token);
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }
  const { state, admin } = ctx;

  const [{ data: client }, { data: org }] = await Promise.all([
    admin
      .from("cm_clients")
      .select("id, name, brand_voice, industry, language")
      .eq("id", state.client_id)
      .maybeSingle(),
    createAdminClient()
      .from("organizations")
      .select("id, name")
      .eq("id", state.organization_id)
      .maybeSingle(),
  ]);

  return Response.json({
    state: {
      id: state.id,
      step: state.step,
      data: state.data,
      completed_steps: state.completed_steps,
      completed_at: state.completed_at,
    },
    client: client
      ? {
          id: (client as { id: string }).id,
          name: (client as { name: string }).name,
          language: (client as { language?: string | null }).language ?? null,
        }
      : null,
    agency: org
      ? { name: (org as { name: string }).name }
      : null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await loadContext(token);
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }
  const { state, admin } = ctx;

  if (state.completed_at) {
    return Response.json(
      { error: "Onboarding ya completado" },
      { status: 409 },
    );
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
      : state.step;
  const patchData =
    b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : {};
  const mergedData = {
    ...(state.data as Record<string, unknown>),
    ...patchData,
  };

  const prevCompleted = Array.isArray(state.completed_steps)
    ? (state.completed_steps as string[])
    : [];
  const completedSteps = Array.from(new Set([...prevCompleted, state.step]));

  const upd: Record<string, unknown> = {
    step: nextStep,
    data: mergedData,
    completed_steps: completedSteps,
    updated_at: new Date().toISOString(),
  };
  if (nextStep === "done") {
    upd.completed_at = new Date().toISOString();
  }

  const { data: updated, error: uerr } = await admin
    .from("cm_onboarding_state")
    .update(upd)
    .eq("id", state.id)
    .select("id, step, data, completed_steps, completed_at")
    .maybeSingle();
  if (uerr) {
    return Response.json({ error: uerr.message }, { status: 500 });
  }

  return Response.json({ state: updated });
}
