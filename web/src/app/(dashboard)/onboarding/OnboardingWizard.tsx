"use client";

// Sprint 26 · Agente S · Onboarding wizard client component (agencia-side).
//
// 6 steps: welcome → brand → platforms → content_pillars → preferences → review
// Al terminar step 'review' pasa a 'done' y muestra pantalla de exito.

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

type Step =
  | "welcome"
  | "brand"
  | "platforms"
  | "content_pillars"
  | "preferences"
  | "review"
  | "done";

const STEP_ORDER: Step[] = [
  "welcome",
  "brand",
  "platforms",
  "content_pillars",
  "preferences",
  "review",
  "done",
];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Bienvenida",
  brand: "Marca",
  platforms: "Canales",
  content_pillars: "Pilares",
  preferences: "Preferencias",
  review: "Revisión",
  done: "Listo",
};

const PLATFORMS = [
  { id: "facebook", name: "Facebook" },
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "threads", name: "Threads" },
  { id: "youtube", name: "YouTube" },
  { id: "pinterest", name: "Pinterest" },
  { id: "gbp", name: "Google Business" },
  { id: "whatsapp", name: "WhatsApp" },
  { id: "x", name: "X (Twitter)" },
];

const APPROVAL_MODES = [
  { id: "autonomous", label: "Autónomo", desc: "La IA publica sin aprobación" },
  { id: "approval", label: "Con aprobación", desc: "Cliente aprueba cada post" },
  { id: "conversational", label: "Conversacional", desc: "Discusión antes de aprobar" },
];

interface OnboardingData {
  client_id?: string;
  client_name?: string;
  brand?: string;
  language?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  brand_voice?: string;
  connected_platforms?: string[];
  content_pillars?: Array<{ name: string; description: string }>;
  timezone?: string;
  frequency?: string;
  approval_mode?: string;
}

interface Props {
  initialState: {
    step: Step;
    data: OnboardingData;
    completed_steps: string[];
    completed_at: string | null;
  } | null;
  clientId: string;
  clientName: string;
}

