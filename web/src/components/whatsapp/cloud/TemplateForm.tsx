"use client";
import { useMemo, useState } from "react";
import type {
  WaButton,
  WaComponent,
  WaHeaderFormat,
  WaTemplateCategory,
} from "@/lib/whatsapp/cloud/types";
import { TemplatePreview } from "./TemplatePreview";

export interface TemplateFormValue {
  name: string;
  language: string;
  category: WaTemplateCategory;
  components: WaComponent[];
  tag: string;
}

const DEFAULT: TemplateFormValue = {
  name: "",
  language: "es_CO",
  category: "UTILITY",
  components: [{ type: "BODY", text: "Hola {{1}}, tu pedido {{2}} fue enviado." }],
  tag: "",
};

const LANGUAGES = [
  { value: "es_CO", label: "Español (Colombia)" },
  { value: "es_ES", label: "Español (España)" },
  { value: "es",    label: "Español" },
  { value: "en_US", label: "Inglés (US)" },
  { value: "en",    label: "Inglés" },
  { value: "pt_BR", label: "Portugués (Brasil)" },
];

const CATEGORIES: { value: WaTemplateCategory; label: string; hint: string }[] = [
  { value: "UTILITY",       label: "Utilidad",       hint: "Confirmaciones, updates, notificaciones (más barato)" },
  { value: "MARKETING",     label: "Marketing",      hint: "Promos, ofertas, upsell (más caro)" },
  { value: "AUTHENTICATION",label: "Autenticación",  hint: "OTP, códigos de verificación" },
];

