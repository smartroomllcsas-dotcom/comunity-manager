"use client";
/**
 * Asistente de nueva difusión (por empresa): 1) Mensaje · 2) Audiencia · 3) Envío.
 * Todo lo que ofrece (canales, plantillas, etapas, etiquetas) es de la empresa activa.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { extractTemplateVariables, getTemplateBodyPreview, type InboxTemplate } from "@/components/inbox/TemplateBanner";
import { BrandPicker } from "@/components/broadcasts/BrandPicker";

type Channel = { id: string; type: string; name: string | null; status: string | null; whatsapp_phone_number: string | null };
type Template = { id: string; name: string; language: string; category: string; components: unknown; parameter_format: string | null };
type Preview = {
  counts: { total: number; included: number; excluded: number };
  reasons: Record<string, { count: number; label: string }>;
  sample: Array<{ id: string; name: string | null; phone: string; stage: string | null; source: string }>;
};

const SOURCES = [
  { id: "facebook_lead_form", label: "Formulario de Facebook" },
  { id: "otro", label: "Escribieron directo (WhatsApp / Instagram / Messenger)" },
];

const CONTACT_TOKENS = [
  { token: "{{contacto.nombre}}", label: "Nombre" },
  { token: "{{contacto.empresa}}", label: "Empresa" },
  { token: "{{contacto.ciudad}}", label: "Ciudad" },
];

const inputCls = "w-full rounded-md bg-[#0d1117] border border-[#2d333b] px-3 py-2 text-sm text-white";
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs ${on ? "border-blue-500/50 bg-blue-500/20 text-blue-200" : "border-[#2d333b] text-[#8b949e] hover:text-white"}`;

export function BroadcastWizard() {
  const router = useRouter();
  const { activeClientId, activeClient } = useActiveBrand();
  const [step, setStep] = useState(1);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Paso 1
  const [name, setName] = useState("");
  const [channelKind, setChannelKind] = useState<"whatsapp_cloud" | "waha">("whatsapp_cloud");
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [messageText, setMessageText] = useState("");

  // Paso 2
  const [selStages, setSelStages] = useState<string[]>([]);
  const [selTags, setSelTags] = useState<string[]>([]);
  const [selSources, setSelSources] = useState<string[]>([]);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [noReplyDays, setNoReplyDays] = useState("");
  const [excludeRepeat, setExcludeRepeat] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Paso 3
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [rate, setRate] = useState(20);
  const [saving, setSaving] = useState(false);

  const hasCloud = channels.some((c) => c.type !== "waha");
  const hasQr = channels.some((c) => c.type === "waha");
  const template = templates.find((t) => t.id === templateId) || null;
  const templateVars = useMemo(() => (template ? extractTemplateVariables(template as unknown as InboxTemplate) : []), [template]);
  const templateBody = template ? getTemplateBodyPreview(template as unknown as InboxTemplate) : "";

  useEffect(() => {
    if (!activeClientId) return;
    setStep(1);
    setTemplateId("");
    setPreview(null);
    setSelStages([]);
    setSelTags([]);
    (async () => {
      try {
        const res = await fetch(`/api/broadcasts/v2?clientId=${activeClientId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo cargar");
        setChannels(data.channels || []);
        setTemplates(data.templates || []);
        setStages(data.stages || []);
        setTags(data.tags || []);
        const cloud = (data.channels || []).some((c: Channel) => c.type !== "waha");
        setChannelKind(cloud ? "whatsapp_cloud" : "waha");
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
  }, [activeClientId]);

  // Variables por defecto: "nombre" → nombre del contacto
  useEffect(() => {
    if (!template) return;
    setVariables((prev) => {
      const next: Record<string, string> = {};
      for (const v of templateVars) next[v] = prev[v] ?? (/nombre|name|^1$/i.test(v) ? "{{contacto.nombre}}" : "");
      return next;
    });
  }, [template, templateVars]);

  const audience = useMemo(
    () => ({
      stages: selStages.length ? selStages : undefined,
      tags: selTags.length ? selTags : undefined,
      sources: selSources.length ? selSources : undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
      noReplyDays: noReplyDays ? Number(noReplyDays) : undefined,
      excludeTemplateRecipients: excludeRepeat,
    }),
    [selStages, selTags, selSources, createdFrom, createdTo, noReplyDays, excludeRepeat]
  );

  const runPreview = useCallback(async () => {
    if (!activeClientId) return;
    setPreviewing(true);
    try {
      const res = await fetch("/api/broadcasts/v2/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: activeClientId, channelKind, waTemplateId: templateId || undefined, audience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo calcular");
      setPreview(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }, [activeClientId, channelKind, templateId, audience]);

  useEffect(() => {
    if (step === 2) void runPreview();
  }, [step, runPreview]);

  function toggle(list: string[], v: string, set: (l: string[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  const step1Ok =
    name.trim().length >= 2 &&
    (channelKind === "waha" ? messageText.trim().length > 0 : Boolean(templateId) && templateVars.every((v) => (variables[v] || "").trim()));

  async function create() {
    if (!activeClientId) return;
    if (when === "later" && !scheduledAt) return toast.error("Elige fecha y hora");
    setSaving(true);
    try {
      const res = await fetch("/api/broadcasts/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: activeClientId,
          name: name.trim(),
          channelKind,
          waTemplateId: channelKind === "whatsapp_cloud" ? templateId : undefined,
          messageText: channelKind === "waha" ? messageText : undefined,
          variables,
          audience,
          scheduledAt: when === "later" ? new Date(scheduledAt).toISOString() : undefined,
          sendRatePerHour: rate,
          startNow: when === "now",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear");
      toast.success(
        data.included === 0
          ? "Nadie cumplía los filtros; no se envió nada"
          : data.status === "scheduled"
            ? `Difusión programada para ${data.included} personas`
            : `Difusión en marcha para ${data.included} personas`
      );
      router.push(`/broadcasts/${data.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!activeClientId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#8b949e]">Elige la empresa para la que será la difusión.</p>
        <BrandPicker />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2 text-xs">
        {["Mensaje", "Audiencia", "Envío"].map((label, i) => (
          <button
            key={label}
            onClick={() => (i + 1 < step || (i + 1 === 2 && step1Ok) || (i + 1 === 3 && step1Ok && preview)) && setStep(i + 1)}
            className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-blue-500/20 text-blue-200" : "text-[#8b949e]"}`}
          >
            {i + 1}. {label}
          </button>
        ))}
        <span className="ml-auto"><BrandPicker /></span>
      </div>

      {step === 1 && (
        <div className="rounded-xl border border-[#2d333b] bg-[#161b22] p-5 space-y-4">
          <div>
            <label className="block text-xs text-[#8b949e] mb-1">Nombre de la difusión (interno)</label>
            <input className={inputCls} placeholder="Ej: Promo septiembre mayoristas" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs text-[#8b949e] mb-1">Canal</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => hasCloud && setChannelKind("whatsapp_cloud")} disabled={!hasCloud} className={`${chip(channelKind === "whatsapp_cloud")} disabled:opacity-40`}>
                WhatsApp API oficial {hasCloud ? "" : "(no conectado)"}
              </button>
              <button type="button" onClick={() => hasQr && setChannelKind("waha")} disabled={!hasQr} className={`${chip(channelKind === "waha")} disabled:opacity-40`}>
                WhatsApp por QR {hasQr ? "" : "(no conectado)"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[#6e7681]">
              {channelKind === "whatsapp_cloud"
                ? "Usa una plantilla aprobada por Meta. Meta puede limitar mensajes de marketing a algunos números; esos se excluyen solos."
                : "Envía texto normal desde el celular conectado, en tandas pequeñas y con pausas. Úsalo con moderación: WhatsApp puede restringir el número si detecta envíos masivos."}
            </p>
          </div>

          {channelKind === "whatsapp_cloud" ? (
            <>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">Plantilla aprobada</label>
                <select className={inputCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} · {t.language} · {t.category === "UTILITY" ? "Utilidad" : "Marketing"}</option>
                  ))}
                </select>
                {templates.length === 0 && <p className="mt-1 text-[11px] text-amber-300">Esta empresa no tiene plantillas aprobadas. Créalas en Plantillas de WhatsApp.</p>}
              </div>
              {template && (
                <div className="rounded-md border border-[#2d333b] bg-[#0d1117] p-3">
                  <div className="text-[11px] text-[#8b949e] mb-1">Así se ve la plantilla</div>
                  <pre className="whitespace-pre-wrap text-sm text-white font-sans">{templateBody}</pre>
                </div>
              )}
              {templateVars.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-[#8b949e]">Variables: puedes escribir un texto fijo o usar un dato del contacto.</div>
                  {templateVars.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 font-mono text-xs text-[#8b949e]">{`{{${v}}}`}</span>
                      <input className={inputCls} value={variables[v] || ""} onChange={(e) => setVariables((p) => ({ ...p, [v]: e.target.value }))} placeholder="Texto fijo o {{contacto.nombre}}" />
                      <select className="rounded-md bg-[#0d1117] border border-[#2d333b] px-2 py-2 text-xs text-white" value="" onChange={(e) => e.target.value && setVariables((p) => ({ ...p, [v]: e.target.value }))}>
                        <option value="">Dato…</option>
                        {CONTACT_TOKENS.map((t) => <option key={t.token} value={t.token}>{t.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Mensaje</label>
              <textarea rows={6} className={inputCls} value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder={"Hola {{contacto.nombre}} 💕 …"} />
              <div className="mt-1 flex flex-wrap gap-1">
                {CONTACT_TOKENS.map((t) => (
                  <button key={t.token} type="button" className={chip(false)} onClick={() => setMessageText((m) => `${m}${m.endsWith(" ") || !m ? "" : " "}${t.token}`)}>+ {t.label}</button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button disabled={!step1Ok} onClick={() => setStep(2)} className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Siguiente: audiencia</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-xl border border-[#2d333b] bg-[#161b22] p-5 space-y-4">
          <p className="text-xs text-[#8b949e]">Sin filtros se toma toda la empresa. Siempre se excluyen: sin número, «no contactar» / Perdido, sin WhatsApp y limitados por Meta.</p>

          <div>
            <div className="text-xs text-[#8b949e] mb-1">Etapa</div>
            <div className="flex flex-wrap gap-1.5">
              {["sin_etapa", ...stages].map((s) => (
                <button key={s} type="button" className={chip(selStages.includes(s))} onClick={() => toggle(selStages, s, setSelStages)}>{s === "sin_etapa" ? "Sin etapa" : s}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#8b949e] mb-1">Origen</div>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((s) => (
                <button key={s.id} type="button" className={chip(selSources.includes(s.id))} onClick={() => toggle(selSources, s.id, setSelSources)}>{s.label}</button>
              ))}
            </div>
          </div>
          {tags.length > 0 && (
            <div>
              <div className="text-xs text-[#8b949e] mb-1">Etiquetas</div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button key={t} type="button" className={chip(selTags.includes(t))} onClick={() => toggle(selTags, t, setSelTags)}>{t}</button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Llegaron desde</label>
              <input type="date" className={inputCls} value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Hasta</label>
              <input type="date" className={inputCls} value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">Sin escribir hace al menos (días)</label>
              <input type="number" min={1} className={inputCls} value={noReplyDays} onChange={(e) => setNoReplyDays(e.target.value)} placeholder="Ej: 7" />
            </div>
          </div>
          {channelKind === "whatsapp_cloud" && (
            <label className="flex items-center gap-2 text-xs text-[#8b949e]">
              <input type="checkbox" checked={excludeRepeat} onChange={(e) => setExcludeRepeat(e.target.checked)} />
              No enviar a quien ya recibió esta plantilla en los últimos 30 días
            </label>
          )}

          <div className="rounded-md border border-[#2d333b] bg-[#0d1117] p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white">
                {previewing ? "Calculando…" : preview ? <>Recibirán el mensaje <strong className="text-green-300">{preview.counts.included}</strong> personas</> : "—"}
              </div>
              <button type="button" onClick={() => void runPreview()} className="text-xs text-blue-300 hover:underline">Recalcular</button>
            </div>
            {preview && preview.counts.excluded > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-[#8b949e]">
                {Object.values(preview.reasons).map((r) => (
                  <li key={r.label}>· {r.count} excluidos: {r.label}</li>
                ))}
              </ul>
            )}
            {preview && preview.sample.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {preview.sample.map((c) => (
                  <span key={c.id} className="rounded border border-[#2d333b] px-2 py-0.5 text-[11px] text-[#8b949e]">{c.name || c.phone}{c.stage ? ` · ${c.stage}` : ""}</span>
                ))}
                {preview.counts.included > preview.sample.length && <span className="text-[11px] text-[#6e7681]">y {preview.counts.included - preview.sample.length} más</span>}
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="rounded-md border border-[#2d333b] px-4 py-2 text-sm text-white">Atrás</button>
            <button disabled={!preview || preview.counts.included === 0} onClick={() => setStep(3)} className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Siguiente: envío</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-xl border border-[#2d333b] bg-[#161b22] p-5 space-y-4">
          <div>
            <div className="text-xs text-[#8b949e] mb-1">¿Cuándo?</div>
            <div className="flex gap-2">
              <button type="button" className={chip(when === "now")} onClick={() => setWhen("now")}>Ahora</button>
              <button type="button" className={chip(when === "later")} onClick={() => setWhen("later")}>Programar</button>
            </div>
            {when === "later" && (
              <input type="datetime-local" className={`${inputCls} mt-2`} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            )}
          </div>
          <div>
            <label className="block text-xs text-[#8b949e] mb-1">Ritmo de envío (mensajes por hora)</label>
            <input type="number" min={1} max={500} className={inputCls} value={rate} onChange={(e) => setRate(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
            <p className="mt-1 text-[11px] text-[#6e7681]">
              {preview ? `Con ${rate} por hora, ${preview.counts.included} personas tardan aprox. ${Math.max(1, Math.ceil(preview.counts.included / rate))} h.` : ""}
              {channelKind === "waha" ? " Por QR se recomienda máximo 30 por hora." : ""}
            </p>
          </div>

          <div className="rounded-md border border-[#2d333b] bg-[#0d1117] p-3 text-sm text-white space-y-1">
            <div><span className="text-[#8b949e]">Empresa:</span> {activeClient?.name}</div>
            <div><span className="text-[#8b949e]">Canal:</span> {channelKind === "waha" ? "WhatsApp por QR" : "WhatsApp API"}</div>
            <div><span className="text-[#8b949e]">Mensaje:</span> {channelKind === "waha" ? messageText.slice(0, 80) : template?.name}</div>
            <div><span className="text-[#8b949e]">Personas:</span> {preview?.counts.included ?? 0}</div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="rounded-md border border-[#2d333b] px-4 py-2 text-sm text-white">Atrás</button>
            <button disabled={saving} onClick={() => void create()} className="rounded-md bg-green-600 hover:bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Creando…" : when === "now" ? "Enviar ahora" : "Programar difusión"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