export function OnboardingWizard({ initialState, clientId, clientName }: Props) {
  const [step, setStep] = React.useState<Step>(initialState?.step ?? "welcome");
  const [data, setData] = React.useState<OnboardingData>(
    initialState?.data ?? { client_id: clientId, client_name: clientName },
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);

  const currentIdx = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length - 1; // exclude 'done'
  const progress = Math.round((currentIdx / (totalSteps - 1)) * 100);

  async function saveAndAdvance(nextStep: Step) {
    setSaving(true);
    setError(null);
    try {
      // Si es la primera vez creamos el state, luego actualizamos.
      const endpoint = initialState
        ? `/api/onboarding/${clientId}/step`
        : `/api/onboarding`;
      const method = initialState ? "PATCH" : "POST";
      const body = initialState
        ? { step: nextStep, data }
        : { client_id: clientId, step: nextStep, data };
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Error al guardar");
      }
      setStep(nextStep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function generateInvite() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          step,
          data,
          with_invite: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      if (json.invite?.url) setInviteUrl(json.invite.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Progress bar */}
      {step !== "done" && (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#7d8590]">
            <span>
              Paso {currentIdx + 1} de {totalSteps}: {STEP_LABELS[step]}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#1a1f2e]">
            <div
              className="h-full bg-[#3b82f6] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex gap-1.5 text-[10px]">
            {STEP_ORDER.slice(0, -1).map((s, i) => (
              <div
                key={s}
                className={`flex-1 rounded-full py-1 text-center font-semibold ${
                  i <= currentIdx
                    ? "bg-[#3b82f6]/20 text-[#3b82f6]"
                    : "bg-[#1a1f2e] text-[#7d8590]"
                }`}
              >
                {STEP_LABELS[s]}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-[#f85149]/40 bg-[#f85149]/10 p-3 text-sm text-[#f85149]">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-[#2d333b] bg-[#0d1117] p-8">
        {step === "welcome" && (
          <StepWelcome data={data} update={update} />
        )}
        {step === "brand" && <StepBrand data={data} update={update} />}
        {step === "platforms" && (
          <StepPlatforms data={data} update={update} clientId={clientId} />
        )}
        {step === "content_pillars" && (
          <StepPillars data={data} update={update} />
        )}
        {step === "preferences" && (
          <StepPreferences data={data} update={update} />
        )}
        {step === "review" && (
          <StepReview
            data={data}
            inviteUrl={inviteUrl}
            onGenerateInvite={generateInvite}
            saving={saving}
          />
        )}
        {step === "done" && <StepDone clientName={clientName} />}
      </div>

      {step !== "done" && (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const prev = STEP_ORDER[currentIdx - 1];
              if (prev) setStep(prev);
            }}
            disabled={currentIdx === 0 || saving}
            className="inline-flex items-center gap-2 rounded-full border border-[#2d333b] px-4 py-2 text-sm font-semibold text-[#e6edf3] disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Atrás
          </button>
          <button
            type="button"
            onClick={() => {
              const next = STEP_ORDER[currentIdx + 1];
              if (next) saveAndAdvance(next);
            }}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-[#3b82f6] px-5 py-2 text-sm font-bold text-white hover:bg-[#2563eb] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {step === "review" ? "Completar setup" : "Guardar y continuar"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Individual steps ──────────────────────────────────────────────────────

function StepWelcome({
  data,
  update,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-black text-[#e6edf3]">Bienvenida</h2>
      <p className="text-sm text-[#7d8590]">
        Empecemos con la información básica del cliente.
      </p>
      <Field label="Nombre del cliente">
        <input
          value={data.client_name ?? ""}
          onChange={(e) => update("client_name", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
          placeholder="Ej: Café Verde"
        />
      </Field>
      <Field label="Marca / Brand">
        <input
          value={data.brand ?? ""}
          onChange={(e) => update("brand", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
          placeholder="Ej: Café Verde Colombia"
        />
      </Field>
      <Field label="Idioma principal">
        <select
          value={data.language ?? "es"}
          onChange={(e) => update("language", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
        >
          <option value="es">Español</option>
          <option value="en">Inglés</option>
          <option value="pt">Portugués</option>
        </select>
      </Field>
    </div>
  );
}

function StepBrand({
  data,
  update,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-black text-[#e6edf3]">Identidad de marca</h2>
      <p className="text-sm text-[#7d8590]">
        Todo esto se usa para generar contenido consistente con la voz de la marca.
      </p>
      <Field label="URL del logo">
        <input
          type="url"
          value={data.logo_url ?? ""}
          onChange={(e) => update("logo_url", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
          placeholder="https://..."
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Color primario">
          <input
            type="color"
            value={data.primary_color ?? "#0f766e"}
            onChange={(e) => update("primary_color", e.target.value)}
            className="h-10 w-full rounded-lg border border-[#2d333b] bg-[#0d1117]"
          />
        </Field>
        <Field label="Color secundario">
          <input
            type="color"
            value={data.secondary_color ?? "#f7c65f"}
            onChange={(e) => update("secondary_color", e.target.value)}
            className="h-10 w-full rounded-lg border border-[#2d333b] bg-[#0d1117]"
          />
        </Field>
      </div>
      <Field label="Brand voice (cómo habla la marca)">
        <textarea
          value={data.brand_voice ?? ""}
          onChange={(e) => update("brand_voice", e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
          placeholder="Ej: Cercana, jovial, usa jerga colombiana, evita anglicismos, siempre en 2da persona..."
        />
      </Field>
    </div>
  );
}

function StepPlatforms({
  data,
  update,
  clientId,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
  clientId: string;
}) {
  const connected = data.connected_platforms ?? [];

  function toggle(id: string) {
    const next = connected.includes(id)
      ? connected.filter((p) => p !== id)
      : [...connected, id];
    update("connected_platforms", next);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-black text-[#e6edf3]">Conecta canales</h2>
      <p className="text-sm text-[#7d8590]">
        Selecciona los canales que gestionarás para este cliente. Al hacer click
        en Conectar se abrirá el flujo OAuth correspondiente.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map((p) => {
          const isConnected = connected.includes(p.id);
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl border p-4 ${
                isConnected
                  ? "border-[#0f766e]/50 bg-[#0f766e]/10"
                  : "border-[#2d333b] bg-[#0d1117]"
              }`}
            >
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <Check className="h-4 w-4 text-[#0f766e]" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-[#2d333b]" />
                )}
                <span className="text-sm font-semibold text-[#e6edf3]">
                  {p.name}
                </span>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/social/oauth/${p.id}/init?client_id=${encodeURIComponent(
                    clientId,
                  )}`}
                  className="rounded-md bg-[#3b82f6] px-3 py-1 text-xs font-bold text-white hover:bg-[#2563eb]"
                >
                  Conectar
                </a>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="rounded-md border border-[#2d333b] px-3 py-1 text-xs font-semibold text-[#7d8590]"
                >
                  {isConnected ? "Quitar" : "Marcar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[#7d8590]">
        Tip: puedes marcar canales aunque no los conectes ahora. El cliente puede
        completar el OAuth después via magic-link.
      </p>
    </div>
  );
}

function StepPillars({
  data,
  update,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
}) {
  const pillars = data.content_pillars ?? [
    { name: "", description: "" },
    { name: "", description: "" },
    { name: "", description: "" },
  ];

  function updatePillar(i: number, field: "name" | "description", value: string) {
    const next = pillars.map((p, idx) =>
      idx === i ? { ...p, [field]: value } : p,
    );
    update("content_pillars", next);
  }

  function addPillar() {
    if (pillars.length >= 5) return;
    update("content_pillars", [...pillars, { name: "", description: "" }]);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-black text-[#e6edf3]">
        Pilares de contenido
      </h2>
      <p className="text-sm text-[#7d8590]">
        Define 3 a 5 pilares que guiarán qué se publica. Ejemplo: Educación,
        Backstage, Producto.
      </p>
      <div className="space-y-4">
        {pillars.map((p, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#2d333b] bg-[#0d1117] p-4"
          >
            <input
              value={p.name}
              onChange={(e) => updatePillar(i, "name", e.target.value)}
              className="w-full rounded-md border border-[#2d333b] bg-transparent px-2 py-1.5 text-sm font-bold text-[#e6edf3]"
              placeholder={`Pilar ${i + 1}`}
            />
            <textarea
              value={p.description}
              onChange={(e) => updatePillar(i, "description", e.target.value)}
              rows={2}
              className="mt-2 w-full rounded-md border border-[#2d333b] bg-transparent px-2 py-1.5 text-xs text-[#e6edf3]"
              placeholder="Descripción corta del pilar..."
            />
          </div>
        ))}
      </div>
      {pillars.length < 5 && (
        <button
          type="button"
          onClick={addPillar}
          className="text-sm font-semibold text-[#3b82f6]"
        >
          + Agregar pilar
        </button>
      )}
    </div>
  );
}

function StepPreferences({
  data,
  update,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-black text-[#e6edf3]">Preferencias</h2>
      <p className="text-sm text-[#7d8590]">
        Ajustes generales de operación.
      </p>
      <Field label="Timezone">
        <select
          value={data.timezone ?? "America/Bogota"}
          onChange={(e) => update("timezone", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
        >
          <option value="America/Bogota">America/Bogotá (GMT-5)</option>
          <option value="America/Mexico_City">America/Mexico City (GMT-6)</option>
          <option value="America/Argentina/Buenos_Aires">
            Buenos Aires (GMT-3)
          </option>
          <option value="America/New_York">New York (GMT-5)</option>
          <option value="Europe/Madrid">Madrid (GMT+1)</option>
        </select>
      </Field>
      <Field label="Frecuencia de publicación">
        <select
          value={data.frequency ?? "daily"}
          onChange={(e) => update("frequency", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
        >
          <option value="daily">Diaria (1 post/día por canal)</option>
          <option value="3x_week">3 veces/semana</option>
          <option value="weekly">Semanal</option>
          <option value="custom">Personalizada</option>
        </select>
      </Field>
      <Field label="Modo de aprobación">
        <div className="space-y-2">
          {APPROVAL_MODES.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                data.approval_mode === m.id
                  ? "border-[#3b82f6] bg-[#3b82f6]/10"
                  : "border-[#2d333b]"
              }`}
            >
              <input
                type="radio"
                name="approval_mode"
                checked={data.approval_mode === m.id}
                onChange={() => update("approval_mode", m.id)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-bold text-[#e6edf3]">{m.label}</p>
                <p className="text-xs text-[#7d8590]">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </Field>
    </div>
  );
}

function StepReview({
  data,
  inviteUrl,
  onGenerateInvite,
  saving,
}: {
  data: OnboardingData;
  inviteUrl: string | null;
  onGenerateInvite: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-black text-[#e6edf3]">Revisión</h2>
      <p className="text-sm text-[#7d8590]">
        Verifica que todo esté correcto antes de completar el setup.
      </p>
      <div className="space-y-3 rounded-xl border border-[#2d333b] bg-[#0d1117] p-4 text-sm">
        <SummaryRow label="Cliente" value={data.client_name} />
        <SummaryRow label="Marca" value={data.brand} />
        <SummaryRow label="Idioma" value={data.language} />
        <SummaryRow label="Brand voice" value={data.brand_voice} />
        <SummaryRow
          label="Canales"
          value={(data.connected_platforms ?? []).join(", ") || "—"}
        />
        <SummaryRow
          label="Pilares"
          value={
            (data.content_pillars ?? [])
              .filter((p) => p.name)
              .map((p) => p.name)
              .join(", ") || "—"
          }
        />
        <SummaryRow label="Timezone" value={data.timezone} />
        <SummaryRow label="Frecuencia" value={data.frequency} />
        <SummaryRow label="Aprobación" value={data.approval_mode} />
      </div>

      <div className="rounded-xl border border-[#3b82f6]/30 bg-[#3b82f6]/5 p-4">
        <p className="text-sm font-bold text-[#e6edf3]">
          Invitar al cliente para que complete su onboarding
        </p>
        <p className="mt-1 text-xs text-[#7d8590]">
          Genera un magic-link (válido 30 días) para que el cliente conecte sus
          propias cuentas sociales y complete la información faltante.
        </p>
        {inviteUrl ? (
          <div className="mt-3 rounded-lg bg-[#0d1117] p-3 font-mono text-xs text-[#9be2d8] break-all">
            {inviteUrl}
          </div>
        ) : (
          <button
            type="button"
            onClick={onGenerateInvite}
            disabled={saving}
            className="mt-3 rounded-md bg-[#3b82f6] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            Generar magic-link
          </button>
        )}
      </div>
    </div>
  );
}

function StepDone({ clientName }: { clientName: string }) {
  return (
    <div className="space-y-4 py-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0f766e]/20 text-[#0f766e]">
        <Check className="h-8 w-8" />
      </div>
      <h2 className="text-3xl font-black text-[#e6edf3]">¡Listo!</h2>
      <p className="mx-auto max-w-md text-sm text-[#7d8590]">
        <b>{clientName}</b> está configurado. Ya puedes empezar a generar
        contenido, programar posts y ver analytics desde el dashboard.
      </p>
      <a
        href="/dashboard"
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#3b82f6] px-6 py-3 text-sm font-bold text-white"
      >
        Ir al dashboard
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#7d8590]">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#7d8590]">{label}</span>
      <span className="text-right text-[#e6edf3]">{value || "—"}</span>
    </div>
  );
}
