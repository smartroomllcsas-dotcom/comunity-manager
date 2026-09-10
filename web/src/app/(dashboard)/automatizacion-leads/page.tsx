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

interface PendingLead {
  id: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  reason: string | null;
  campaign: string | null;
  company: string | null;
}

/** Motivo técnico de no envío → texto para el usuario. */
function reasonLabel(reason: string): string {
  // Meta aceptó el envío pero no pudo entregarlo (número sin WhatsApp, etc.).
  if (reason.startsWith("fallido (")) return `WhatsApp no lo entregó: ${reason.slice(9, -1)}`;
  if (reason.startsWith("no_enviado (")) reason = reason.slice(12, -1);
  const map: Record<string, string> = {
    disabled: "abordaje automático apagado",
    no_template_configured: "sin plantilla de primer contacto",
    template_not_found: "plantilla no encontrada",
    rate_limited: "límite por hora alcanzado",
    invalid_phone: "teléfono inválido",
    sin_telefono: "sin teléfono",
  };
  if (map[reason]) return map[reason];
  if (reason.startsWith("template_")) return `plantilla ${reason.slice(9)}`;
  return reason;
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
  /** Instrucciones extra del agente por canal (misma empresa, distinto trato). */
  channel_instructions: { whatsapp?: string | null; instagram?: string | null; messenger?: string | null };
  /** Recordatorio de reunión (Cal.com) por WhatsApp, N minutos antes. */
  booking_reminder: { enabled: boolean; template_id: string | null; minutes_before: number };
  /** Respuestas exactas por canal: patrón → texto tal cual (sin IA). */
  fixed_replies: { whatsapp?: FixedReply[]; instagram?: FixedReply[]; messenger?: FixedReply[] };
  /** Seguimiento automático por pasos (varios intentos y cierre). */
  followup: {
    enabled: boolean;
    steps: Array<{ after_hours: number; template_id: string | null; text: string }>;
    finish_mark_lost: boolean;
    finish_after_hours: number;
    notify_advisors: boolean;
  };
}

type FixedReply = { match: string; reply: string; unless?: string; once?: boolean };
type ChannelKey = "whatsapp" | "instagram" | "messenger";

const CHANNEL_INSTRUCTION_FIELDS: Array<{
  key: "whatsapp" | "instagram" | "messenger";
  label: string;
  placeholder: string;
}> = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    placeholder:
      "Ej: en WhatsApp responde corto y directo, ofrece agendar llamada, comparte precios desde…",
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder:
      "Ej: en Instagram el público es más joven: tono cercano, emojis, invita a ver el catálogo y a pedir por DM…",
  },
  {
    key: "messenger",
    label: "Messenger (Facebook)",
    placeholder: "Ej: en Messenger suelen llegar de anuncios: pregunta primero qué anuncio vio…",
  },
];

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
  channel_instructions: {},
  booking_reminder: { enabled: false, template_id: null, minutes_before: 60 },
  fixed_replies: {},
  followup: {
    enabled: true,
    steps: [
      { after_hours: 24, template_id: null, text: "" },
      { after_hours: 72, template_id: null, text: "" },
      { after_hours: 168, template_id: null, text: "" },
    ],
    finish_mark_lost: true,
    finish_after_hours: 48,
    notify_advisors: true,
  },
};

