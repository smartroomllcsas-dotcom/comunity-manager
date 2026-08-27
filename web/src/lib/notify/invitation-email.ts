/**
 * Shared invitation email — used by POST /api/invitations (create) and
 * POST /api/invitations/[id]/resend.
 *
 * Best-effort contract: never throws; returns EmailResult so callers can
 * surface `email_sent` without failing the main operation.
 */
import { sendEmail, type EmailResult } from "@/lib/notify/email-resend";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface InvitationEmailParams {
  to: string;
  orgName: string;
  inviteUrl: string;
  expiresAt: Date;
}

export async function sendInvitationEmail({
  to,
  orgName,
  inviteUrl,
  expiresAt,
}: InvitationEmailParams): Promise<EmailResult> {
  const expiryText = expiresAt.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return sendEmail({
    to,
    subject: `Te invitaron a unirte a ${orgName}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a;">
        <h2 style="margin:0 0 16px;">Te invitaron a ${escapeHtml(orgName)}</h2>
        <p>Has sido invitado a unirte al equipo de <strong>${escapeHtml(orgName)}</strong> en Community Manager.</p>
        <p style="margin:24px 0;">
          <a href="${inviteUrl}" style="background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;">
            Aceptar invitación
          </a>
        </p>
        <p style="color:#666;font-size:13px;">Este enlace expira el ${expiryText}. Si no esperabas esta invitación, ignora este correo.</p>
        <p style="color:#999;font-size:12px;">Si el botón no funciona, copia y pega este enlace:<br/>${inviteUrl}</p>
      </div>
    `,
    text: `Has sido invitado a unirte a ${orgName} en Community Manager. Acepta la invitación aquí: ${inviteUrl} (expira el ${expiresAt.toISOString().slice(0, 10)}).`,
  });
}
