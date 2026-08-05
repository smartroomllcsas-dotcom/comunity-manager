/**
 * Sprint 25 · POST /api/ai/generate
 *
 * Content Generator multi-canal. Auth requerida + rate limit 30/min por user.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { generateContent, type ContentGenBrief } from "@/lib/ai/content-generator";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  billingDeniedResponse,
  checkBillingFeature,
  recordBillingUsage,
} from "@/lib/billing/service";
import { randomUUID } from "node:crypto";

const AI_RATE_LIMIT = 30;
const AI_RATE_WINDOW_MS = 60 * 1000;

const ALLOWED_PLATFORMS = new Set([
  "fb",
  "facebook",
  "ig-feed",
  "ig-reel",
  "tiktok",
  "linkedin",
  "x",
  "threads",
  "pinterest",
  "youtube",
]);

function validateBrief(body: unknown): { brief?: ContentGenBrief; error?: string } {
  if (!body || typeof body !== "object") return { error: "Body inválido" };
  const b = body as Record<string, unknown>;

  const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
  const goal = typeof b.goal === "string" ? b.goal.trim() : "";
  const platformsRaw = Array.isArray(b.platforms) ? b.platforms : [];
  const platforms = platformsRaw.filter(
    (p): p is string => typeof p === "string" && ALLOWED_PLATFORMS.has(p)
  );

  if (!clientId) return { error: "clientId requerido" };
  if (!goal) return { error: "goal requerido" };
  if (platforms.length === 0) {
    return { error: `platforms requerido (>=1). Válidos: ${Array.from(ALLOWED_PLATFORMS).join(",")}` };
  }
  if (platforms.length > 8) return { error: "Max 8 plataformas por request" };

  const keywords = Array.isArray(b.keywords)
    ? b.keywords.filter((k): k is string => typeof k === "string").slice(0, 20)
    : undefined;
  const lang = b.language === "en" || b.language === "es" ? b.language : undefined;
  const urgency = b.urgency === "high" || b.urgency === "normal" ? b.urgency : undefined;

  const brief: ContentGenBrief = {
    clientId,
    goal,
    platforms,
    brandVoice: typeof b.brandVoice === "string" ? b.brandVoice.slice(0, 4000) : undefined,
    targetAudience: typeof b.targetAudience === "string" ? b.targetAudience.slice(0, 500) : undefined,
    keywords,
    language: lang,
    urgency,
  };
  return { brief };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`ai-generate:${user.id}`, AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
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

  const { brief, error } = validateBrief(body);
  if (!brief) return Response.json({ error }, { status: 400 });

  // Billing enforcement (IA): requiere suscripción activa + acceso a IA y no
  // haber alcanzado el cupo mensual de requests. El superadmin queda sin límites
  // (checkBillingFeature lo resuelve). Si no se puede resolver la organización
  // del cliente, se procede sin cobro (mismo criterio que /api/social/publish).
  const access = await getCmClientAccess(request, brief.clientId);
  const orgId = access?.organizationId ?? null;
  const aiAccess = orgId
    ? await checkBillingFeature({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_ACCESS,
        source: "api/ai/generate",
      })
    : null;
  if (aiAccess && !aiAccess.allowed) return billingDeniedResponse(aiAccess);
  const aiUsage = orgId
    ? await checkBillingFeature({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_REQUESTS_MONTH,
        requestedUnits: 1,
        source: "api/ai/generate",
      })
    : null;
  if (aiUsage && !aiUsage.allowed) return billingDeniedResponse(aiUsage);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI no configurada. Falta ANTHROPIC_API_KEY." }, { status: 500 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const result = await generateContent(brief, client);
    if (orgId && aiUsage) {
      await recordBillingUsage({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_REQUESTS_MONTH,
        quantity: 1,
        idempotencyKey: `ai-generate:${randomUUID()}`,
        sourceType: "ai_generate",
        sourceId: brief.clientId,
        periodStart: aiUsage.periodStart,
        periodEnd: aiUsage.periodEnd,
      });
    }
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/ai/generate] Error:", msg);
    return Response.json({ error: `Generation failed: ${msg}` }, { status: 502 });
  }
}