export default function LeadAutomationPage() {
  const { clients, activeClientId, setActiveClientId } = useActiveBrand();
  const clientId = activeClientId;
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingBrochure, setUploadingBrochure] = useState(false);
  const [pendingLeads, setPendingLeads] = useState<PendingLead[]>([]);
  const [unreachableLeads, setUnreachableLeads] = useState<PendingLead[]>([]);
  const [showUnreachable, setShowUnreachable] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [sendingLeads, setSendingLeads] = useState<string | "all" | null>(null);

  // Leads de formulario que llegaron antes de configurar la automatización y
  // nunca recibieron la plantilla. Se listan aparte para poder "sincronizarlos"
  // a mano; los nuevos la reciben solos al entrar.
  const loadPendingLeads = useCallback(async () => {
    if (!clientId) return;
    setLoadingLeads(true);
    try {
      const res = await fetch(`/api/whatsapp/cloud/lead-backfill?clientId=${clientId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los leads pendientes");
      setPendingLeads(Array.isArray(data.leads) ? data.leads : []);
      setUnreachableLeads(Array.isArray(data.unreachable) ? data.unreachable : []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingLeads(false);
    }
  }, [clientId]);

  async function handleSendPending(contactIds?: string[]) {
    if (!clientId) return;
    setSendingLeads(contactIds?.length === 1 ? contactIds[0] : "all");
    try {
      const res = await fetch("/api/whatsapp/cloud/lead-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, contactIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar");
      const failed = (data.results as Array<{ sent: boolean; reason?: string }>).filter((r) => !r.sent);
      if (data.sent > 0) toast.success(`Plantilla enviada a ${data.sent} lead${data.sent === 1 ? "" : "s"}`);
      if (failed.length > 0) {
        const reasons = Array.from(new Set(failed.map((r) => r.reason || "error")));
        toast.error(`${failed.length} sin enviar: ${reasons.map(reasonLabel).join(", ")}`);
      }
      await loadPendingLeads();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSendingLeads(null);
    }
  }

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
    void loadPendingLeads();
  }, [load, loadPendingLeads]);

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
        body: JSON.stringify({
          clientId,
          ...settings,
          fixed_replies: Object.fromEntries(
            (["whatsapp", "instagram", "messenger"] as ChannelKey[]).map((k) => [
              k,
              (settings.fixed_replies?.[k] ?? []).filter((r) => r.match.trim() && r.reply.trim()),
            ])
          ),
        }),
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

  const [creatingReminder, setCreatingReminder] = useState(false);
  async function handleCreateReminderTemplate() {
    if (!clientId) return;
    setCreatingReminder(true);
    try {
      const res = await fetch("/api/whatsapp/cloud/lead-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, create_reminder_template: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear la plantilla");
      setSettings({ ...emptySettings, ...(data.settings ?? {}) });
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      toast.success(data.notice || "Plantilla creada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingReminder(false);
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
                <p className="mt-1 text-[11px] text-[#8b949e]">
                  Es la plantilla que usa el seguimiento automático de abajo cuando un paso no tiene plantilla propia.
                </p>
              </div>

              {/* Seguimiento automático por pasos */}
              <div className="rounded-md border border-[#2d333b] bg-[#0d1117]/60 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Seguimiento automático cuando el lead deja de responder</p>
                    <p className="text-xs text-[#8b949e]">
                      Cada intento sale cuando el cliente lleva esas horas sin escribir y el último mensaje fue nuestro. WhatsApp API usa la
                      plantilla del paso (o la de retoma); WhatsApp por QR usa el texto. No aplica a Perdido, Cliente, «no contactar» ni a
                      quien ya agendó. Corre cada hora.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#8b949e]">
                    <input
                      type="checkbox"
                      checked={settings.followup.enabled}
                      onChange={(e) => setSettings((s) => ({ ...s, followup: { ...s.followup, enabled: e.target.checked } }))}
                    />
                    Activo
                  </label>
                </div>
                {settings.followup.steps.map((step, idx) => (
                  <div key={idx} className="rounded-md border border-[#2d333b] p-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-white">Intento {idx + 1}</span>
                      <span className="text-xs text-[#8b949e]">a las</span>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        className="w-20 rounded-md bg-[#0d1117] border border-[#2d333b] px-2 py-1 text-sm text-white"
                        value={step.after_hours}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            followup: {
                              ...s.followup,
                              steps: s.followup.steps.map((st, i) => (i === idx ? { ...st, after_hours: Math.max(1, Number(e.target.value) || 1) } : st)),
                            },
                          }))
                        }
                      />
                      <span className="text-xs text-[#8b949e]">horas sin respuesta ({Math.round((step.after_hours / 24) * 10) / 10} días)</span>
                      <select
                        className="ml-auto rounded-md bg-[#0d1117] border border-[#2d333b] px-2 py-1 text-xs text-white"
                        value={step.template_id ?? ""}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            followup: { ...s.followup, steps: s.followup.steps.map((st, i) => (i === idx ? { ...st, template_id: e.target.value || null } : st)) },
                          }))
                        }
                      >
                        <option value="">Plantilla: la de retoma</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id} disabled={t.status !== "APPROVED"}>{templateLabel(t)}</option>
                        ))}
                      </select>
                      {settings.followup.steps.length > 1 && (
                        <button
                          type="button"
                          className="text-xs text-[#f85149] hover:underline"
                          onClick={() => setSettings((s) => ({ ...s, followup: { ...s.followup, steps: s.followup.steps.filter((_, i) => i !== idx) } }))}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      className="w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-1.5 text-sm text-white"
                      placeholder="Texto para WhatsApp por QR (usa {{contacto.nombre}}). Vacío = texto por defecto."
                      value={step.text}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          followup: { ...s.followup, steps: s.followup.steps.map((st, i) => (i === idx ? { ...st, text: e.target.value } : st)) },
                        }))
                      }
                    />
                  </div>
                ))}
                {settings.followup.steps.length < 5 && (
                  <button
                    type="button"
                    className="text-xs text-[#58a6ff] hover:underline"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        followup: {
                          ...s.followup,
                          steps: [...s.followup.steps, { after_hours: (s.followup.steps[s.followup.steps.length - 1]?.after_hours || 24) * 2, template_id: null, text: "" }],
                        },
                      }))
                    }
                  >
                    + Agregar intento
                  </button>
                )}
                <div className="flex flex-wrap items-center gap-3 border-t border-[#2d333b] pt-2">
                  <label className="flex items-center gap-2 text-xs text-[#8b949e]">
                    <input
                      type="checkbox"
                      checked={settings.followup.finish_mark_lost}
                      onChange={(e) => setSettings((s) => ({ ...s, followup: { ...s.followup, finish_mark_lost: e.target.checked } }))}
                    />
                    Si no responde a ninguno, marcar como Perdido
                  </label>
                  <span className="text-xs text-[#8b949e]">tras</span>
                  <input
                    type="number"
                    min={0}
                    max={720}
                    className="w-20 rounded-md bg-[#0d1117] border border-[#2d333b] px-2 py-1 text-sm text-white"
                    value={settings.followup.finish_after_hours}
                    onChange={(e) => setSettings((s) => ({ ...s, followup: { ...s.followup, finish_after_hours: Math.max(0, Number(e.target.value) || 0) } }))}
                  />
                  <span className="text-xs text-[#8b949e]">horas más del último intento</span>
                  <label className="flex items-center gap-2 text-xs text-[#8b949e]">
                    <input
                      type="checkbox"
                      checked={settings.followup.notify_advisors}
                      onChange={(e) => setSettings((s) => ({ ...s, followup: { ...s.followup, notify_advisors: e.target.checked } }))}
                    />
                    Avisar a los asesores por correo
                  </label>
                </div>
              </div>

              {/* Recordatorio de reunión */}
              <div className="rounded-md border border-[#2d333b] bg-[#0d1117]/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Recordatorio de reunión</p>
                    <p className="text-xs text-[#8b949e]">
                      Cuando el cliente agenda en Cal.com, se le envía esta plantilla antes de la cita.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-blue-500"
                    checked={settings.booking_reminder?.enabled ?? false}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        booking_reminder: { ...(s.booking_reminder || emptySettings.booking_reminder), enabled: e.target.checked },
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    className={selectCls}
                    value={settings.booking_reminder?.template_id ?? ""}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        booking_reminder: {
                          ...(s.booking_reminder || emptySettings.booking_reminder),
                          template_id: e.target.value || null,
                        },
                      }))
                    }
                  >
                    <option value="">— plantilla de recordatorio —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id} disabled={t.status !== "APPROVED"}>
                        {templateLabel(t)}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      className="w-20 rounded-md bg-[#0d1117] border border-[#2d333b] px-2 py-1 text-sm text-white"
                      value={settings.booking_reminder?.minutes_before ?? 60}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          booking_reminder: {
                            ...(s.booking_reminder || emptySettings.booking_reminder),
                            minutes_before: Math.max(5, Math.min(1440, Number(e.target.value) || 60)),
                          },
                        }))
                      }
                    />
                    <span className="text-xs text-[#8b949e]">min antes</span>
                  </div>
                </div>
                {!templates.some((t) => t.name === "recordatorio_reunion") && (
                  <button
                    type="button"
                    onClick={handleCreateReminderTemplate}
                    disabled={creatingReminder}
                    className="rounded-md border border-[#2d333b] px-3 py-1.5 text-xs text-white hover:bg-[#21262d] disabled:opacity-50"
                  >
                    {creatingReminder ? "Creando…" : "Crear plantilla \"recordatorio_reunion\" en Meta"}
                  </button>
                )}
                <p className="text-[11px] text-[#8b949e]">
                  La plantilla es de categoría Utility (Meta la entrega en todos los países). Queda en
                  revisión hasta que Meta la apruebe; el envío se activa solo cuando esté aprobada.
                </p>
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

              {/* Instrucciones por canal */}
              <div className="rounded-md border border-[#2d333b] bg-[#0d1117]/60 p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium text-white">Instrucciones por canal (opcional)</p>
                  <p className="text-xs text-[#8b949e]">
                    Las instrucciones de arriba aplican a todos los canales. Aquí agregas lo que cambia según por
                    dónde escribe el cliente. Si se contradicen, manda la del canal.
                  </p>
                </div>
                {CHANNEL_INSTRUCTION_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs text-[#8b949e] mb-1">{field.label}</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-2 text-sm text-white"
                      placeholder={field.placeholder}
                      value={settings.channel_instructions?.[field.key] ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          channel_instructions: {
                            ...(s.channel_instructions || {}),
                            [field.key]: e.target.value || null,
                          },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>

              {/* Respuestas exactas por canal */}
              <div className="rounded-md border border-[#2d333b] bg-[#0d1117]/60 p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium text-white">Respuestas automáticas exactas (opcional)</p>
                  <p className="text-xs text-[#8b949e]">
                    Cuando el mensaje del cliente contenga alguna de las palabras clave, la plataforma envía el
                    texto tal cual, sin pasar por la IA. Útil para mensajes que la empresa exige palabra por
                    palabra (condiciones, bienvenida, pasos).
                  </p>
                </div>
                {CHANNEL_INSTRUCTION_FIELDS.map((field) => {
                  const rules = settings.fixed_replies?.[field.key] ?? [];
                  const update = (next: FixedReply[]) =>
                    setSettings((s) => ({
                      ...s,
                      fixed_replies: { ...(s.fixed_replies || {}), [field.key]: next },
                    }));
                  return (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-[#8b949e]">{field.label}</label>
                        <button
                          type="button"
                          className="text-xs text-[#58a6ff] hover:underline"
                          onClick={() => update([...rules, { match: "", reply: "", once: true }])}
                        >
                          + Agregar respuesta
                        </button>
                      </div>
                      {rules.length === 0 && (
                        <p className="text-xs text-[#6e7681]">Sin respuestas exactas para {field.label}.</p>
                      )}
                      {rules.map((rule, idx) => (
                        <div key={idx} className="rounded-md border border-[#2d333b] p-2 space-y-2">
                          <input
                            className="w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-1.5 text-sm text-white"
                            placeholder="Palabras clave separadas por | (ej: catálogo|precios|información)"
                            value={rule.match}
                            onChange={(e) => update(rules.map((r, i) => (i === idx ? { ...r, match: e.target.value } : r)))}
                          />
                          <textarea
                            rows={4}
                            className="w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-2 text-sm text-white"
                            placeholder="Texto exacto que se enviará"
                            value={rule.reply}
                            onChange={(e) => update(rules.map((r, i) => (i === idx ? { ...r, reply: e.target.value } : r)))}
                          />
                          <input
                            className="w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-1.5 text-sm text-white"
                            placeholder="No enviar si el cliente ya escribió… (opcional, ej: quiero ser mayorista)"
                            value={rule.unless ?? ""}
                            onChange={(e) =>
                              update(rules.map((r, i) => (i === idx ? { ...r, unless: e.target.value || undefined } : r)))
                            }
                          />
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs text-[#8b949e]">
                              <input
                                type="checkbox"
                                checked={rule.once !== false}
                                onChange={(e) => update(rules.map((r, i) => (i === idx ? { ...r, once: e.target.checked } : r)))}
                              />
                              Enviar solo una vez por conversación
                            </label>
                            <button
                              type="button"
                              className="text-xs text-[#f85149] hover:underline"
                              onClick={() => update(rules.filter((_, i) => i !== idx))}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

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

            {/* Leads anteriores sin abordar */}
            <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">
                    Leads de formulario sin abordar
                    {pendingLeads.length > 0 && (
                      <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                        {pendingLeads.length}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#8b949e]">
                    Llegaron antes de activar la automatización (o el envío quedó pendiente) y aún no
                    reciben la plantilla de primer contacto. Sincronízalos para que el agente inicie la
                    conversación: primero los que nunca se intentaron, del más antiguo al más nuevo, hasta
                    el límite por hora ({settings.max_sends_per_hour}/h, configurable arriba). Usa la
                    configuración <strong>guardada</strong>.
                  </p>
                </div>
                <button
                  onClick={() => handleSendPending()}
                  disabled={
                    sendingLeads !== null || loadingLeads || pendingLeads.length === 0
                  }
                  className="shrink-0 rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {sendingLeads === "all"
                    ? "Enviando…"
                    : `Sincronizar todos (${pendingLeads.length})`}
                </button>
              </div>

              {loadingLeads ? (
                <p className="text-xs text-[#8b949e]">Cargando…</p>
              ) : pendingLeads.length === 0 ? (
                <p className="text-xs text-[#8b949e]">No hay leads pendientes. ✔</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[#8b949e]">
                      <tr className="text-left">
                        <th className="py-1 pr-3 font-normal">Lead</th>
                        <th className="py-1 pr-3 font-normal">Teléfono</th>
                        <th className="py-1 pr-3 font-normal">Llegó</th>
                        <th className="py-1 pr-3 font-normal">Motivo</th>
                        <th className="py-1 font-normal"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingLeads.map((lead) => (
                        <tr key={lead.id} className="border-t border-[#2d333b]">
                          <td className="py-1.5 pr-3 text-white">
                            {lead.name || "—"}
                            {lead.company && (
                              <span className="block text-[11px] text-[#8b949e]">{lead.company}</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 font-mono">{lead.phone || "—"}</td>
                          <td className="py-1.5 pr-3 text-[#8b949e]">
                            {new Date(lead.created_at).toLocaleDateString("es-CO", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </td>
                          <td className="py-1.5 pr-3 text-[#8b949e]">
                            {lead.reason ? reasonLabel(lead.reason) : "sin intento"}
                          </td>
                          <td className="py-1.5 text-right">
                            <button
                              onClick={() => handleSendPending([lead.id])}
                              disabled={sendingLeads !== null || !lead.phone}
                              className="rounded-md border border-[#2d333b] px-2 py-1 text-[11px] text-white hover:bg-[#21262d] disabled:opacity-50"
                            >
                              {sendingLeads === lead.id ? "Enviando…" : "Enviar"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {unreachableLeads.length > 0 && (
                <div className="border-t border-[#2d333b] pt-3">
                  <button
                    type="button"
                    onClick={() => setShowUnreachable((v) => !v)}
                    className="text-xs text-[#8b949e] hover:text-white"
                  >
                    {showUnreachable ? "▾" : "▸"} No se pueden contactar por WhatsApp ({unreachableLeads.length})
                  </button>
                  <p className="text-[11px] text-[#6e7681] mt-1">
                    WhatsApp ya rechazó estos números (sin WhatsApp, Meta limitó los mensajes de marketing,
                    inactivo 24 h o teléfono inválido). No entran en «Sincronizar todos» porque volverían a
                    fallar y gastan el cupo por hora; los asesores ya recibieron el correo para contactarlos
                    por otro medio. Los limitados por Meta se reintentan solos cuando Meta apruebe la
                    plantilla Utility.
                  </p>
                  {showUnreachable && (
                    <div className="overflow-x-auto mt-2">
                      <table className="w-full text-xs">
                        <tbody>
                          {unreachableLeads.map((lead) => (
                            <tr key={lead.id} className="border-t border-[#2d333b]">
                              <td className="py-1.5 pr-3 text-white">
                                {lead.name || "—"}
                                {lead.company && (
                                  <span className="block text-[11px] text-[#8b949e]">{lead.company}</span>
                                )}
                              </td>
                              <td className="py-1.5 pr-3 font-mono">{lead.phone || "—"}</td>
                              <td className="py-1.5 pr-3 text-[#8b949e]">
                                {new Date(lead.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                              </td>
                              <td className="py-1.5 pr-3 text-[#8b949e]">
                                {lead.reason ? reasonLabel(lead.reason) : "sin teléfono"}
                              </td>
                              <td className="py-1.5 text-right">
                                <button
                                  onClick={() => handleSendPending([lead.id])}
                                  disabled={sendingLeads !== null || !lead.phone}
                                  className="rounded-md border border-[#2d333b] px-2 py-1 text-[11px] text-[#8b949e] hover:bg-[#21262d] disabled:opacity-50"
                                >
                                  {sendingLeads === lead.id ? "Enviando…" : "Reintentar"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
