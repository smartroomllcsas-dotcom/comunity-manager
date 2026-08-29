// Mapeo de errores Graph API v26.0 → mensajes en español user-friendly.
// Basado en https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

import { WabaCloudApiError } from "./client";

const MESSAGES: Record<number, string> = {
  0: "Error de autenticación. Reconecta la cuenta.",
  3: "Permiso insuficiente. Verifica los scopes de la app.",
  10: "Permiso denegado por la app.",
  100: "Parámetro inválido. Revisa el nombre, idioma o componentes.",
  131000: "Error genérico. Intenta de nuevo o revisa el status de Meta.",
  131005: "Permiso denegado.",
  131008: "Parámetro requerido faltante.",
  131009: "Parámetro inválido.",
  131016: "Servicio Meta temporalmente no disponible.",
  131021: "Este destinatario no puede recibir mensajes de WhatsApp (número no válido).",
  131026: "El destinatario no pudo recibir el mensaje (bloqueó al remitente o desinstaló WhatsApp).",
  131031: "Cuenta bloqueada.",
  131047: "Reengagement fuera de la ventana 24h — solo se pueden enviar plantillas.",
  131051: "Tipo de mensaje no soportado.",
  131052: "Descarga de media falló.",
  131053: "Subida de media falló.",
  132000: "Número de parámetros no coincide con la plantilla.",
  132001: "La plantilla no existe en ese idioma. Revisa `language`.",
  132005: "La plantilla no está aprobada.",
  132007: "Formato de plantilla inválido — usa el schema de Meta.",
  132012: "Formato de parámetro inválido en el envío.",
  132015: "Plantilla pausada por baja calidad.",
  132016: "Plantilla deshabilitada por Meta.",
  132068: "Nombre de plantilla ya existe en ese idioma.",
  133000: "Registro del número falló.",
  133004: "Servidor Meta caído temporalmente.",
  133005: "Two-step verification PIN incorrecto.",
  133006: "Two-step verification bloqueado — espera antes de reintentar.",
  133008: "PIN inválido.",
  133009: "Too many PIN attempts.",
  133010: "Número no registrado en la plataforma.",
  368: "Contenido rechazado por políticas de WhatsApp.",
  80007: "Rate limit — enviaste demasiados mensajes en poco tiempo.",
  80008: "Rate limit por plantilla — bajá la frecuencia de envío.",
  190: "Access token expirado o inválido. Reconecta la cuenta.",
  200: "Permisos insuficientes en la app de Meta. Revisa scopes.",
  613: "Rate limit alcanzado — reintenta en unos minutos.",
};

export const REJECTION_REASONS: Record<string, string> = {
  ABUSIVE_CONTENT: "Contenido abusivo, ofensivo o amenazante.",
  INCORRECT_CATEGORY: "Categoría incorrecta — Meta la re-clasificaría a MARKETING.",
  INVALID_FORMAT: "Formato inválido — a menudo URLs sueltas en el BODY o placeholders mal usados.",
  SCAM: "Contenido detectado como fraudulento.",
  NONE: "Sin razón especificada por Meta.",
  TAG_CONTENT_MISMATCH: "El contenido no coincide con la categoría declarada.",
  PROMOTIONAL_CONTENT: "Contenido promocional en categoría UTILITY o AUTHENTICATION.",
};

export function friendlyWhatsAppError(err: unknown): string {
  if (err instanceof WabaCloudApiError) {
    if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Error desconocido comunicando con WhatsApp.";
}

export function friendlyRejectionReason(reason: string | null | undefined): string {
  if (!reason) return "Sin razón especificada.";
  return REJECTION_REASONS[reason] || reason;
}
