import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EpaycoGatewayError, createEpaycoV2Session } from "@/lib/epayco/client";
import { rateLimit } from "@/lib/rate-limit";
import { billingError, checkoutCorrelationId } from "@/lib/billing/log";
import {
  BILLING_CHECKOUT_RATE_LIMIT,
  BILLING_CHECKOUT_RATE_WINDOW_MS,
  checkoutRateLimitKey,
} from "@/lib/billing/rate-limit";

/**
 * POST /api/epayco/checkout — crea la sesión de ePayco Checkout v2.
 *
 * Tres garantías que esta ruta debe mantener:
 *
 *  1. **Rate limiting** (H-02): comparte política con `/api/billing/checkout`
 *     — 10 intentos por minuto y por usuario — para que una cuenta autenticada
 *     no pueda crear sesiones de pago en bucle contra ePayco.
 *  2. **Idempotencia** (H-03): la `Idempotency-Key` la envía el cliente. Dos
 *     peticiones con la misma clave devuelven la MISMA `checkout_sessions`, o
 *     un conflicto controlado si la clave se reutilizó con otros parámetros o
 *     ya se consumió. El índice único
 *     `idx_checkout_sessions_org_idempotency (organization_id, idempotency_key)`
 *     de la migración 010 serializa las peticiones concurrentes.
 *  3. **Error controlado del proveedor** (H-01): si ePayco no responde dentro
 *     del timeout, se devuelve 504 y la sesión pendiente se marca `failed`, en
 *     lugar de dejar la función colgada y una fila huérfana.
 */
