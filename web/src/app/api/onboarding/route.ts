// Sprint 26 · Agente S · Onboarding wizard API (agencia)
//
// POST /api/onboarding      → crea state para un client + genera invite token opcional
// GET  /api/onboarding?client_id=X → lee state actual (agency-side)
//
// Auth: cookie Supabase → auth.getUser() (agencia).

import { NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  issueOnboardingToken,
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
type Step = (typeof VALID_STEPS)[number];

function baseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return `${proto}://${host}`;
}

async function resolveAgencyOrg(userId: string): Promise<string | null> {
  const smarttalkAdmin = createAdminClient();
  const { data: agent } = await smarttalkAdmin
    .from("agents")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  return (agent as { organization_id?: string } | null)?.organization_id ?? null;
}

export async function POST(req: NextRequest) {
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

  const clientId = typeof b.client_id === "string" ? b.client_id : "";
  const step: Step =
    typeof b.step === "string" && (VALID_STEPS as readonly string[]).includes(b.step)
      ? (b.step as Step)
      : "welcome";
  const data = (b.data && typeof b.data === "object" ? b.data : {}) as Record<
    string,
    unknown
  >;
  const withInvite = Boolean(b.with_invite);
  const ttlHours =
    typeof b.ttl_hours === "number" && b.ttl_hours > 0 && b.ttl_hours <= 24 * 90
      ? b.ttl_hours
      : undefined;

  if (!clientId) {
    return Response.json({ error: "client_id requerido" }, { status: 400 });
  }

  const publicAdmin = createAdminClient("public");

  const { data: client, error: clientErr } = await publicAdmin
    .from("cm_clients")
    .select("id, name, smarttalk_organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) {
    return Response.json({ error: clientErr.message }, { status: 500 });
  }
  if (!client) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const userOrgId = await resolveAgencyOrg(user.id);
  const orgId =
    (client as { smarttalk_organization_id?: string }).smarttalk_organization_id ??
    userOrgId;
  if (!orgId) {
    return Response.json(
      { error: "No se pudo resolver organization_id" },
      { status: 400 },
    );
  }
  if (
    (client as { smarttalk_organization_id?: string }).smarttalk_organization_id &&
    userOrgId &&
    (client as { smarttalk_organization_id?: string }).smarttalk_organization_id !==
      userOrgId
  ) {
    return Response.json(
      { error: "Sin acceso a este cliente" },
      { status: 403 },
    );
  }

  let invite:
    | { token: string; url: string; expires_at: string }
    | null = null;
  let inviteHash: string | null = null;
  let inviteExpiresAt: string | null = null;
  if (withInvite) {
    const issued = issueOnboardingToken(clientId, ttlHours);
    inviteHash = hashOnboardingToken(issued.token);
    inviteExpiresAt = new Date(issued.expiresAt).toISOString();
    invite = {
      token: issued.token,
      url: `${baseUrl(req)}/onboard/${issued.token}`,
      expires_at: inviteExpiresAt,
    };
  }

  const upsertPayload: Record<string, unknown> = {
    client_id: clientId,
    organization_id: orgId,
    step,
    data,
    updated_at: new Date().toISOString(),
  };
  if (inviteHash) upsertPayload.invite_token_hash = inviteHash;
  if (inviteExpiresAt) upsertPayload.invite_expires_at = inviteExpiresAt;

  const { data: row, error: upErr } = await publicAdmin
    .from("cm_onboarding_state")
    .upsert(upsertPayload, { onConflict: "client_id" })
    .select(
      "id, client_id, step, data, completed_steps, invite_expires_at, completed_at",
    )
    .maybeSingle();
  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  return Response.json({ state: row, invite }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supa = await createServerSupabase();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const publicAdmin = createAdminClient("public");

  if (clientId) {
    const { data: row, error } = await publicAdmin
      .from("cm_onboarding_state")
      .select(
        "id, client_id, organization_id, step, data, completed_steps, invite_expires_at, completed_at, created_at, updated_at",
      )
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ state: row ?? null });
  }

  const userOrgId = await resolveAgencyOrg(user.id);
  if (!userOrgId) {
    return Response.json({ states: [] });
  }
  const { data: rows, error } = await publicAdmin
    .from("cm_onboarding_state")
    .select(
      "id, client_id, step, data, completed_steps, invite_expires_at, completed_at, updated_at",
    )
    .eq("organization_id", userOrgId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ states: rows ?? [] });
}
