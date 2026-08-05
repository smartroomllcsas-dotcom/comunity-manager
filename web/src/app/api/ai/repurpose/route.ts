/**
 * Sprint 25 · POST /api/ai/repurpose
 *
 * Repurposing Engine. Auth requerida + rate limit 30/min por user.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { repurpose, type RepurposeSource } from "@/lib/ai/repurposing";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  billingDeniedResponse,
  checkBillingFeature,
  recordBillingUsage,
} from "@/lib/billing/service";
import { randomUUID } from "node:crypto";

const AI_RATE_LIMIT = 30;
const AI_RATE_WINDOW_MS = 60 * 1000;

function validateSource(body: unknown): { src?: RepurposeSource; error?: string } {
  if (!body || typeof body !== "object") return { error: "Body inválido" };
  const b = body as Record<string, unknown>;

  const url = typeof b.url === "string" ? b.url.trim() : undefined;
  const markdown = typeof b.markdown === "string" ? b.markdown : undefined;
  const transcript = typeof b.transcript === "string" ? b.transcript : undefined;

  if (!url && !markdown && !transcript) {
    return { error: "Requerido al menos uno: url, markdown o transcript" };
  }

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: "URL debe ser http o https" };
      }
    } catch {
      return { error: "URL inválida" };
    }
  }

  if (markdown && markdown.length > 100_000) return { error: "markdown demasiado largo (>100k chars)" };
  if (transcript && transcript.length > 100_000) return { error: "transcript demasiado largo (>100k chars)" };

  return { src: { url, markdown, transcript } };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`ai-repurpose:${user.id}`, AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { src, error } = validateSource(body);
  if (!src) return Response.json({ error }, { status: 400 });

  // Billing enforcement (IA). Este endpoint no recibe clientId, así que la
  // organización se resuelve a partir del agente autenticado.
  const { data: agent } = await supabase
    .from("agents")
    .select("id, organization_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = agent?.organization_id ?? null;
  const aiAccess = orgId
    ? await checkBillingFeature({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_ACCESS,
        source: "api/ai/repurpose",
      })
    : null;
  if (aiAccess && !aiAccess.allowed) return billingDeniedResponse(aiAccess);
  const aiUsage = orgId
    ? await checkBillingFeature({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_REQUESTS_MONTH,
        requestedUnits: 1,
        source: "api/ai/repurpose",
      })
    : null;
  if (aiUsage && !aiUsage.allowed) return billingDeniedResponse(aiUsage);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI no configurada. Falta ANTHROPIC_API_KEY." }, { status: 500 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const result = await repurpose(src, client);
    if (orgId && aiUsage) {
      await recordBillingUsage({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_REQUESTS_MONTH,
        quantity: 1,
        idempotencyKey: `ai-repurpose:${randomUUID()}`,
        sourceType: "ai_repurpose",
        sourceId: agent?.id ?? user.id,
        periodStart: aiUsage.periodStart,
        periodEnd: aiUsage.periodEnd,
      });
    }
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/ai/repurpose] Error:", msg);
    return Response.json({ error: `Repurpose failed: ${msg}` }, { status: 502 });
  }
}
