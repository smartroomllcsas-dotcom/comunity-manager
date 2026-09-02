"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { AGENT_ROLES, AGENT_TONES, AGENT_GOALS } from "@/lib/whatsapp/cloud/agent-presets";

export const dynamic = "force-dynamic";

interface TemplateOption {
  id: string;
  name: string;
  language: string;
  status: string;
  tag: string | null;
  category: string;
}

interface Settings {
  enabled: boolean;
  first_touch_template_id: string | null;
  reengage_template_id: string | null;
  reengage_after_hours: number;
  agent_role: string | null;
  agent_tone: string | null;
  agent_goal: string | null;
  agent_context: string | null;
  booking_url: string | null;
  max_sends_per_hour: number;
  brochure_url: string | null;
  brochure_filename: string | null;
  brochure_mode: string;
  response_delay_seconds: number;
}

const DEFAULT_CONTEXT = `Eres el asesor comercial de esta empresa. Tu objetivo es calificar al lead y llevarlo a agendar una cita.

Información que DEBES recolectar antes de ofrecer la cita:
1. ¿Qué tipo de proyecto necesita? (página web, app, CRM, tienda online, etc.)
2. ¿Para qué tipo de negocio es?
3. ¿Tiene un presupuesto estimado o rango?
4. ¿Para cuándo lo necesita?

Reglas:
- Haz UNA pregunta a la vez, conversación natural y cercana.
- No inventes precios ni prometas fechas: eso se define en la cita.
- Cuando tengas la información básica, invita a agendar la reunión.
- Si piden hablar con un humano, escala la conversación.`;

const emptySettings: Settings = {
  enabled: false,
  first_touch_template_id: null,
  reengage_template_id: null,
  reengage_after_hours: 24,
  agent_role: "asesor_ventas",
  agent_tone: "amable",
  agent_goal: "calificar_y_agendar",
  agent_context: null,
  booking_url: null,
  max_sends_per_hour: 20,
  brochure_url: null,
  brochure_filename: null,
  brochure_mode: "off",
  response_delay_seconds: 0,
};

