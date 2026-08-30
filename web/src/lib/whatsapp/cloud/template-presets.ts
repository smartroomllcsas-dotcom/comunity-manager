/**
 * Biblioteca de plantillas modelo WhatsApp Cloud — 21 presets listos por marca.
 *
 * Cada preset es una TemplateFormValue-compatible que se personaliza con el
 * nombre de la marca activa (BrandSwitcher) al momento de usarla. El texto
 * respeta las reglas de Meta v26.0: BODY ≤1024 chars, FOOTER ≤60 sin variables,
 * variables posicionales secuenciales, sin URLs sueltas en BODY, quick replies
 * ≤25 chars.
 *
 * Grupos:
 *  - bienvenida  — primer contacto / onboarding
 *  - seguimiento — follow-up post contacto o cotización
 *  - nurture     — valor, ofertas, reactivación (MARKETING)
 *  - operativa   — confirmaciones y recordatorios (UTILITY)
 *  - leads_meta  — secuencia para leads que entran por Meta Lead Ads
 *                  (diseñada a partir del flujo de Smart Digital Media,
 *                  aplicable a cualquier marca que corra Lead Ads)
 */
import type { WaComponent, WaTemplateCategory } from "./types";

export type PresetGroup =
  | "bienvenida"
  | "seguimiento"
  | "nurture"
  | "operativa"
  | "leads_meta";

export interface TemplatePreset {
  key: string;
  label: string;
  description: string;
  group: PresetGroup;
  category: WaTemplateCategory;
  /** Texto con placeholder literal {brand} que se sustituye al construir. */
  body: string;
  bodyExamples: string[];
  header?: string;
  footer?: string;
  quickReplies?: string[];
}

