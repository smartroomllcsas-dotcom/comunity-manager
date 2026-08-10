/**
 * Notificaciones de billing dirigidas al administrador de la organización.
 *
 * Se encolan como jobs `send_notification` en `billing_outbox_jobs` —el único
 * tipo con handler— en lugar de enviarse en línea, para que el cron reintente
 * con backoff si el proveedor falla y para no alargar la transacción del cron
 * de ciclo de vida.
 *
 * **La unicidad la garantiza la base**: `billing_outbox_jobs.idempotency_key`
 * es UNIQUE, así que una clave por transición produce exactamente un envío por
 * transición (D-6) y una sola alerta por evento (D-2), sin contadores en
 * memoria ni comprobaciones previas sujetas a carreras.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { billingError, billingWarn } from "@/lib/billing/log";

export interface BillingNotificationInput {
  organizationId: string;
  /** Clave estable por transición: dos llamadas con la misma clave = un envío. */
  idempotencyKey: string;
  subject: string;
  text: string;
  subscriptionId?: string | null;
  webhookEventId?: string | null;
  metadata?: Record<string, unknown>;
}

export type BillingNotificationResult =
  | { enqueued: true }
  | { enqueued: false; reason: "duplicate" | "no_recipient" | "write_failed" };

/** Correo del administrador de la organización, o null si no hay ninguno. */
async function organizationAdminEmail(organizationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agents")
    .select("email")
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const email = data?.email;
  return typeof email === "string" && email.includes("@") ? email : null;
}

/**
 * Encola una notificación de billing.
 *
 * Devuelve `duplicate` cuando la clave ya existía: es el caso normal al
 * reejecutar un cron, no un error.
 */
export async function enqueueBillingNotification(
  input: BillingNotificationInput,
): Promise<BillingNotificationResult> {
  const recipient = await organizationAdminEmail(input.organizationId);
  if (!recipient) {
    billingWarn("notification_without_recipient", {
      correlationId: input.idempotencyKey,
      organizationId: input.organizationId,
    });
    return { enqueued: false, reason: "no_recipient" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("billing_outbox_jobs").insert({
    job_type: "send_notification",
    organization_id: input.organizationId,
    subscription_id: input.subscriptionId || null,
    webhook_event_id: input.webhookEventId || null,
    idempotency_key: input.idempotencyKey,
    status: "pending",
    payload: {
      request: {
        organizationId: input.organizationId,
        channels: ["email"],
        recipients: { email: recipient },
        // `custom` evita inventar una plantilla nueva: el asunto y el cuerpo
        // viajan en las variables y los redacta quien encola.
        template: "custom",
        variables: {
          subject: input.subject,
          text: input.text,
          html: `<p>${input.text}</p>`,
        },
      },
      metadata: input.metadata || {},
    },
  });

  if (error?.code === "23505") {
    return { enqueued: false, reason: "duplicate" };
  }
  if (error) {
    billingError("notification_enqueue_failed", {
      correlationId: input.idempotencyKey,
      organizationId: input.organizationId,
      code: error.code,
    });
    return { enqueued: false, reason: "write_failed" };
  }

  return { enqueued: true };
}
