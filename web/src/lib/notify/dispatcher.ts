/**
 * Sprint 26 · Agente Q — multi-channel notification dispatcher.
 *
 * Orquestador: recibe un NotifyRequest y envía por cada canal solicitado,
 * loggeando cada intento en `public.cm_notifications_log`. Nunca lanza —
 * devuelve un array de resultados por canal para que el caller decida.
 */

import { createClient } from "@supabase/supabase-js";
import { sendEmail, type EmailAttachment } from "@/lib/notify/email-resend";
import { sendSlackMessage } from "@/lib/notify/slack";
import { sendWhatsAppTemplate } from "@/lib/notify/whatsapp-templates";
import { renderTemplate, type TemplateId } from "@/lib/notify/templates";

export type NotificationChannel = "email" | "slack" | "whatsapp";

export interface NotifyRecipients {
  email?: string | string[];
  slack_channel?: string;
  slack_webhook_url?: string;
  phone?: string;
  whatsapp_phone_number_id?: string;
}

export interface NotifyRequest {
  organizationId: string;
  clientId?: string;
  channels: NotificationChannel[];
  recipients: NotifyRecipients;
  template: TemplateId;
  variables: Record<string, unknown>;
  attachments?: EmailAttachment[];
  /** Optional override for the rendered subject line (email only). */
  subjectOverride?: string;
}

export interface ChannelResult {
  channel: NotificationChannel;
  recipient: string;
  ok: boolean;
  id?: string;
  error?: string;
}

export interface NotifyResponse {
  results: ChannelResult[];
}

// ---------------------------------------------------------------------------
// Supabase admin (public schema — same pattern used by Inngest fns).
// ---------------------------------------------------------------------------

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "notify/dispatcher: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

async function logAttempt(row: {
  organization_id: string;
  client_id?: string;
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  body_preview?: string;
  template_id: string;
  variables: Record<string, unknown>;
  status: "sent" | "failed";
  provider_id?: string;
  error?: string;
}) {
  try {
    const admin = getPublicAdmin();
    const now = new Date().toISOString();
    await admin.from("cm_notifications_log").insert({
      organization_id: row.organization_id,
      client_id: row.client_id ?? null,
      channel: row.channel,
      recipient: row.recipient,
      subject: row.subject ?? null,
      body_preview: row.body_preview ? row.body_preview.slice(0, 500) : null,
      template_id: row.template_id,
      variables: row.variables ?? {},
      status: row.status,
      provider_id: row.provider_id ?? null,
      error: row.error ?? null,
      sent_at: row.status === "sent" ? now : null,
      created_at: now,
    });
  } catch (e) {
    // Logging failure should NEVER break the notification flow.
    console.warn(
      "[notify] failed to log attempt:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function notify(req: NotifyRequest): Promise<NotifyResponse> {
  const rendered = renderTemplate(req.template, req.variables);
  const subject = req.subjectOverride ?? rendered.subject;
  const results: ChannelResult[] = [];

  for (const channel of req.channels) {
    if (channel === "email") {
      const to = req.recipients.email;
      if (!to || (Array.isArray(to) && to.length === 0)) {
        results.push({
          channel,
          recipient: "",
          ok: false,
          error: "email recipient missing",
        });
        continue;
      }
      const recipientDisplay = Array.isArray(to) ? to.join(",") : to;
      const r = await sendEmail({
        to,
        subject,
        html: rendered.html,
        text: rendered.text || undefined,
        attachments: req.attachments,
      });
      results.push({
        channel,
        recipient: recipientDisplay,
        ok: r.ok,
        id: r.id,
        error: r.error,
      });
      await logAttempt({
        organization_id: req.organizationId,
        client_id: req.clientId,
        channel,
        recipient: recipientDisplay,
        subject,
        body_preview: rendered.text || rendered.html,
        template_id: req.template,
        variables: req.variables,
        status: r.ok ? "sent" : "failed",
        provider_id: r.id,
        error: r.error,
      });
      continue;
    }

    if (channel === "slack") {
      const target = req.recipients.slack_channel || req.recipients.slack_webhook_url || "(default-webhook)";
      const r = await sendSlackMessage(
        {
          channel: req.recipients.slack_channel,
          text: rendered.slack,
        },
        req.recipients.slack_webhook_url,
      );
      results.push({
        channel,
        recipient: target,
        ok: r.ok,
        id: r.id,
        error: r.error,
      });
      await logAttempt({
        organization_id: req.organizationId,
        client_id: req.clientId,
        channel,
        recipient: target,
        body_preview: rendered.slack,
        template_id: req.template,
        variables: req.variables,
        status: r.ok ? "sent" : "failed",
        provider_id: r.id,
        error: r.error,
      });
      continue;
    }

    if (channel === "whatsapp") {
      const phone = req.recipients.phone;
      if (!phone) {
        results.push({
          channel,
          recipient: "",
          ok: false,
          error: "whatsapp phone missing",
        });
        continue;
      }
      const tplName = rendered.whatsappTemplateName;
      if (!tplName) {
        const err = `template '${req.template}' has no whatsapp template mapped`;
        results.push({ channel, recipient: phone, ok: false, error: err });
        await logAttempt({
          organization_id: req.organizationId,
          client_id: req.clientId,
          channel,
          recipient: phone,
          template_id: req.template,
          variables: req.variables,
          status: "failed",
          error: err,
        });
        continue;
      }
      const r = await sendWhatsAppTemplate({
        phoneNumberId: req.recipients.whatsapp_phone_number_id,
        to: phone,
        templateName: tplName,
        bodyVariables: rendered.whatsappBodyVars,
      });
      results.push({
        channel,
        recipient: phone,
        ok: r.ok,
        id: r.messageId,
        error: r.error,
      });
      await logAttempt({
        organization_id: req.organizationId,
        client_id: req.clientId,
        channel,
        recipient: phone,
        body_preview: rendered.text,
        template_id: req.template,
        variables: req.variables,
        status: r.ok ? "sent" : "failed",
        provider_id: r.messageId,
        error: r.error,
      });
      continue;
    }
  }

  return { results };
}