export const PRESET_GROUP_LABELS: Record<PresetGroup, string> = {
  bienvenida: "Bienvenida",
  seguimiento: "Seguimiento",
  nurture: "Nurture y ofertas",
  operativa: "Operativas",
  leads_meta: "Leads de Meta Ads",
};

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  // ── Bienvenida ─────────────────────────────────────────────────────────────
  {
    key: "bienvenida_general",
    label: "Bienvenida general",
    description: "Primer mensaje al registrarse o dejar sus datos.",
    group: "bienvenida",
    category: "UTILITY",
    body:
      "Hola {{1}}, ¡bienvenido/a a {brand}! 🎉\n\nRecibimos tus datos correctamente. A partir de ahora te acompañaremos por este canal con toda la información que necesites.\n\n¿Hay algo en lo que podamos ayudarte hoy?",
    bodyExamples: ["Laura"],
    footer: "Responde SALIR para dejar de recibir mensajes",
    quickReplies: ["Quiero más info", "Hablar con asesor"],
  },
  {
    key: "bienvenida_registro_confirmado",
    label: "Registro confirmado",
    description: "Confirma la creación de cuenta o inscripción.",
    group: "bienvenida",
    category: "UTILITY",
    body:
      "Hola {{1}}, tu registro en {brand} quedó confirmado ✅\n\nTu número de referencia es {{2}}. Guárdalo para cualquier consulta.\n\nEn breve un miembro del equipo se pondrá en contacto contigo.",
    bodyExamples: ["Carlos", "REF-1042"],
    footer: "Equipo {brand}",
  },
  {
    key: "bienvenida_comunidad",
    label: "Bienvenida a comunidad",
    description: "Invitación cálida para nuevos miembros de la comunidad.",
    group: "bienvenida",
    category: "MARKETING",
    body:
      "¡Hola {{1}}! 👋 Ya haces parte de la comunidad de {brand}.\n\nPor aquí te compartiremos novedades, contenido exclusivo y beneficios antes que nadie.\n\nCuéntanos: ¿qué te gustaría recibir primero?",
    bodyExamples: ["Andrea"],
    quickReplies: ["Novedades", "Promociones", "Tips y contenido"],
  },
  {
    key: "bienvenida_primer_pedido",
    label: "Bienvenida primer pedido",
    description: "Agradece la primera compra y abre el canal.",
    group: "bienvenida",
    category: "UTILITY",
    body:
      "Hola {{1}}, ¡gracias por tu primera compra en {brand}! 💙\n\nTu pedido {{2}} ya está en proceso. Te iremos avisando por este medio cada avance.\n\nSi tienes alguna duda, responde este mensaje y te ayudamos.",
    bodyExamples: ["Sofía", "PED-2210"],
    footer: "Equipo {brand}",
  },

  // ── Seguimiento ────────────────────────────────────────────────────────────
  {
    key: "seguimiento_24h",
    label: "Seguimiento 24 horas",
    description: "Retoma la conversación un día después del primer contacto.",
    group: "seguimiento",
    category: "UTILITY",
    body:
      "Hola {{1}}, ayer hablamos sobre {{2}} en {brand} y no queríamos dejar pasar el tema.\n\n¿Te quedó alguna pregunta o quieres que avancemos con el siguiente paso?",
    bodyExamples: ["Diego", "el plan de servicios"],
    quickReplies: ["Sí, avancemos", "Tengo una duda", "Más adelante"],
  },
  {
    key: "seguimiento_cotizacion",
    label: "Seguimiento de cotización",
    description: "Follow-up de una propuesta o cotización enviada.",
    group: "seguimiento",
    category: "UTILITY",
    body:
      "Hola {{1}}, te escribimos de {brand}. Hace unos días te enviamos la cotización {{2}} y queremos saber qué te pareció.\n\nSi necesitas ajustar algo (alcance, tiempos o presupuesto), lo revisamos contigo sin compromiso.",
    bodyExamples: ["Mariana", "COT-318"],
    quickReplies: ["Me interesa", "Quiero ajustes", "No por ahora"],
  },
  {
    key: "seguimiento_sin_respuesta",
    label: "Sin respuesta amable",
    description: "Reintento suave cuando el contacto no ha respondido.",
    group: "seguimiento",
    category: "UTILITY",
    body:
      "Hola {{1}}, ¿cómo vas? Te escribimos de {brand}.\n\nSabemos que a veces los mensajes se pierden entre tanto pendiente 😅. Seguimos atentos a tu solicitud sobre {{2}}.\n\nCuando tengas un momento, respóndenos y retomamos donde quedamos.",
    bodyExamples: ["Felipe", "tu solicitud de información"],
    quickReplies: ["Retomemos", "Ya no me interesa"],
  },
  {
    key: "seguimiento_post_reunion",
    label: "Post reunión",
    description: "Resumen y siguiente paso después de una llamada o reunión.",
    group: "seguimiento",
    category: "UTILITY",
    body:
      "Hola {{1}}, gracias por tu tiempo hoy 🙌\n\nComo acordamos en la reunión, el siguiente paso es: {{2}}.\n\nDesde {brand} quedamos atentos a cualquier duda para avanzar.",
    bodyExamples: ["Valentina", "enviarte la propuesta final el viernes"],
    footer: "Equipo {brand}",
  },
  {
    key: "seguimiento_documentos",
    label: "Documentos pendientes",
    description: "Recuerda documentos o datos faltantes para avanzar.",
    group: "seguimiento",
    category: "UTILITY",
    body:
      "Hola {{1}}, para continuar con tu proceso en {brand} solo nos falta: {{2}}.\n\nEn cuanto nos lo envíes por este chat, seguimos de inmediato con el siguiente paso.",
    bodyExamples: ["Juan", "la copia de tu documento de identidad"],
    footer: "Responde por este chat para adjuntarlo",
  },

  // ── Nurture y ofertas ──────────────────────────────────────────────────────
  {
    key: "nurture_tip_valor",
    label: "Tip de valor",
    description: "Contenido útil para mantener la relación viva.",
    group: "nurture",
    category: "MARKETING",
    body:
      "Hola {{1}} 👋 En {brand} preparamos algo que te puede servir:\n\n💡 {{2}}\n\n¿Quieres que te compartamos más contenido como este?",
    bodyExamples: ["Camila", "3 claves para mejorar la conversión de tus campañas este mes"],
    quickReplies: ["Sí, quiero más", "No, gracias"],
  },
  {
    key: "nurture_caso_exito",
    label: "Caso de éxito",
    description: "Prueba social con resultados de otros clientes.",
    group: "nurture",
    category: "MARKETING",
    body:
      "Hola {{1}}, queremos contarte una historia real de {brand}:\n\n{{2}}\n\nSi quieres lograr algo similar, cuéntanos y armamos un plan a tu medida.",
    bodyExamples: ["Ricardo", "uno de nuestros clientes duplicó sus ventas en 90 días con nuestro acompañamiento"],
    quickReplies: ["Quiero mi plan", "Ver más casos"],
  },
  {
    key: "oferta_tiempo_limitado",
    label: "Oferta por tiempo limitado",
    description: "Promoción con fecha de cierre clara.",
    group: "nurture",
    category: "MARKETING",
    body:
      "{{1}}, tenemos algo especial para ti en {brand} 🎁\n\n{{2}}\n\nEsta oferta está disponible hasta el {{3}}. Si te interesa, respóndenos y la activamos de una vez.",
    bodyExamples: ["Paola", "20% de descuento en tu primer mes de servicio", "15 de septiembre"],
    footer: "Aplican términos y condiciones",
    quickReplies: ["¡La quiero!", "Más información"],
  },
  {
    key: "novedades_mes",
    label: "Novedades del mes",
    description: "Resumen mensual de novedades y lanzamientos.",
    group: "nurture",
    category: "MARKETING",
    body:
      "Hola {{1}}, esto es lo nuevo de {brand} este mes 📬\n\n{{2}}\n\n¿Sobre cuál quieres saber más?",
    bodyExamples: ["Natalia", "1) Nuevo servicio premium 2) Horarios extendidos 3) Programa de referidos"],
    quickReplies: ["Cuéntame más", "No me interesa"],
  },
  {
    key: "reactivacion_cliente",
    label: "Reactivación de cliente",
    description: "Recupera clientes inactivos con un incentivo.",
    group: "nurture",
    category: "MARKETING",
    body:
      "Hola {{1}}, ¡te extrañamos en {brand}! 💙\n\nHa pasado un tiempo desde tu última visita y queremos que vuelvas: {{2}}.\n\n¿Te animas?",
    bodyExamples: ["Óscar", "tenemos un 15% de descuento esperándote en tu próxima compra"],
    quickReplies: ["¡Me animo!", "Quizás luego"],
  },

  // ── Operativas ─────────────────────────────────────────────────────────────
  {
    key: "recordatorio_cita",
    label: "Recordatorio de cita",
    description: "Confirma asistencia a una cita o reunión agendada.",
    group: "operativa",
    category: "UTILITY",
    body:
      "Hola {{1}}, te recordamos tu cita con {brand}:\n\n📅 {{2}}\n🕐 {{3}}\n\n¿Confirmas tu asistencia?",
    bodyExamples: ["Daniela", "martes 12 de septiembre", "3:00 p. m."],
    quickReplies: ["Confirmo", "Reagendar", "Cancelar"],
  },
  {
    key: "confirmacion_pedido",
    label: "Confirmación de pedido",
    description: "Confirma la recepción de un pedido u orden.",
    group: "operativa",
    category: "UTILITY",
    body:
      "Hola {{1}}, recibimos tu pedido {{2}} en {brand} ✅\n\nValor total: {{3}}.\n\nTe avisaremos por aquí cuando esté listo o en camino.",
    bodyExamples: ["Sebastián", "PED-4521", "$185.000"],
    footer: "Gracias por tu compra",
  },
  {
    key: "actualizacion_estado",
    label: "Actualización de estado",
    description: "Informa avances de un pedido, trámite o proyecto.",
    group: "operativa",
    category: "UTILITY",
    body:
      "Hola {{1}}, novedades de {brand} sobre {{2}}:\n\n{{3}}\n\nCualquier duda, respóndenos por este chat.",
    bodyExamples: ["Alejandra", "tu proyecto en curso", "ya completamos la primera fase y comenzamos la siguiente etapa"],
  },

  // ── Leads de Meta Ads (flujo Smart Digital Media) ──────────────────────────
  {
    key: "lead_meta_bienvenida",
    label: "Lead Ads · Respuesta inmediata",
    description:
      "Primer mensaje al lead que llenó el formulario del anuncio en Facebook/Instagram. Enviar dentro de los primeros 5 minutos.",
    group: "leads_meta",
    category: "UTILITY",
    body:
      "Hola {{1}}, ¡gracias por tu interés en {brand}! 🙌\n\nVimos que dejaste tus datos en nuestro anuncio sobre {{2}}. Queremos conocer tu caso para darte una asesoría a tu medida.\n\n¿Cuál es tu mayor prioridad en este momento?",
    bodyExamples: ["Lina", "servicios de marketing digital"],
    footer: "Responde SALIR si no deseas recibir mensajes",
    quickReplies: ["Conseguir clientes", "Mejorar mis redes", "Otro tema"],
  },
  {
    key: "lead_meta_agenda",
    label: "Lead Ads · Agendar diagnóstico",
    description: "Invita al lead calificado a una llamada corta de diagnóstico.",
    group: "leads_meta",
    category: "UTILITY",
    body:
      "{{1}}, gracias por contarnos de tu negocio 💼\n\nEl siguiente paso con {brand} es una llamada de diagnóstico de 20 minutos, sin costo, donde revisamos tu situación y te decimos exactamente qué haríamos.\n\n¿Qué día te queda mejor esta semana?",
    bodyExamples: ["Andrés"],
    quickReplies: ["Lunes a miércoles", "Jueves o viernes", "Prefiero escribir"],
  },
  {
    key: "lead_meta_propuesta",
    label: "Lead Ads · Propuesta enviada",
    description: "Confirma el envío de la propuesta y fija fecha de respuesta.",
    group: "leads_meta",
    category: "UTILITY",
    body:
      "Hola {{1}}, ya te enviamos la propuesta de {brand} para {{2}} 📄\n\nRevísala con calma. El plan incluye todo lo que conversamos y los tiempos de implementación.\n\n¿Te parece si lo revisamos juntos el {{3}}?",
    bodyExamples: ["Carolina", "la gestión de tus redes y pauta", "jueves a las 10 a. m."],
    quickReplies: ["De acuerdo", "Otra fecha", "Tengo preguntas"],
  },
  {
    key: "lead_meta_ultimo_intento",
    label: "Lead Ads · Último intento",
    description:
      "Mensaje de cierre respetuoso cuando el lead dejó de responder. Deja la puerta abierta.",
    group: "leads_meta",
    category: "MARKETING",
    body:
      "Hola {{1}}, este es nuestro último mensaje por ahora 🙂\n\nEntendemos que quizás no es el momento para avanzar con {brand}. Cerramos tu solicitud, pero quedamos a un mensaje de distancia cuando quieras retomar.\n\n¡Éxitos con tu proyecto!",
    bodyExamples: ["Julián"],
    quickReplies: ["¡Espera, sí quiero!", "Gracias"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export interface BuiltPreset {
  name: string;
  language: string;
  category: WaTemplateCategory;
  components: WaComponent[];
  tag: string;
}

/** Sustituye {brand} y arma los componentes en el formato Meta. */
export function buildPreset(
  preset: TemplatePreset,
  brandName: string,
  language = "es_CO",
): BuiltPreset {
  const sub = (t: string) => t.replaceAll("{brand}", brandName.trim() || "nuestro equipo");

  const components: WaComponent[] = [];
  if (preset.header) {
    components.push({ type: "HEADER", format: "TEXT", text: sub(preset.header) });
  }
  components.push({
    type: "BODY",
    text: sub(preset.body),
    ...(preset.bodyExamples.length
      ? { example: { body_text: [preset.bodyExamples] } }
      : {}),
  });
  if (preset.footer) {
    // FOOTER ≤60 chars y sin variables — recortamos por seguridad.
    components.push({ type: "FOOTER", text: sub(preset.footer).slice(0, 60) });
  }
  if (preset.quickReplies?.length) {
    components.push({
      type: "BUTTONS",
      buttons: preset.quickReplies.map((text) => ({
        type: "QUICK_REPLY" as const,
        text: text.slice(0, 25),
      })),
    });
  }

  return {
    name: preset.key,
    language,
    category: preset.category,
    components,
    tag: preset.group,
  };
}