export async function POST(request: NextRequest) {
  let createdSessionId: string | null = null;
  // Se fija en cuanto se conoce la Idempotency-Key; hasta entonces el fallo no
  // pertenece a ninguna compra concreta.
  let gatewayCorrelationId = "checkout:sin-clave";
  const admin = createAdminClient();

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "No autenticado" }, { status: 401 });
    }

    const rl = await rateLimit(
      checkoutRateLimitKey(user.id),
      BILLING_CHECKOUT_RATE_LIMIT,
      BILLING_CHECKOUT_RATE_WINDOW_MS,
    );
    if (!rl.ok) {
      return Response.json(
        {
          error: "Demasiados intentos de checkout. Intenta más tarde.",
          code: "RATE_LIMITED",
          retry_after_seconds: rl.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("organization_id, email, name, role")
      .eq("id", user.id)
      .single();

    if (!agent) {
      return Response.json({ error: "Agente no encontrado" }, { status: 404 });
    }
    if (agent.role !== "admin") {
      return Response.json(
        { error: "Solo un administrador de la agencia puede contratar un plan" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const planId = String(body?.planId || "");
    const currency = String(body?.currency || "COP").toUpperCase();
    const idempotencyKey = request.headers.get("idempotency-key");

    if (!planId) {
      return Response.json({ error: "Plan requerido" }, { status: 400 });
    }
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return Response.json(
        { error: "Idempotency-Key es requerido", code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 400 },
      );
    }

    gatewayCorrelationId = checkoutCorrelationId(idempotencyKey);

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("id, name, status")
      .eq("id", planId)
      .single();
    if (planError || !plan || plan.status !== "active") {
      return Response.json({ error: "Plan no disponible" }, { status: 404 });
    }

    const { data: price, error: priceError } = await admin
      .from("plan_prices")
      .select(
        "id, amount_minor, currency, billing_interval, interval_count, provider"
      )
      .eq("plan_id", planId)
      .eq("currency", currency)
      .eq("provider", "epayco")
      .eq("is_active", true)
      .lte("active_from", new Date().toISOString())
      .is("active_to", null)
      .maybeSingle();

    if (priceError || !price) {
      return Response.json(
        {
          error:
            "Este plan todavia no tiene un precio de ePayco activo en la moneda seleccionada",
          code: "PLAN_PRICE_NOT_CONFIGURED",
        },
        { status: 409 }
      );
    }

    const { data: organization } = await admin
      .from("organizations")
      .select("name, plan_id, billing_phone")
      .eq("id", agent.organization_id)
      .single();
    if (!organization) {
      return Response.json(
        { error: "Organizacion no encontrada" },
        { status: 404 }
      );
    }

    const testMode = process.env.EPAYCO_TEST === "true";
    const environment = testMode ? "sandbox" : "production";
    const purpose = organization.plan_id === plan.id ? "renewal" : "initial";

    /** Comprueba que una sesión previa corresponde a la misma intención de compra. */
    function conflictsWith(session: Record<string, unknown>) {
      return (
        Number(session.amount_minor) !== Number(price!.amount_minor) ||
        session.currency !== price!.currency ||
        session.plan_id !== plan!.id ||
        session.provider !== "epayco" ||
        session.environment !== environment
      );
    }

    const existingQuery = () =>
      admin
        .from("checkout_sessions")
        .select(
          "id, internal_reference, expires_at, status, amount_minor, currency, plan_id, provider, environment",
        )
        .eq("organization_id", agent!.organization_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

    const { data: existing } = await existingQuery();

    let checkoutSessionId: string;
    let internalReference: string;
    let expiresAt: string;

    if (existing) {
      if (conflictsWith(existing)) {
        return Response.json(
          {
            error: "La clave de idempotencia ya fue usada con otra compra",
            code: "IDEMPOTENCY_CONFLICT",
          },
          { status: 409 },
        );
      }
      if (existing.status !== "pending" || new Date(existing.expires_at).getTime() < Date.now()) {
        return Response.json(
          {
            error: "Esta solicitud de pago ya fue procesada o expiró. Genera una nueva.",
            code: "IDEMPOTENCY_KEY_CONSUMED",
            status: existing.status,
          },
          { status: 409 },
        );
      }
      // Misma intención y sesión todavía viva: se reutiliza la fila.
      checkoutSessionId = existing.id as string;
      internalReference = existing.internal_reference as string;
      expiresAt = existing.expires_at as string;
    } else {
      checkoutSessionId = randomUUID();
      internalReference = `cm_${Date.now()}_${randomUUID().slice(0, 8)}`;
      expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: sessionError } = await admin.from("checkout_sessions").insert({
        id: checkoutSessionId,
        internal_reference: internalReference,
        organization_id: agent.organization_id,
        plan_id: plan.id,
        plan_price_id: price.id,
        initiated_by: user.id,
        provider: "epayco",
        status: "pending",
        amount_minor: price.amount_minor,
        currency: price.currency,
        test_mode: testMode,
        environment,
        idempotency_key: idempotencyKey,
        purpose,
        expires_at: expiresAt,
      });

      if (sessionError?.code === "23505") {
        // Otra petición con la misma clave ganó la carrera: se adopta su fila
        // en lugar de crear una segunda sesión de pago.
        const { data: winner } = await existingQuery();
        if (!winner) {
          return Response.json(
            { error: "No se pudo crear la sesion de pago" },
            { status: 500 },
          );
        }
        if (conflictsWith(winner)) {
          return Response.json(
            {
              error: "La clave de idempotencia ya fue usada con otra compra",
              code: "IDEMPOTENCY_CONFLICT",
            },
            { status: 409 },
          );
        }
        checkoutSessionId = winner.id as string;
        internalReference = winner.internal_reference as string;
        expiresAt = winner.expires_at as string;
      } else if (sessionError) {
        billingError("checkout_session_creation_failed", {
          correlationId: checkoutCorrelationId(idempotencyKey),
          organizationId: agent.organization_id as string,
          code: sessionError.code,
        });
        return Response.json(
          { error: "No se pudo crear la sesion de pago" },
          { status: 500 }
        );
      } else {
        createdSessionId = checkoutSessionId;
      }
    }

    const sessionId = await createEpaycoV2Session({
      description: `Suscripcion al plan ${plan.name} - ${organization.name}`,
      amountMinor: Number(price.amount_minor),
      currency: price.currency,
      email: agent.email,
      customerName: agent.name,
      customerPhone: organization.billing_phone,
      checkoutSessionId,
      internalReference,
    });

    return Response.json({
      sessionId,
      test: testMode,
      checkoutSessionId,
      expiresAt,
      reused: Boolean(existing),
    });
  } catch (error) {
    if (error instanceof EpaycoGatewayError) {
      // La sesión quedó sin contraparte en el proveedor: se cierra para que no
      // quede pendiente ni bloquee la clave de idempotencia indefinidamente.
      if (createdSessionId) {
        await admin
          .from("checkout_sessions")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", createdSessionId)
          .eq("status", "pending");
      }
      billingError("epayco_gateway_error", {
        correlationId: gatewayCorrelationId,
        code: error.code,
        step: error.step,
        status: error.status,
      });
      const timedOut = error.code === "EPAYCO_TIMEOUT";
      return Response.json(
        {
          error: timedOut
            ? "La pasarela de pagos no respondió a tiempo. Intenta nuevamente en unos minutos."
            : "La pasarela de pagos no está disponible en este momento. Intenta nuevamente.",
          code: error.code,
          step: error.step,
        },
        { status: timedOut ? 504 : 502 },
      );
    }
    billingError("checkout_unhandled_error", {
      correlationId: gatewayCorrelationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Error creando checkout" }, { status: 500 });
  }
}
