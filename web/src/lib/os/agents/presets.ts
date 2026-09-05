export interface ConstitutionPreset {
  id: string;
  label: string;
  description: string;
  constitution: Record<string, unknown>;
}

export const PRESETS: ConstitutionPreset[] = [
  {
    id: 'support',
    label: 'Support agent',
    description: 'Responde consultas, escala frustración a humano',
    constitution: {
      max_msg_per_hour: 200,
      max_msg_per_minute_per_contact: 3,
      escalate_on_negative_sentiment: true,
      never_promise_prices: true,
      custom_rules: 'Respondé en español neutral, tono cálido pero profesional.',
    },
  },
  {
    id: 'sales-qualifier',
    label: 'Sales qualifier',
    description: 'Califica leads, agenda con humano si score > 0.7',
    constitution: {
      max_msg_per_hour: 100,
      escalate_on_negative_sentiment: true,
      never_promise_prices: true,
      custom_rules:
        'Hacé max 3 preguntas para calificar (interés, urgencia, presupuesto). Escalar a humano si score >= 0.7.',
    },
  },
  {
    id: 'content-writer',
    label: 'Content writer',
    description: 'Genera drafts de posts para redes',
    constitution: {
      max_msg_per_hour: 20,
      escalate_on_negative_sentiment: false,
      never_promise_prices: false,
      custom_rules:
        'Generar 3 opciones de post con tono del brand. NO publicar directo — solo generar drafts para aprobación.',
    },
  },
  {
    id: 'escalator',
    label: 'Escalator',
    description: 'Detecta urgencia y escala a humano',
    constitution: {
      max_msg_per_hour: 500,
      max_msg_per_minute_per_contact: 1,
      escalate_on_negative_sentiment: true,
      custom_rules:
        'Tu único trabajo es detectar mensajes urgentes (quejas, cancelaciones, oportunidades hot) y notificar al canal Slack de guardia.',
    },
  },
];
