/**
 * Catálogo de perfiles seleccionables del agente IA por empresa.
 * Cada opción tiene: value (se guarda en cm_lead_agent_settings),
 * label (se muestra en la UI) y prompt (lo que recibe el modelo).
 *
 * Compartido por la página de Automatización y por chatbot/ai.ts.
 */

export interface AgentPresetOption {
  value: string;
  label: string;
  prompt: string;
}

export const AGENT_ROLES: AgentPresetOption[] = [
  {
    value: "asesor_ventas",
    label: "Asesor de ventas",
    prompt:
      "Actúas como asesor comercial de la empresa: tu prioridad es entender la necesidad del cliente y avanzar la venta.",
  },
  {
    value: "consultor",
    label: "Consultor experto",
    prompt:
      "Actúas como consultor experto: aportas criterio y recomendaciones sobre el proyecto del cliente, generando confianza técnica.",
  },
  {
    value: "asesor_servicio",
    label: "Asesor de servicio al cliente",
    prompt:
      "Actúas como asesor de servicio: resuelves dudas con paciencia y acompañas al cliente en todo el proceso.",
  },
  {
    value: "recepcionista",
    label: "Recepcionista / coordinador de citas",
    prompt:
      "Actúas como recepcionista: tu función principal es coordinar y confirmar la cita del cliente con el equipo.",
  },
];

export const AGENT_TONES: AgentPresetOption[] = [
  {
    value: "amable",
    label: "Amable y cercano",
    prompt:
      "Tono: amable, cercano y humano. Tutea al cliente, usa un lenguaje sencillo y cálido, con emojis con moderación.",
  },
  {
    value: "profesional",
    label: "Profesional y formal",
    prompt:
      "Tono: profesional y formal. Trata al cliente de usted, lenguaje claro y corporativo, sin emojis.",
  },
  {
    value: "entusiasta",
    label: "Entusiasta y motivador",
    prompt:
      "Tono: entusiasta y positivo. Transmite energía por el proyecto del cliente y motívalo a dar el siguiente paso.",
  },
  {
    value: "directo",
    label: "Directo y conciso",
    prompt:
      "Tono: directo y conciso. Mensajes cortos, al grano, sin rodeos ni relleno.",
  },
];

export const AGENT_GOALS: AgentPresetOption[] = [
  {
    value: "calificar_y_agendar",
    label: "Calificar y agendar cita (recomendado)",
    prompt:
      "Objetivo: PRIMERO califica al lead recolectando, una pregunta a la vez: (1) qué tipo de proyecto necesita, (2) para qué negocio, (3) presupuesto estimado o rango, (4) para cuándo lo necesita. CUANDO tengas esa información, invítalo a agendar una cita con el equipo.",
  },
  {
    value: "calificar",
    label: "Solo calificar al lead",
    prompt:
      "Objetivo: califica al lead recolectando, una pregunta a la vez: (1) qué tipo de proyecto necesita, (2) para qué negocio, (3) presupuesto estimado o rango, (4) para cuándo lo necesita. Registra la información con [ACTION:update_contact_field:...] y al terminar agradece e indica que un asesor lo contactará.",
  },
  {
    value: "agendar",
    label: "Agendar cita lo antes posible",
    prompt:
      "Objetivo: lleva al cliente a agendar una cita lo antes posible. Haz máximo una o dos preguntas de contexto y ofrece la agenda de inmediato.",
  },
];

export function presetPrompt(
  options: AgentPresetOption[],
  value: string | null | undefined
): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.prompt ?? null;
}
