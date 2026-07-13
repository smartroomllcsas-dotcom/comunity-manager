"use client";
import { useEffect, useMemo, useState } from "react";
import { FileCheck2, Send } from "lucide-react";
import type { MessageTemplate } from "@/types/database";

export type InboxTemplate = MessageTemplate & {
  channel_id?: string | null;
};

export function getTemplateBodyPreview(template: InboxTemplate) {
  const components = Array.isArray(template.components) ? template.components : [];
  const body = components.find((component) => {
    if (!component || typeof component !== "object") return false;
    return String((component as { type?: unknown }).type || "").toUpperCase() === "BODY";
  }) as { text?: string } | undefined;

  return body?.text || "Plantilla aprobada de WhatsApp";
}

export function templateHasVariables(template: InboxTemplate) {
  return /\{\{\s*\d+\s*\}\}/.test(getTemplateBodyPreview(template));
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

/** Reemplaza las variables del body con los valores del usuario para la vista previa. */
export function renderTemplatePreview(template: InboxTemplate, values: Record<number, string>) {
  const body = getTemplateBodyPreview(template);
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, raw: string) => {
    const idx = Number(raw);
    const value = values[idx];
    return value && value.trim() ? value : `{{${idx}}}`;
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

/** Construye el payload `components` esperado por la WhatsApp Cloud API. Soporta HEADER + BODY + BUTTONS (quick_reply). */
export function buildTemplateComponents(params: {
  bodyIndices: number[];
  bodyValues: Record<number, string>;
  header?: HeaderInfo;
  headerTextValues?: Record<number, string>;
  headerMediaUrl?: string;
  headerMediaFilename?: string;
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
    }
  }

  if (params.bodyIndices.length > 0) {
    out.push({
      type: "body",
      parameters: params.bodyIndices.map((idx) => ({ type: "text", text: params.bodyValues[idx] ?? "" })),
    });
  }

  // BUTTONS: solo QUICK_REPLY necesita payload en el send request.
  // URL con {{1}} necesitaría un parámetro adicional — no soportado todavía.
  if (params.buttons && params.buttons.length > 0) {
    params.buttons.forEach((btn, index) => {
      if (btn.type !== "QUICK_REPLY") return;
      const payload = params.buttonPayloads?.[index] || btn.text || `button_${index}`;
      out.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(index),
        parameters: [{ type: "payload", payload }],
      });
    });
  }

  return out;
}

/** @deprecated usar buildTemplateComponents. Mantenido por compatibilidad. */
export function buildTemplateBodyComponents(
  indices: number[],
  values: Record<number, string>
): unknown[] {
  return buildTemplateComponents({ bodyIndices: indices, bodyValues: values });
}

type TemplateBannerProps = {
  templates: InboxTemplate[];
  templatesLoading: boolean;
  selectedTemplateId: string;
  onSelectedTemplateChange: (id: string) => void;
  /** Se invoca al enviar. Recibe los components ya armados con los valores del usuario. */
  onSend: (components: unknown[]) => void;
  sending: boolean;
};

export function TemplateBanner({
  templates,
  templatesLoading,
  selectedTemplateId,
  onSelectedTemplateChange,
  onSend,
  sending,
}: TemplateBannerProps) {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const variableIndices = useMemo(
    () => (selectedTemplate ? extractTemplateVariableIndices(selectedTemplate) : []),
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
  const [values, setValues] = useState<Record<number, string>>({});
  const [headerTextValues, setHeaderTextValues] = useState<Record<number, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerMediaFilename, setHeaderMediaFilename] = useState("");
  const [buttonPayloads, setButtonPayloads] = useState<Record<number, string>>({});

  // Reset valores cuando cambia la plantilla seleccionada.
  useEffect(() => {
    setValues({});
    setHeaderTextValues({});
    setHeaderMediaUrl("");
    setHeaderMediaFilename("");
    setButtonPayloads({});
  }, [selectedTemplateId]);

  const allBodyVariablesFilled = variableIndices.every((idx) => (values[idx] ?? "").trim().length > 0);
  const allHeaderTextVarsFilled = header.variableIndices.every((idx) => (headerTextValues[idx] ?? "").trim().length > 0);
  const headerMediaRequired = header.present && (header.format === "IMAGE" || header.format === "VIDEO" || header.format === "DOCUMENT");
  const headerMediaFilled = !headerMediaRequired || headerMediaUrl.trim().length > 0;
  const canSend = !!selectedTemplate && allBodyVariablesFilled && allHeaderTextVarsFilled && headerMediaFilled && !sending;

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
        buttons,
        buttonPayloads,
      })
    );
  };

  const quickReplyButtons = buttons
    .map((btn, index) => ({ ...btn, _index: index }))
    .filter((btn) => btn.type === "QUICK_REPLY");

  return (
    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
          <FileCheck2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-100">Ventana de WhatsApp cerrada</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-100/70">
            Han pasado mas de 24 horas desde el ultimo mensaje del cliente. Para retomar, envia una plantilla aprobada.
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
                <p className="mt-2 text-xs text-amber-300/70">
                  Los encabezados tipo LOCATION requieren enviar coordenadas — no soportado en este editor todavía.
                </p>
              )}
            </div>
          )}
          {selectedTemplate && variableIndices.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {variableIndices.map((idx) => (
                <label key={idx} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-amber-200/70">
                    Variable {`{{${idx}}}`}
                  </span>
                  <input
                    value={values[idx] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [idx]: event.target.value }))
                    }
                    disabled={sending}
                    placeholder={`Valor para {{${idx}}}`}
                    className="min-h-[34px] rounded-md border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                  />
                </label>
              ))}
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
