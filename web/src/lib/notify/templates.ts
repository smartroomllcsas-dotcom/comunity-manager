/**
 * Sprint 26 · Agente Q — inline notification templates.
 *
 * Simple mustache-style rendering: {{variable}} tokens are replaced by
 * values from the vars map. Missing vars render as empty strings.
 * NOT a full templating engine — no logic, no partials, no HTML escaping
 * (we control the template strings). Callers should sanitize variables
 * that come from untrusted sources before passing them in.
 */

export type TemplateId =
  | "approval_request"
  | "approval_response"
  | "crisis_alert"
  | "weekly_report"
  | "custom";

export type Vars = Record<string, unknown>;

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
  slack: string;
  whatsappTemplateName?: string;
  whatsappBodyVars?: string[];
}

function render(str: string, vars: Vars): string {
  return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const raw = vars[key];
    if (raw === null || raw === undefined) return "";
    return String(raw);
  });
}

function baseHtml(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 16px">${title}</h2>
<div style="font-size:15px">${body}</div>
<hr style="border:none;border-top:1px solid #eee;margin:32px 0 12px">
<p style="font-size:12px;color:#888">Community Manager Platform · notificación automática</p>
</body></html>`;
}

const TEMPLATES: Record<Exclude<TemplateId, "custom">, {
  subject: string;
  html: string;
  text: string;
  slack: string;
  whatsappTemplateName?: string;
  whatsappBodyVarsKeys?: string[];
}> = {
  approval_request: {
    subject: "Revisión requerida: {{post_title}}",
    html: baseHtml(
      "Tu agencia solicita tu revisión",
      `<p>Hola <b>{{client_name}}</b>,</p>
<p>Tu agencia te pide revisar el siguiente post antes de publicarlo:</p>
<p><a href="{{approval_url}}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Revisar post</a></p>
<p style="font-size:13px;color:#666">Este enlace es personal. No lo compartas.</p>`,
    ),
    text: "Hola {{client_name}}, tu agencia te pide revisar el siguiente post: {{approval_url}}",
    slack: ":eyes: Aprobación pendiente para *{{client_name}}* → {{approval_url}}",
    whatsappTemplateName: "cm_approval_request",
    whatsappBodyVarsKeys: ["client_name", "approval_url"],
  },
  approval_response: {
    subject: "Cliente {{decision}} post: {{post_title}}",
    html: baseHtml(
      "Respuesta del cliente",
      `<p>El cliente <b>{{client_name}}</b> <b>{{decision}}</b> el post <a href="{{post_url}}">{{post_title}}</a>.</p>
<p><b>Comentarios:</b><br>{{comments}}</p>`,
    ),
    text: "El cliente {{client_name}} {{decision}} el post {{post_url}}. Comentarios: {{comments}}",
    slack:
      ":speech_balloon: *{{client_name}}* {{decision}} el post — <{{post_url}}|ver post>\n> {{comments}}",
    whatsappTemplateName: "cm_approval_response",
    whatsappBodyVarsKeys: ["client_name", "decision", "post_url"],
  },
  crisis_alert: {
    subject: "🚨 Crisis detectada: {{client_name}}",
    html: baseHtml(
      "Alerta de crisis",
      `<p><b>🚨 Se detectó una posible crisis en {{client_name}}.</b></p>
<ul>
  <li>Health score: <b>{{health_score}}</b></li>
  <li>Delta vs 24h: <b>{{delta_pct}}%</b></li>
  <li>Menciones urgentes: <b>{{urgent_count}}</b></li>
</ul>
<p><a href="{{listening_url}}">Ver detalle en Community Listening →</a></p>`,
    ),
    text:
      "🚨 Crisis detectada en {{client_name}}: health score cayó a {{health_score}} ({{delta_pct}}%). Ver: {{listening_url}}",
    slack:
      ":rotating_light: *Crisis en {{client_name}}* — health {{health_score}} ({{delta_pct}}%) · <{{listening_url}}|ver detalle>",
    whatsappTemplateName: "cm_crisis_alert",
    whatsappBodyVarsKeys: ["client_name", "health_score", "delta_pct"],
  },
  weekly_report: {
    subject: "Reporte semanal · {{client_name}}",
    html: baseHtml(
      "Tu reporte semanal está listo",
      `<p>Hola,</p>
<p>Adjuntamos el reporte semanal de <b>{{client_name}}</b> para la semana del {{week_start}} al {{week_end}}.</p>
<p>Highlights:</p>
<ul>
  <li>Impresiones: <b>{{impressions}}</b></li>
  <li>Engagement: <b>{{engagement}}</b></li>
  <li>Crecimiento: <b>{{growth}}</b></li>
</ul>`,
    ),
    text:
      "Reporte semanal de {{client_name}} adjunto. Semana {{week_start}}–{{week_end}}.",
    slack:
      ":bar_chart: Reporte semanal de *{{client_name}}* listo — impresiones {{impressions}}, engagement {{engagement}}.",
  },
};

export function renderTemplate(id: TemplateId, vars: Vars): RenderedTemplate {
  if (id === "custom") {
    const subject = typeof vars.subject === "string" ? vars.subject : "Notificación";
    const html = typeof vars.html === "string" ? vars.html : (typeof vars.text === "string" ? String(vars.text) : "");
    const text = typeof vars.text === "string" ? vars.text : "";
    const slack = typeof vars.slack === "string" ? vars.slack : text;
    return { subject, html, text, slack };
  }
  const tpl = TEMPLATES[id];
  const bodyVars = tpl.whatsappBodyVarsKeys?.map((k) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
  return {
    subject: render(tpl.subject, vars),
    html: render(tpl.html, vars),
    text: render(tpl.text, vars),
    slack: render(tpl.slack, vars),
    whatsappTemplateName: tpl.whatsappTemplateName,
    whatsappBodyVars: bodyVars,
  };
}