export function TemplateForm({
  initial = DEFAULT,
  submitting,
  submitLabel = "Crear plantilla",
  onSubmit,
}: {
  initial?: TemplateFormValue;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (v: TemplateFormValue) => void;
}) {
  const [value, setValue] = useState<TemplateFormValue>(initial);

  const variables = useMemo(() => {
    const body = value.components.find((c) => c.type === "BODY");
    if (!body?.text) return 0;
    const nums = new Set(
      (body.text.match(/\{\{\s*(\d+)\s*\}\}/g) || []).map((m) => Number(m.replace(/[^\d]/g, "")))
    );
    return nums.size;
  }, [value.components]);

  function setComponent(type: WaComponent["type"], patch: Partial<WaComponent> | null) {
    setValue((v) => {
      const rest = v.components.filter((c) => c.type !== type);
      if (patch === null) return { ...v, components: rest };
      const existing = v.components.find((c) => c.type === type);
      const merged: WaComponent = { ...(existing ?? { type }), ...patch, type };
      return { ...v, components: [...rest, merged].sort(sortComponents) };
    });
  }

  function addButton(type: WaButton["type"]) {
    setValue((v) => {
      const existing = v.components.find((c) => c.type === "BUTTONS");
      const list = existing?.buttons ?? [];
      const newBtn: WaButton = { type, text: type === "QUICK_REPLY" ? "Responder" : type === "URL" ? "Ver detalles" : "Llamar" };
      if (type === "URL") newBtn.url = "https://ejemplo.com/{{1}}";
      if (type === "PHONE_NUMBER") newBtn.phone_number = "+573000000000";
      return {
        ...v,
        components: [
          ...v.components.filter((c) => c.type !== "BUTTONS"),
          { type: "BUTTONS", buttons: [...list, newBtn] },
        ].sort(sortComponents),
      };
    });
  }

  function updateButton(idx: number, patch: Partial<WaButton>) {
    setValue((v) => {
      const existing = v.components.find((c) => c.type === "BUTTONS");
      if (!existing?.buttons) return v;
      const buttons = existing.buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b));
      return {
        ...v,
        components: [
          ...v.components.filter((c) => c.type !== "BUTTONS"),
          { type: "BUTTONS", buttons },
        ].sort(sortComponents),
      };
    });
  }

  function removeButton(idx: number) {
    setValue((v) => {
      const existing = v.components.find((c) => c.type === "BUTTONS");
      if (!existing?.buttons) return v;
      const buttons = existing.buttons.filter((_, i) => i !== idx);
      return {
        ...v,
        components: [
          ...v.components.filter((c) => c.type !== "BUTTONS"),
          ...(buttons.length ? [{ type: "BUTTONS" as const, buttons }] : []),
        ].sort(sortComponents),
      };
    });
  }

  const header = value.components.find((c) => c.type === "HEADER");
  const body = value.components.find((c) => c.type === "BODY");
  const footer = value.components.find((c) => c.type === "FOOTER");
  const buttons = value.components.find((c) => c.type === "BUTTONS");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6"
    >
      <div className="space-y-4">
        {/* Nombre + idioma + categoría */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Nombre (snake_case)">
            <input
              className="input"
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value.toLowerCase() })}
              placeholder="pedido_despachado"
              pattern="^[a-z0-9_]+$"
              required
              maxLength={512}
            />
          </Field>
          <Field label="Idioma">
            <select
              className="input"
              value={value.language}
              onChange={(e) => setValue({ ...value, language: e.target.value })}
            >
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Categoría">
            <select
              className="input"
              value={value.category}
              onChange={(e) => setValue({ ...value, category: e.target.value as WaTemplateCategory })}
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <p className="text-xs text-[#8b949e] mt-1">
              {CATEGORIES.find((c) => c.value === value.category)?.hint}
            </p>
          </Field>
        </div>

        {/* HEADER opcional */}
        <div className="rounded-lg border border-[#2d333b] bg-[#0d1117] p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Encabezado (opcional)</h4>
            {header ? (
              <button type="button" className="text-xs text-red-400" onClick={() => setComponent("HEADER", null)}>
                Quitar
              </button>
            ) : (
              <button
                type="button"
                className="text-xs text-blue-400"
                onClick={() => setComponent("HEADER", { format: "TEXT", text: "" })}
              >
                + Agregar
              </button>
            )}
          </div>
          {header && (
            <div className="space-y-2">
              <select
                className="input"
                value={header.format ?? "TEXT"}
                onChange={(e) => setComponent("HEADER", { format: e.target.value as WaHeaderFormat, text: e.target.value === "TEXT" ? header.text ?? "" : "" })}
              >
                <option value="TEXT">Texto</option>
                <option value="IMAGE">Imagen</option>
                <option value="VIDEO">Video</option>
                <option value="DOCUMENT">Documento</option>
              </select>
              {header.format === "TEXT" && (
                <input
                  className="input"
                  maxLength={60}
                  value={header.text ?? ""}
                  onChange={(e) => setComponent("HEADER", { text: e.target.value })}
                  placeholder="Máximo 60 caracteres"
                />
              )}
              {header.format && header.format !== "TEXT" && (
                <p className="text-xs text-[#8b949e]">
                  Media dinámica: se pasa al enviar. Para preview subí media handle vía Resumable Upload API.
                </p>
              )}
            </div>
          )}
        </div>

        {/* BODY obligatorio */}
        <div className="rounded-lg border border-[#2d333b] bg-[#0d1117] p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Cuerpo <span className="text-red-400">*</span></h4>
            <span className="text-xs text-[#8b949e]">{variables} variables · {(body?.text?.length ?? 0)}/1024</span>
          </div>
          <textarea
            className="input min-h-[110px]"
            required
            maxLength={1024}
            value={body?.text ?? ""}
            onChange={(e) => setComponent("BODY", { text: e.target.value })}
            placeholder="Usá {{1}}, {{2}} para variables. Ej: Hola {{1}}, tu pedido {{2}} fue enviado."
          />
          <p className="text-xs text-[#8b949e] mt-1">
            No poner URLs sueltas — Meta rechaza. Usar botón CTA URL.
          </p>
        </div>

        {/* FOOTER opcional */}
        <div className="rounded-lg border border-[#2d333b] bg-[#0d1117] p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Pie (opcional)</h4>
            {footer ? (
              <button type="button" className="text-xs text-red-400" onClick={() => setComponent("FOOTER", null)}>
                Quitar
              </button>
            ) : (
              <button
                type="button"
                className="text-xs text-blue-400"
                onClick={() => setComponent("FOOTER", { text: "" })}
              >
                + Agregar
              </button>
            )}
          </div>
          {footer && (
            <input
              className="input"
              maxLength={60}
              value={footer.text ?? ""}
              onChange={(e) => setComponent("FOOTER", { text: e.target.value })}
              placeholder="Máx 60 chars. No admite variables."
            />
          )}
        </div>

        {/* BUTTONS opcional */}
        <div className="rounded-lg border border-[#2d333b] bg-[#0d1117] p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Botones (opcional)</h4>
            <div className="flex gap-1">
              <button type="button" className="text-xs px-2 py-0.5 rounded bg-[#21262d] text-[#c9d1d9]" onClick={() => addButton("QUICK_REPLY")}>
                + Respuesta
              </button>
              <button type="button" className="text-xs px-2 py-0.5 rounded bg-[#21262d] text-[#c9d1d9]" onClick={() => addButton("URL")}>
                + URL
              </button>
              <button type="button" className="text-xs px-2 py-0.5 rounded bg-[#21262d] text-[#c9d1d9]" onClick={() => addButton("PHONE_NUMBER")}>
                + Llamar
              </button>
            </div>
          </div>
          {buttons?.buttons?.map((b, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <span className="text-xs text-[#8b949e] mt-2 w-24">{b.type}</span>
              <div className="flex-1 space-y-1">
                <input
                  className="input"
                  maxLength={25}
                  value={b.text ?? ""}
                  onChange={(e) => updateButton(i, { text: e.target.value })}
                  placeholder="Texto del botón (máx 25)"
                />
                {b.type === "URL" && (
                  <input
                    className="input"
                    value={b.url ?? ""}
                    onChange={(e) => updateButton(i, { url: e.target.value })}
                    placeholder="https://tu.com/{{1}}  (variable solo al final)"
                  />
                )}
                {b.type === "PHONE_NUMBER" && (
                  <input
                    className="input"
                    value={b.phone_number ?? ""}
                    onChange={(e) => updateButton(i, { phone_number: e.target.value })}
                    placeholder="+573001234567"
                  />
                )}
              </div>
              <button type="button" className="text-xs text-red-400 mt-2" onClick={() => removeButton(i)}>
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Tag opcional */}
        <Field label="Etiqueta interna (opcional)">
          <input
            className="input"
            value={value.tag}
            onChange={(e) => setValue({ ...value, tag: e.target.value })}
            placeholder="p.ej: campaña-navidad-2026"
            maxLength={120}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "Enviando..." : submitLabel}
          </button>
        </div>
      </div>

      {/* Preview column */}
      <div>
        <div className="sticky top-4 space-y-2">
          <h4 className="text-sm text-[#8b949e]">Vista previa</h4>
          <TemplatePreview
            components={value.components}
            samples={Array.from({ length: variables }, (_, i) => `Muestra ${i + 1}`)}
          />
          <p className="text-xs text-[#8b949e]">Variables se rellenan con datos reales al enviar.</p>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-[#8b949e] mb-1">{label}</span>
      {children}
    </label>
  );
}

function sortComponents(a: WaComponent, b: WaComponent) {
  const order: Record<string, number> = { HEADER: 0, BODY: 1, FOOTER: 2, BUTTONS: 3 };
  return (order[a.type] ?? 9) - (order[b.type] ?? 9);
}
