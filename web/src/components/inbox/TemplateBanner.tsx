"use client";
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

type TemplateBannerProps = {
  templates: InboxTemplate[];
  templatesLoading: boolean;
  selectedTemplateId: string;
  onSelectedTemplateChange: (id: string) => void;
  onSend: () => void;
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
  const hasVariables = selectedTemplate ? templateHasVariables(selectedTemplate) : false;

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
              onClick={onSend}
              disabled={!selectedTemplate || sending || hasVariables}
              className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
            >
              <Send className="h-4 w-4" />
              Enviar plantilla
            </button>
          </div>
          {selectedTemplate && (
            <div className="mt-2 rounded-lg border border-[#2d333b] bg-[#0d1117]/80 p-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#8b949e]">Vista previa</p>
              <p className="mt-1 text-xs leading-relaxed text-[#c9d1d9]">
                {getTemplateBodyPreview(selectedTemplate)}
              </p>
              {hasVariables && (
                <p className="mt-2 text-xs text-red-300">
                  Esta plantilla tiene variables. Primero hay que configurar los campos dinamicos antes de enviarla desde el inbox.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
