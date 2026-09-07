/**
 * Ventana de respuesta de cada canal, con fechas claras para el asesor.
 *
 * - WhatsApp: 24 h desde el último mensaje del cliente; después sólo plantilla
 *   aprobada.
 * - Instagram / Messenger: 24 h; con la etiqueta de agente humano (permiso
 *   `human_agent` de la app) hasta 7 días. Después, nada: hay que esperar a
 *   que el cliente escriba o contactarlo por otro canal. Tampoco se puede
 *   iniciar una conversación: el cliente escribe primero.
 */

export const REPLY_WINDOW_TZ = "America/Bogota";
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export type ReplyWindowState =
  | "open" // dentro de las 24 h
  | "human_agent" // Meta: entre 24 h y 7 días (se intenta con etiqueta)
  | "template_only" // WhatsApp: pasadas 24 h
  | "closed" // Meta: pasados 7 días
  | "never_started" // Meta sin mensaje del cliente
  | "unrestricted"; // otros canales

export interface ReplyWindow {
  channel: "whatsapp" | "meta" | "other";
  networkLabel: string;
  state: ReplyWindowState;
  lastInboundAt: Date | null;
  closesAt: Date | null; // fin de las 24 h
  humanAgentUntil: Date | null; // Meta: fin de los 7 días
  canSend: boolean;
}

export function formatBogota(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "fecha desconocida";
  // Con año (una conversación de abril no debe confundirse con la de este
  // mes) y AM/PM sin puntos, para que no choque con el punto final de la frase.
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: REPLY_WINDOW_TZ,
  })
    .format(date)
    .replace(/\s?a\.\s?m\./i, " AM")
    .replace(/\s?p\.\s?m\./i, " PM");
}

export function getReplyWindow(
  channelType: string | null | undefined,
  lastInboundAt: string | Date | null | undefined,
  now: Date = new Date(),
): ReplyWindow {
  const type = (channelType || "").toLowerCase();
  const isWhatsApp = type.includes("whatsapp") || type === "waha";
  const isMeta = type === "instagram" || type === "facebook_messenger";
  const networkLabel = type === "instagram" ? "Instagram" : type === "facebook_messenger" ? "Messenger" : isWhatsApp ? "WhatsApp" : "este canal";
  const last = lastInboundAt ? new Date(lastInboundAt) : null;
  const validLast = last && !Number.isNaN(last.getTime()) ? last : null;

  // WhatsApp por QR (WAHA) es una sesión normal de WhatsApp: no aplica la
  // ventana de 24 h ni las plantillas de Meta.
  if ((!isWhatsApp && !isMeta) || type === "waha") {
    return { channel: "other", networkLabel, state: "unrestricted", lastInboundAt: validLast, closesAt: null, humanAgentUntil: null, canSend: true };
  }

  const closesAt = validLast ? new Date(validLast.getTime() + DAY) : null;
  const humanAgentUntil = isMeta && validLast ? new Date(validLast.getTime() + 7 * DAY) : null;

  if (isWhatsApp) {
    const expired = !!closesAt && now > closesAt;
    return {
      channel: "whatsapp",
      networkLabel,
      state: expired ? "template_only" : "open",
      lastInboundAt: validLast,
      closesAt,
      humanAgentUntil: null,
      canSend: true, // con plantilla si venció; lo resuelve MessageInput
    };
  }

  if (!validLast || !closesAt || !humanAgentUntil) {
    return { channel: "meta", networkLabel, state: "never_started", lastInboundAt: null, closesAt: null, humanAgentUntil: null, canSend: false };
  }
  if (now <= closesAt) {
    return { channel: "meta", networkLabel, state: "open", lastInboundAt: validLast, closesAt, humanAgentUntil, canSend: true };
  }
  if (now <= humanAgentUntil) {
    return { channel: "meta", networkLabel, state: "human_agent", lastInboundAt: validLast, closesAt, humanAgentUntil, canSend: true };
  }
  return { channel: "meta", networkLabel, state: "closed", lastInboundAt: validLast, closesAt, humanAgentUntil, canSend: false };
}

/** Texto único, con fechas, para pantalla y para el error del servidor. */
export function describeReplyWindow(w: ReplyWindow): string {
  const last = formatBogota(w.lastInboundAt);
  switch (w.state) {
    case "open":
      return `Puedes responder hasta el ${formatBogota(w.closesAt)} (24 h después del último mensaje del cliente, ${last}).`;
    case "human_agent":
      return (
        `La ventana de 24 h cerró el ${formatBogota(w.closesAt)} (último mensaje del cliente: ${last}). ` +
        `Se intentará enviar como agente humano, permitido hasta el ${formatBogota(w.humanAgentUntil)}; ` +
        `si ${w.networkLabel} lo rechaza, hay que esperar a que el cliente escriba de nuevo.`
      );
    case "template_only":
      return (
        `La ventana de 24 h cerró el ${formatBogota(w.closesAt)} (último mensaje del cliente: ${last}). ` +
        `Desde entonces WhatsApp sólo permite enviar una plantilla aprobada.`
      );
    case "closed":
      return (
        `Bloqueado por ${w.networkLabel}: el cliente escribió por última vez el ${last}. ` +
        `La ventana de 24 h cerró el ${formatBogota(w.closesAt)} y el plazo de agente humano el ${formatBogota(w.humanAgentUntil)}. ` +
        `No se puede enviar por ${w.networkLabel}: espera a que vuelva a escribir o contáctalo por correo o teléfono desde su ficha.`
      );
    case "never_started":
      return `${w.networkLabel} no permite iniciar conversaciones: el cliente debe escribir primero.`;
    default:
      return "";
  }
}
