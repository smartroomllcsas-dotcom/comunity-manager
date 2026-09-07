"use client";
import { useEffect, useMemo, useState } from "react";
import { FileCheck2, Send } from "lucide-react";
import type { MessageTemplate } from "@/types/database";

export type InboxTemplate = MessageTemplate & {
  channel_id?: string | null;
  /** "NAMED" ({{nombre}}) o "POSITIONAL" ({{1}}) — plantillas de cm_wa_templates. */
  parameter_format?: string | null;
  whatsapp_account_id?: string | null;
  source?: "cm" | "legacy";
};

/** Clave de variable tal como aparece en el body: "1", "2" … o "nombre", "tema". */
export type TemplateVarKey = string;
const VAR_RE = /\{\{\s*([A-Za-z_][\w]*|\d+)\s*\}\}/g;

/** Variables del body (numeradas o con nombre), en orden de aparición y sin repetir. */
export function extractTemplateVariables(template: InboxTemplate): TemplateVarKey[] {
  const body = getTemplateBodyPreview(template);
  const keys: TemplateVarKey[] = [];
  for (const match of body.matchAll(VAR_RE)) {
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  // Las numeradas en orden numérico; las con nombre en orden de aparición.
  const numeric = keys.filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  const named = keys.filter((k) => !/^\d+$/.test(k));
  return [...numeric, ...named];
}

export function getTemplateBodyPreview(template: InboxTemplate) {
  const components = Array.isArray(template.components) ? template.components : [];
  const body = components.find((component) => {
    if (!component || typeof component !== "object") return false;
    return String((component as { type?: unknown }).type || "").toUpperCase() === "BODY";
  }) as { text?: string } | undefined;

  return body?.text || "Plantilla aprobada de WhatsApp";
}

export function templateHasVariables(template: InboxTemplate) {
  return extractTemplateVariables(template).length > 0;
}

/** Extrae los índices únicos de variables del body ("{{1}}", "{{2}}", …) en orden ascendente. */
export function extractTemplateVariableIndices(template: InboxTemplate): number[] {
  const body = getTemplateBodyPreview(template);
  const found = new Set<number>();
  const regex = /\{\{\s*(\d+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    const idx = Number(match[1]);
    if (Number.isInteger(idx) && idx > 0) found.add(idx);
  }
  return [...found].sort((a, b) => a - b);
}

/** Reemplaza las variables del body (numeradas o con nombre) con los valores del usuario. */
export function renderTemplatePreview(template: InboxTemplate, values: Record<TemplateVarKey, string>) {
  const body = getTemplateBodyPreview(template);
  return body.replace(VAR_RE, (_, key: string) => {
    const value = values[key];
    return value && value.trim() ? value : `{{${key}}}`;
  });
}

export type TemplateButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | string;
  text: string;
  url?: string;
  phone_number?: string;
};

export function extractButtons(template: InboxTemplate): TemplateButton[] {
  const components = Array.isArray(template.components) ? template.components : [];
  const buttonsComp = components.find((component) => {
    if (!component || typeof component !== "object") return false;
    return String((component as { type?: unknown }).type || "").toUpperCase() === "BUTTONS";
  }) as { buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }> } | undefined;
  const items = Array.isArray(buttonsComp?.buttons) ? buttonsComp!.buttons! : [];
  return items.map((btn) => ({
    type: (btn.type || "").toUpperCase(),
    text: btn.text || "",
    url: btn.url,
    phone_number: btn.phone_number,
  }));
}

export type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

export type HeaderInfo = {
  present: boolean;
  format: HeaderFormat | null;
  text: string; // texto crudo del header si format=TEXT
  variableIndices: number[]; // variables encontradas en el texto del header
};

/** Extrae la info del componente HEADER (si existe) de un template. */
export function extractHeaderInfo(template: InboxTemplate): HeaderInfo {
  const components = Array.isArray(template.components) ? template.components : [];
  const header = components.find((component) => {
    if (!component || typeof component !== "object") return false;
    return String((component as { type?: unknown }).type || "").toUpperCase() === "HEADER";
  }) as { format?: string; text?: string } | undefined;

  if (!header) {
    return { present: false, format: null, text: "", variableIndices: [] };
  }

  const format = (header.format || "TEXT").toUpperCase() as HeaderFormat;
  const text = header.text || "";
  const variableIndices: number[] = [];
  if (format === "TEXT") {
    const found = new Set<number>();
    const regex = /\{\{\s*(\d+)\s*\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const idx = Number(match[1]);
      if (Number.isInteger(idx) && idx > 0) found.add(idx);
    }
    variableIndices.push(...[...found].sort((a, b) => a - b));
  }
  return { present: true, format, text, variableIndices };
}

export type HeaderLocationValues = {
  latitude?: number | string;
  longitude?: number | string;
  name?: string;
  address?: string;
};

/** Construye el payload `components` esperado por la WhatsApp Cloud API. Soporta HEADER + BODY + BUTTONS (quick_reply + url). */
export function buildTemplateComponents(params: {
  /** Claves numeradas (1, 2 o "1", "2") o con nombre ("nombre"). */
  bodyIndices: Array<TemplateVarKey | number>;
  bodyValues: Record<TemplateVarKey | number, string>;
  header?: HeaderInfo;
  headerTextValues?: Record<number, string>;
  headerMediaUrl?: string;
  headerMediaFilename?: string;
  headerLocation?: HeaderLocationValues;
  buttons?: TemplateButton[];
  buttonPayloads?: Record<number, string>;
}): unknown[] {
  const out: unknown[] = [];

  if (params.header?.present) {
    const { format, variableIndices } = params.header;
    if (format === "TEXT" && variableIndices.length > 0) {
      out.push({
        type: "header",
        parameters: variableIndices.map((idx) => ({
          type: "text",
          text: params.headerTextValues?.[idx] ?? "",
        })),
      });
    } else if (format === "IMAGE" && params.headerMediaUrl) {
      out.push({
        type: "header",
        parameters: [{ type: "image", image: { link: params.headerMediaUrl } }],
      });
    } else if (format === "VIDEO" && params.headerMediaUrl) {
      out.push({
        type: "header",
        parameters: [{ type: "video", video: { link: params.headerMediaUrl } }],
      });
    } else if (format === "DOCUMENT" && params.headerMediaUrl) {
      out.push({
        type: "header",
        parameters: [
          {
            type: "document",
            document: {
              link: params.headerMediaUrl,
              filename: params.headerMediaFilename || "documento",
            },
          },
        ],
      });
    } else if (format === "LOCATION" && params.headerLocation) {
      const lat = Number(params.headerLocation.latitude);
      const lng = Number(params.headerLocation.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        out.push({
          type: "header",
          parameters: [
            {
              type: "location",
              location: {
                latitude: lat,
                longitude: lng,
                ...(params.headerLocation.name ? { name: params.headerLocation.name } : {}),
                ...(params.headerLocation.address ? { address: params.headerLocation.address } : {}),
              },
            },
          ],
        });
      }
    }
  }

  if (params.bodyIndices.length > 0) {
    out.push({
      type: "body",
      // Meta exige `parameter_name` para plantillas con variables con nombre
      // ({{nombre}}); las numeradas ({{1}}) van por posición.
      parameters: params.bodyIndices.map((rawKey) => {
        const key = String(rawKey);
        const text = params.bodyValues[rawKey] ?? params.bodyValues[key] ?? "";
        return /^\d+$/.test(key)
          ? { type: "text", text }
          : { type: "text", parameter_name: key, text };
      }),
    });
  }

  // BUTTONS: QUICK_REPLY siempre requiere payload; URL con {{N}} requiere el valor.
  if (params.buttons && params.buttons.length > 0) {
    params.buttons.forEach((btn, index) => {
      if (btn.type === "QUICK_REPLY") {
        const payload = params.buttonPayloads?.[index] || btn.text || `button_${index}`;
        out.push({
          type: "button",
          sub_type: "quick_reply",
          index: String(index),
          parameters: [{ type: "payload", payload }],
        });
      } else if (btn.type === "URL" && btn.url && /\{\{\s*\d+\s*\}\}/.test(btn.url)) {
        const value = params.buttonPayloads?.[index] || "";
        out.push({
          type: "button",
          sub_type: "url",
          index: String(index),
          parameters: [{ type: "text", text: value }],
        });
      }
    });
  }

  return out;
}

export function urlButtonHasVariable(btn: TemplateButton) {
  return btn.type === "URL" && !!btn.url && /\{\{\s*\d+\s*\}\}/.test(btn.url);
}

/** @deprecated usar buildTemplateComponents. Mantenido por compatibilidad. */
export function buildTemplateBodyComponents(
  indices: number[],
  values: Record<number, string>
): unknown[] {
  const bodyValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) bodyValues[String(k)] = v;
  return buildTemplateComponents({ bodyIndices: indices.map(String), bodyValues });
}

type TemplateBannerProps = {
  templates: InboxTemplate[];
  templatesLoading: boolean;
  selectedTemplateId: string;
  onSelectedTemplateChange: (id: string) => void;
  /** Se invoca al enviar. Recibe los components ya armados con los valores del usuario. */
  onSend: (components: unknown[]) => void;
  sending: boolean;
  /** Datos del contacto para rellenar las variables solas (nombre, tema…). */
  contactName?: string | null;
  contactFields?: Record<string, unknown> | null;
};

/** Etiqueta legible y ayuda para cada variable de la plantilla. */
function describeVariable(key: TemplateVarKey): { label: string; hint: string; placeholder: string } {
  const k = key.toLowerCase();
  if (/^\d+$/.test(key)) {
    return { label: `Variable {{${key}}}`, hint: "Texto que reemplaza ese hueco en el mensaje.", placeholder: `Valor para {{${key}}}` };
  }
  if (/nombre|name/.test(k)) {
    return { label: "Nombre del cliente", hint: "Así lo saludará el mensaje. Se rellena con el nombre del contacto.", placeholder: "Ej: Ana" };
  }
  if (/tema|topic|campa|proyecto|asunto|servicio/.test(k)) {
    return { label: "Tema o proyecto", hint: "De qué trata la conversación. Ej: tu página web, la campaña de anuncios.", placeholder: "Ej: tu tienda online" };
  }
  if (/empresa|company|negocio/.test(k)) {
    return { label: "Empresa del cliente", hint: "Nombre de su empresa o negocio.", placeholder: "Ej: Ferretería El Sol" };
  }
  if (/fecha|date|dia/.test(k)) {
    return { label: "Fecha", hint: "Fecha que verá el cliente.", placeholder: "Ej: martes 9 de septiembre" };
  }
  if (/hora|time/.test(k)) {
    return { label: "Hora", hint: "Hora que verá el cliente.", placeholder: "Ej: 3:00 PM" };
  }
  return { label: key.replace(/_/g, " "), hint: `Reemplaza el hueco {{${key}}} del mensaje.`, placeholder: `Valor para ${key}` };
}

/** Valor inicial de una variable a partir del contacto (para no escribir a mano lo obvio). */
function defaultVariableValue(key: TemplateVarKey, contactName?: string | null, fields?: Record<string, unknown> | null): string {
  const k = key.toLowerCase();
  const cf = fields || {};
  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = cf[n];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  if (/nombre|name/.test(k)) {
    const full = pick("nombre", "full_name") || (contactName || "").trim();
    // Sólo el primer nombre; nunca un número de teléfono o un @usuario.
    const first = full.split(/\s+/)[0] || "";
    return /^[+\d@]/.test(first) ? "" : first;
  }
  if (/tema|topic|campa|proyecto|asunto|servicio/.test(k)) {
    return pick("proyecto", "lead_campaign", "tema") || "tu proyecto";
  }
  if (/empresa|company|negocio/.test(k)) return pick("empresa", "company_name");
  if (/correo|email/.test(k)) return pick("correo", "email");
  return "";
}

export function TemplateBanner({
  templates,
  templatesLoading,
  selectedTemplateId,
  onSelectedTemplateChange,
  onSend,
  sending,
  contactName,
  contactFields,
}: TemplateBannerProps) {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const variableIndices = useMemo(
    () => (selectedTemplate ? extractTemplateVariables(selectedTemplate) : []),
    [selectedTemplate]
  );
  const header = useMemo(
    () => (selectedTemplate ? extractHeaderInfo(selectedTemplate) : { present: false, format: null, text: "", variableIndices: [] }),
    [selectedTemplate]
  );
  const buttons = useMemo(
    () => (selectedTemplate ? extractButtons(selectedTemplate) : []),
    [selectedTemplate]
  );
  const [values, setValues] = useState<Record<TemplateVarKey, string>>({});
  const [headerTextValues, setHeaderTextValues] = useState<Record<number, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerMediaFilename, setHeaderMediaFilename] = useState("");
  const [headerLocation, setHeaderLocation] = useState<HeaderLocationValues>({});
  const [buttonPayloads, setButtonPayloads] = useState<Record<number, string>>({});

  // Al cambiar de plantilla se reinician los valores y se rellenan solos los
  // que salen del contacto (nombre, tema, empresa…); el asesor sólo corrige.
  useEffect(() => {
    const initial: Record<TemplateVarKey, string> = {};
    for (const key of variableIndices) {
      const v = defaultVariableValue(key, contactName, contactFields);
      if (v) initial[key] = v;
    }
    setValues(initial);
    setHeaderTextValues({});
    setHeaderMediaUrl("");
    setHeaderMediaFilename("");
    setHeaderLocation({});
    setButtonPayloads({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al cambiar de plantilla
  }, [selectedTemplateId]);

  const allBodyVariablesFilled = variableIndices.every((idx) => (values[idx] ?? "").trim().length > 0);
  const allHeaderTextVarsFilled = header.variableIndices.every((idx) => (headerTextValues[idx] ?? "").trim().length > 0);
  const headerMediaRequired = header.present && (header.format === "IMAGE" || header.format === "VIDEO" || header.format === "DOCUMENT");
  const headerMediaFilled = !headerMediaRequired || headerMediaUrl.trim().length > 0;
  const headerLocationRequired = header.present && header.format === "LOCATION";
  const headerLocationFilled =
    !headerLocationRequired ||
    (Number.isFinite(Number(headerLocation.latitude)) && Number.isFinite(Number(headerLocation.longitude)));

  const quickReplyButtons = buttons
    .map((btn, index) => ({ ...btn, _index: index }))
    .filter((btn) => btn.type === "QUICK_REPLY");

  const urlButtonsWithVar = buttons
    .map((btn, index) => ({ ...btn, _index: index }))
    .filter((btn) => urlButtonHasVariable(btn));

  const allUrlVarsFilled = urlButtonsWithVar.every(
    (btn) => (buttonPayloads[btn._index] ?? "").trim().length > 0
  );

  const canSend =
    !!selectedTemplate &&
    allBodyVariablesFilled &&
    allHeaderTextVarsFilled &&
    headerMediaFilled &&
    headerLocationFilled &&
    allUrlVarsFilled &&
    !sending;

  const previewText = selectedTemplate ? renderTemplatePreview(selectedTemplate, values) : "";

  const handleSend = () => {
    if (!selectedTemplate) return;
    onSend(
      buildTemplateComponents({
        bodyIndices: variableIndices,
        bodyValues: values,
        header,
        headerTextValues,
        headerMediaUrl: headerMediaUrl.trim() || undefined,
        headerMediaFilename: headerMediaFilename.trim() || undefined,
        headerLocation: headerLocationRequired ? headerLocation : undefined,
        buttons,
        buttonPayloads,
      })
    );
  };

  return (
    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
          <FileCheck2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-100">Ventana de WhatsApp cerrada</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-100/70">
            Pasaron más de 24 horas desde el último mensaje del cliente (la fecha exacta está arriba). Para retomar, envía una
            de las plantillas aprobadas de esta empresa.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={selectedTemplateId}
              onChange={(event) => onSelectedTemplateChange(event.target.value)}
              disabled={sending || templatesLoading || templates.length === 0}
              className="min-h-[38px] flex-1 rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
            >
              <option value="">
                {templatesLoading
                  ? "Cargando plantillas..."
                  : templates.length === 0
                    ? "No hay plantillas aprobadas"
                    : "Selecciona una plantilla"}
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.language}
                </option>
              ))}
            </select>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
            >
              <Send className="h-4 w-4" />
              Enviar plantilla
            </button>
          </div>
          {selectedTemplate && header.present && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
                Encabezado ({header.format?.toLowerCase()})
              </p>
              {header.format === "TEXT" && header.variableIndices.length > 0 && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {header.variableIndices.map((idx) => (
                    <label key={`header-${idx}`} className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
                        Encabezado {`{{${idx}}}`}
                      </span>
                      <input
                        value={headerTextValues[idx] ?? ""}
                        onChange={(event) =>
                          setHeaderTextValues((prev) => ({ ...prev, [idx]: event.target.value }))
                        }
                        disabled={sending}
                        placeholder={`Valor encabezado {{${idx}}}`}
                        className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                      />
                    </label>
                  ))}
                </div>
              )}
              {headerMediaRequired && (
                <div className="mt-2 flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
                      URL de {header.format?.toLowerCase()}
                    </span>
                    <input
                      value={headerMediaUrl}
                      onChange={(event) => setHeaderMediaUrl(event.target.value)}
                      disabled={sending}
                      placeholder={`https://…/${header.format?.toLowerCase()}.ext`}
                      className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                    />
                  </label>
                  {header.format === "DOCUMENT" && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
                        Nombre del archivo (opcional)
                      </span>
                      <input
                        value={headerMediaFilename}
                        onChange={(event) => setHeaderMediaFilename(event.target.value)}
                        disabled={sending}
                        placeholder="documento.pdf"
                        className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                      />
                    </label>
                  )}
                </div>
              )}
              {header.format === "LOCATION" && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">Latitud</span>
                    <input
                      type="number"
                      step="any"
                      value={headerLocation.latitude ?? ""}
                      onChange={(event) =>
                        setHeaderLocation((prev) => ({ ...prev, latitude: event.target.value }))
                      }
                      disabled={sending}
                      placeholder="4.7110"
                      className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">Longitud</span>
                    <input
                      type="number"
                      step="any"
                      value={headerLocation.longitude ?? ""}
                      onChange={(event) =>
                        setHeaderLocation((prev) => ({ ...prev, longitude: event.target.value }))
                      }
                      disabled={sending}
                      placeholder="-74.0721"
                      className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                    />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">Nombre (opcional)</span>
                    <input
                      value={headerLocation.name ?? ""}
                      onChange={(event) => setHeaderLocation((prev) => ({ ...prev, name: event.target.value }))}
                      disabled={sending}
                      placeholder="Tienda Centro"
                      className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                    />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">Dirección (opcional)</span>
                    <input
                      value={headerLocation.address ?? ""}
                      onChange={(event) => setHeaderLocation((prev) => ({ ...prev, address: event.target.value }))}
                      disabled={sending}
                      placeholder="Cra 7 #12-34, Bogotá"
                      className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
          {selectedTemplate && variableIndices.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] leading-relaxed text-amber-100/70">
                La plantilla tiene huecos escritos como {"{{nombre}}"} o {"{{tema}}"}. Escribe aquí el valor de cada uno,
                sin llaves: en el mensaje se reemplazan solos. Los que salen del contacto ya vienen rellenados.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {variableIndices.map((idx) => {
                  const meta = describeVariable(idx);
                  return (
                    <label key={idx} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-amber-100">
                        {meta.label}
                        <span className="ml-1 font-normal text-amber-200/60">{`{{${idx}}}`}</span>
                      </span>
                      <input
                        value={values[idx] ?? ""}
                        onChange={(event) =>
                          setValues((prev) => ({ ...prev, [idx]: event.target.value }))
                        }
                        disabled={sending}
                        placeholder={meta.placeholder}
                        className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                      />
                      <span className="text-[10px] text-amber-200/60">{meta.hint}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {selectedTemplate && buttons.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
                Botones ({buttons.length})
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {buttons.map((btn, index) => (
                  <li
                    key={`btn-${index}`}
                    className="rounded-md border border-[#2d333b] bg-[#0d1117] px-2 py-1 text-xs text-[#c9d1d9]"
                  >
                    <span className="text-[9px] uppercase text-[#484f58] mr-1">{btn.type.toLowerCase()}</span>
                    {btn.text || "(sin texto)"}
                    {btn.type === "URL" && btn.url && (
                      <span className="ml-1 text-[10px] text-[#484f58]">→ {btn.url.slice(0, 40)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {quickReplyButtons.length > 0 && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {quickReplyButtons.map((btn) => (
                    <label key={`payload-${btn._index}`} className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
                        Payload de &quot;{btn.text}&quot;
                      </span>
                      <input
                        value={buttonPayloads[btn._index] ?? btn.text}
                        onChange={(event) =>
                          setButtonPayloads((prev) => ({ ...prev, [btn._index]: event.target.value }))
                        }
                        disabled={sending}
                        placeholder={btn.text}
                        className="min-h-[30px] rounded-md border border-[#2d333b] bg-[#0d1117] px-2 text-xs text-white outline-none focus:border-amber-400/70"
                      />
                    </label>
                  ))}
                </div>
              )}
              {urlButtonsWithVar.length > 0 && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {urlButtonsWithVar.map((btn) => (
                    <label key={`url-${btn._index}`} className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
                        Variable URL &quot;{btn.text}&quot;
                      </span>
                      <input
                        value={buttonPayloads[btn._index] ?? ""}
                        onChange={(event) =>
                          setButtonPayloads((prev) => ({ ...prev, [btn._index]: event.target.value }))
                        }
                        disabled={sending}
                        placeholder={btn.url}
                        className="min-h-[30px] rounded-md border border-[#2d333b] bg-[#0d1117] px-2 text-xs text-white outline-none focus:border-amber-400/70"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {selectedTemplate && (
            <div className="mt-2 rounded-lg border border-[#2d333b] bg-[#0d1117]/80 p-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#8b949e]">Vista previa</p>
              <p className="mt-1 text-xs leading-relaxed text-[#c9d1d9] whitespace-pre-wrap">
                {previewText}
              </p>
              {!canSend && (
                <p className="mt-2 text-xs text-amber-300/80">
                  Completa {headerMediaRequired ? "el encabezado y " : ""}
                  todas las variables antes de enviar.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
