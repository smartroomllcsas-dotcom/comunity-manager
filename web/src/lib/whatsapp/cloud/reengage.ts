/**
 * Retoma automática de conversaciones de WhatsApp.
 *
 * La configuración existía (reengage_template_id, reengage_after_hours en
 * cm_lead_agent_settings) pero ningún proceso la ejecutaba. Ahora, cada hora:
 * para cada marca con la retoma configurada, se buscan conversaciones de
 * WhatsApp oficial en las que el ÚLTIMO mensaje lo mandamos nosotros (el
 * cliente dejó de responder) hace más de N horas, y se le envía UNA vez la
 * plantilla de retoma. No se retoma a contactos en etapa Perdido ni Cliente.
 */



/**
 * Retoma automática → ahora es el seguimiento por pasos (varios intentos y
 * cierre), configurable por empresa. Se conserva el nombre para el cron.
 */
export async function runReengagement(now: Date = new Date()) {
  const { runFollowups } = await import("@/lib/whatsapp/cloud/followup");
  const r = await runFollowups(now);
  return { brands: r.brands, considered: r.considered, sent: r.sent, closed: r.closed, failures: r.failures };
}