export default function LeadAutomationPage() {
  const { clients, activeClientId, setActiveClientId } = useActiveBrand();
  const clientId = activeClientId;
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingBrochure, setUploadingBrochure] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/cloud/lead-settings?clientId=${clientId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar");
      setSettings({ ...emptySettings, ...(data.settings ?? {}) });
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUploadBrochure(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    setUploadingBrochure(true);
    try {
      const fd = new FormData();
      fd.append("clientId", clientId);
      fd.append("file", file);
      const res = await fetch("/api/whatsapp/cloud/brochure", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo subir");
      setSettings((s) => ({
        ...s,
        brochure_url: data.brochure_url,
        brochure_filename: data.brochure_filename,
        brochure_mode: s.brochure_mode === "off" ? "on_request" : s.brochure_mode,
      }));
      toast.success("Catálogo subido");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingBrochure(false);
      e.target.value = "";
    }
  }

  async function handleRemoveBrochure() {
    if (!clientId) return;
    setUploadingBrochure(true);
    try {
      const res = await fetch(`/api/whatsapp/cloud/brochure?clientId=${clientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo quitar");
      setSettings((s) => ({ ...s, brochure_url: null, brochure_filename: null, brochure_mode: "off" }));
      toast.success("Catálogo quitado");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingBrochure(false);
    }
  }

  async function handleSave() {
    if (!clientId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/cloud/lead-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, ...settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setSettings({ ...emptySettings, ...(data.settings ?? {}) });
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const approved = templates.filter((t) => t.status === "APPROVED");
  const templateLabel = (t: TemplateOption) =>
    `${t.name} (${t.language})${t.status !== "APPROVED" ? ` — ${t.status}` : ""}${t.tag ? ` · ${t.tag}` : ""}`;

  const selectCls =
    "w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-2 text-sm text-white";

  return (
    <div className="min-h-full bg-[#0d1117] text-[#c9d1d9]">
      <div className="border-b border-[#2d333b] bg-[#161b22] px-6 py-4">
        <Link href="/whatsapp/templates" className="text-sm text-[#8b949e] hover:text-white">
          ← Plantillas
        </Link>
        <h1 className="text-xl font-semibold">Automatización de leads</h1>
        <p className="text-sm text-[#8b949e]">
          Configura el agente de IA por empresa para <strong>WhatsApp, Messenger e Instagram</strong>:
          rol, tono, objetivo, datos a recopilar y el enlace de agenda para llevar al lead a una reunión.
          Las plantillas aplican solo a WhatsApp; en Messenger e Instagram el agente responde directo.
        </p>
      </div>

      <div className="px-6 py-4 max-w-3xl space-y-5">
        {/* Marca */}
        <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4">
          <label className="block text-xs text-[#8b949e] mb-1">Empresa / Marca</label>
          <select
            className={selectCls}
            value={clientId ?? ""}
            onChange={(e) => setActiveClientId(e.target.value || null)}
          >
            <option value="">— seleccionar —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.id}
              </option>
            ))}
          </select>
        </div>

        {clientId && (
          <>
            {/* Activar */}
            <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Abordaje automático activo</p>
                <p className="text-xs text-[#8b949e]">
                  Al llegar un lead de formulario con teléfono, se le envía la plantilla de
                  primer contacto por WhatsApp.
                </p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 accent-blue-500"
                checked={settings.enabled}
                onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
              />
            </div>

            {/* Plantillas */}
            <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4 space-y-4">
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">
                  Plantilla de PRIMER CONTACTO (lead nuevo)
                </label>
                <select
                  className={selectCls}
                  value={settings.first_touch_template_id ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, first_touch_template_id: e.target.value || null }))
                  }
                >
                  <option value="">— sin plantilla (no se envía nada) —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.status !== "APPROVED"}>
                      {templateLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">
                  Plantilla de RETOMAR CONVERSACIÓN
                </label>
                <select
                  className={selectCls}
                  value={settings.reengage_template_id ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, reengage_template_id: e.target.value || null }))
                  }
                >
                  <option value="">— sin plantilla —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.status !== "APPROVED"}>
                      {templateLabel(t)}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-[#8b949e]">Retomar después de</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    className="w-20 rounded-md bg-[#0d1117] border border-[#2d333b] px-2 py-1 text-sm text-white"
                    value={settings.reengage_after_hours}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        reengage_after_hours: Math.max(1, Math.min(168, Number(e.target.value) || 24)),
                      }))
                    }
                  />
                  <span className="text-xs text-[#8b949e]">horas sin respuesta</span>
                </div>
              </div>
              {approved.length === 0 && (
                <p className="text-xs text-amber-300">
                  Esta marca aún no tiene plantillas APROBADAS — créalas en Plantillas y espera
                  la aprobación de Meta para poder seleccionarlas.
                </p>
              )}
            </div>

            {/* Perfil del agente */}
            <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4 space-y-4">
              <p className="text-sm font-medium text-white">Perfil del agente IA de ESTA empresa</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">¿Cómo se comporta? (rol)</label>
                  <select
                    className={selectCls}
                    value={settings.agent_role ?? ""}
                    onChange={(e) => setSettings((s) => ({ ...s, agent_role: e.target.value || null }))}
                  >
                    {AGENT_ROLES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Tono de comunicación</label>
                  <select
                    className={selectCls}
                    value={settings.agent_tone ?? ""}
                    onChange={(e) => setSettings((s) => ({ ...s, agent_tone: e.target.value || null }))}
                  >
                    {AGENT_TONES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">¿Qué debe hacer? (objetivo)</label>
                <select
                  className={selectCls}
                  value={settings.agent_goal ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, agent_goal: e.target.value || null }))}
                >
                  {AGENT_GOALS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">
                  ¿Cuánto espera antes de responder? (intervalo)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={300}
                    className="w-24 rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-2 text-sm text-white"
                    value={settings.response_delay_seconds}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        response_delay_seconds: Math.max(0, Math.min(300, Number(e.target.value) || 0)),
                      }))
                    }
                  />
                  <span className="text-xs text-[#8b949e]">
                    segundos (0 = responde de inmediato · máx 300 = 5 min)
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="block text-xs text-[#8b949e]">
                  Instrucciones adicionales (opcional — detalles propios de esta empresa)
                </label>
                <button
                  type="button"
                  className="text-xs text-blue-400 hover:text-blue-300"
                  onClick={() => setSettings((s) => ({ ...s, agent_context: DEFAULT_CONTEXT }))}
                >
                  Usar plantilla sugerida
                </button>
              </div>
              <textarea
                rows={8}
                className="w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-2 text-sm text-white font-mono"
                placeholder="Ej: servicios que ofrecemos, precios desde, qué NO prometer, horarios de atención…"
                value={settings.agent_context ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, agent_context: e.target.value || null }))}
              />
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">
                  Enlace de agenda (Cal.com) — el agente lo comparte cuando el lead esté listo
                </label>
                <input
                  type="url"
                  className={selectCls}
                  placeholder="https://cal.smartgenapp.com/…"
                  value={settings.booking_url ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, booking_url: e.target.value || null }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#8b949e]">Máximo</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="w-20 rounded-md bg-[#0d1117] border border-[#2d333b] px-2 py-1 text-sm text-white"
                  value={settings.max_sends_per_hour}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      max_sends_per_hour: Math.max(1, Math.min(500, Number(e.target.value) || 20)),
                    }))
                  }
                />
                <span className="text-xs text-[#8b949e]">envíos automáticos por hora (seguridad)</span>
              </div>
            </div>

            {/* Catálogo / brochure */}
            <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4 space-y-3">
              <p className="text-sm font-medium text-white">Catálogo / brochure</p>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">¿Cuándo lo envía el agente?</label>
                <select
                  className={selectCls}
                  value={settings.brochure_mode}
                  onChange={(e) => setSettings((s) => ({ ...s, brochure_mode: e.target.value }))}
                >
                  <option value="off">No enviar catálogo</option>
                  <option value="after_greeting">Automáticamente tras el saludo</option>
                  <option value="on_request">Solo cuando el cliente lo pida</option>
                </select>
              </div>
              {settings.brochure_url ? (
                <div className="flex items-center justify-between rounded-md border border-[#2d333b] bg-[#0d1117] px-3 py-2">
                  <a
                    href={settings.brochure_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:underline truncate"
                  >
                    📄 {settings.brochure_filename || "catálogo"}
                  </a>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-300 shrink-0 ml-3"
                    onClick={handleRemoveBrochure}
                    disabled={uploadingBrochure}
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="block w-full text-xs text-[#8b949e] file:mr-3 file:rounded-md file:border-0 file:bg-[#21262d] file:px-3 file:py-1.5 file:text-white file:text-xs"
                    onChange={handleUploadBrochure}
                    disabled={uploadingBrochure}
                  />
                  <p className="mt-1 text-[11px] text-[#8b949e]">
                    {uploadingBrochure ? "Subiendo…" : "PDF, JPG o PNG · máximo 5 MB"}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar configuración"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
