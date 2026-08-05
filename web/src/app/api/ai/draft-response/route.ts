/**
 * Sprint 25 · POST /api/ai/draft-response
 *
 * Response Drafting con voz del cliente. Auth + rate limit 30/min por user.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  draftResponse,
  type ResponseDraftInput,
  type ConversationTurn,
} from "@/lib/ai/response-drafting";
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

function validateInput(body: unknown): { input?: ResponseDraftInput; error?: string } {
  if (!body || typeof body !== "object") return { error: "Body inválido" };
  const b = body as Record<string, unknown>;

  const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
  const incomingMessage = typeof b.incomingMessage === "string" ? b.incomingMessage.trim() : "";
  const platform = typeof b.platform === "string" ? b.platform.trim() : "";

  if (!clientId) return { error: "clientId requerido" };
  if (!incomingMessage) return { error: "incomingMessage requerido" };
  if (!platform) return { error: "platform requerido" };
  if (incomingMessage.length > 8000) return { error: "incomingMessage demasiado largo" };

  let history: ConversationTurn[] | undefined;
  if (Array.isArray(b.conversationHistory)) {
    history = b.conversationHistory
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .map((t) => {
        const role = t.role === "brand" ? "brand" : "user";
        const content = typeof t.content === "string" ? t.content : "";
        return { role, content } as ConversationTurn;
      })
      .filter((t) => t.content)
      .slice(-16);
  }

  return {
    input: {
      clientId,
      incomingMessage,
      platform,
      conversationHistory: history,
      brandVoiceSample:
        typeof b.brandVoiceSample === "string" ? b.brandVoiceSample : undefined,
    },
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`ai-draft:${user.id}`, AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
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

  const { input, error } = validateInput(body);
  if (!input) return Response.json({ error }, { status: 400 });

  // Billing enforcement (IA).
  const access = await getCmClientAccess(request, input.clientId);
  const orgId = access?.organizationId ?? null;
  const aiAccess = orgId
    ? await checkBillingFeature({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_ACCESS,
        source: "api/ai/draft-response",
      })
    : null;
  if (aiAccess && !aiAccess.allowed) return billingDeniedResponse(aiAccess);
  const aiUsage = orgId
    ? await checkBillingFeature({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_REQUESTS_MONTH,
        requestedUnits: 1,
        source: "api/ai/draft-response",
      })
    : null;
  if (aiUsage && !aiUsage.allowed) return billingDeniedResponse(aiUsage);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI no configurada. Falta ANTHROPIC_API_KEY." }, { status: 500 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const result = await draftResponse(input, client);
    if (orgId && aiUsage) {
      await recordBillingUsage({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.AI_REQUESTS_MONTH,
        quantity: 1,
        idempotencyKey: `ai-draft:${randomUUID()}`,
        sourceType: "ai_draft",
        sourceId: input.clientId,
        periodStart: aiUsage.periodStart,
        periodEnd: aiUsage.periodEnd,
      });
    }
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/ai/draft-response] Error:", msg);
    return Response.json({ error: `Draft failed: ${msg}` }, { status: 502 });
  }
}
