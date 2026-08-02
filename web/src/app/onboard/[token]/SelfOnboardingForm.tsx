"use client";

// Sprint 26 · Agente S · Self-service onboarding (cliente-side, sin auth).
//
// Similar al OnboardingWizard pero mas simple: solo steps brand → platforms →
// content_pillars → preferences → done. Sin welcome (ya sabemos quien es).

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

type Step = "brand" | "platforms" | "content_pillars" | "preferences" | "done";

const STEP_ORDER: Step[] = [
  "brand",
  "platforms",
  "content_pillars",
  "preferences",
  "done",
];

const STEP_LABELS: Record<Step, string> = {
  brand: "Marca",
  platforms: "Canales",
  content_pillars: "Pilares",
  preferences: "Preferencias",
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

interface Props {
  token: string;
  agencyName: string;
  clientName: string;
  initialData: Record<string, unknown>;
  initialStep: string;
}

export function SelfOnboardingForm({
  token,
  agencyName,
  clientName,
  initialData,
  initialStep,
}: Props) {
  const initial: Step = (STEP_ORDER as string[]).includes(initialStep)
    ? (initialStep as Step)
    : "brand";
  const [step, setStep] = React.useState<Step>(initial);
  const [data, setData] = React.useState<Record<string, unknown>>(initialData ?? {});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const currentIdx = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length - 1;
  const progress = Math.round((currentIdx / (totalSteps - 1)) * 100);

  async function saveAndAdvance(nextStep: Step) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: nextStep, data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      setStep(nextStep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  function update(key: string, value: unknown) {
    setData((d) => ({ ...d, [key]: value }));
  }

  return (
    <main className="min-h-screen bg-[#010409] px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9be2d8]">
            {agencyName} te invita
          </p>
          <h1 className="mt-2 text-3xl font-black text-[#e6edf3]">
            Hola {clientName}, completa tu onboarding
          </h1>
          <p className="mt-2 text-sm text-[#7d8590]">
            Estos pasos ayudan a que tu agencia genere contenido acorde a tu
            marca y publique en tus canales.
          </p>
        </div>

        {step !== "done" && (
          <div className="mb-6">
            <div className="mb-2 flex justify-between text-xs font-semibold text-[#7d8590]">
              <span>
                Paso {currentIdx + 1} de {totalSteps}: {STEP_LABELS[step]}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#1a1f2e]">
              <div
                className="h-full bg-[#0f766e] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-[#f85149]/40 bg-[#f85149]/10 p-3 text-sm text-[#f85149]">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-[#2d333b] bg-[#0d1117] p-8">
          {step === "brand" && <BrandStep data={data} update={update} />}
          {step === "platforms" && (
            <PlatformsStep data={data} update={update} token={token} />
          )}
          {step === "content_pillars" && (
            <PillarsStep data={data} update={update} />
          )}
          {step === "preferences" && (
            <PreferencesStep data={data} update={update} />
          )}
          {step === "done" && <DoneStep agencyName={agencyName} />}
        </div>

        {step !== "done" && (
          <div className="mt-5 flex items-center justify-between">
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
              className="inline-flex items-center gap-2 rounded-full bg-[#0f766e] px-5 py-2 text-sm font-bold text-white hover:bg-[#065f57] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {step === "preferences" ? "Finalizar" : "Guardar y continuar"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function BrandStep({
  data,
  update,
}: {
  data: Record<string, unknown>;
  update: (k: string, v: unknown) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-[#e6edf3]">Tu marca</h2>
      <Label t="URL del logo">
        <input
          type="url"
          value={(data.logo_url as string) ?? ""}
          onChange={(e) => update("logo_url", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
          placeholder="https://..."
        />
      </Label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label t="Color primario">
          <input
            type="color"
            value={(data.primary_color as string) ?? "#0f766e"}
            onChange={(e) => update("primary_color", e.target.value)}
            className="h-10 w-full rounded-lg border border-[#2d333b] bg-[#0d1117]"
          />
        </Label>
        <Label t="Color secundario">
          <input
            type="color"
            value={(data.secondary_color as string) ?? "#f7c65f"}
            onChange={(e) => update("secondary_color", e.target.value)}
            className="h-10 w-full rounded-lg border border-[#2d333b] bg-[#0d1117]"
          />
        </Label>
      </div>
      <Label t="Cómo habla tu marca (brand voice)">
        <textarea
          value={(data.brand_voice as string) ?? ""}
          onChange={(e) => update("brand_voice", e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
          placeholder="Cercana, jovial, evita anglicismos..."
        />
      </Label>
    </div>
  );
}

function PlatformsStep({
  data,
  update,
  token,
}: {
  data: Record<string, unknown>;
  update: (k: string, v: unknown) => void;
  token: string;
}) {
  const connected = (data.connected_platforms as string[]) ?? [];
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-[#e6edf3]">
        Conecta tus cuentas sociales
      </h2>
      <p className="text-sm text-[#7d8590]">
        Al hacer click en Conectar se abrirá la ventana oficial del canal para
        autorizar. Nosotros nunca vemos tu contraseña.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map((p) => {
          const isConnected = connected.includes(p.id);
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl border p-3 ${
                isConnected
                  ? "border-[#0f766e]/50 bg-[#0f766e]/10"
                  : "border-[#2d333b] bg-[#0d1117]"
              }`}
            >
              <div className="flex items-center gap-2">
                {isConnected && <Check className="h-4 w-4 text-[#0f766e]" />}
                <span className="text-sm font-semibold text-[#e6edf3]">
                  {p.name}
                </span>
              </div>
              <div className="flex gap-1.5">
                <a
                  href={`/api/social/oauth/${p.id}/init?onboard_token=${encodeURIComponent(token)}`}
                  className="rounded-md bg-[#0f766e] px-3 py-1 text-xs font-bold text-white hover:bg-[#065f57]"
                >
                  Conectar
                </a>
                <button
                  type="button"
                  onClick={() =>
                    update(
                      "connected_platforms",
                      isConnected
                        ? connected.filter((x) => x !== p.id)
                        : [...connected, p.id],
                    )
                  }
                  className="rounded-md border border-[#2d333b] px-2 py-1 text-xs font-semibold text-[#7d8590]"
                >
                  {isConnected ? "Quitar" : "Marcar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PillarsStep({
  data,
  update,
}: {
  data: Record<string, unknown>;
  update: (k: string, v: unknown) => void;
}) {
  const pillars =
    (data.content_pillars as Array<{ name: string; description: string }>) ??
    [
      { name: "", description: "" },
      { name: "", description: "" },
      { name: "", description: "" },
    ];
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-[#e6edf3]">
        Sobre qué quieres hablar
      </h2>
      <p className="text-sm text-[#7d8590]">
        Define 3 temas o pilares principales que guiarán tu contenido.
      </p>
      <div className="space-y-3">
        {pillars.map((p, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#2d333b] bg-[#0d1117] p-3"
          >
            <input
              value={p.name}
              onChange={(e) => {
                const next = pillars.map((x, idx) =>
                  idx === i ? { ...x, name: e.target.value } : x,
                );
                update("content_pillars", next);
              }}
              className="w-full rounded-md border border-[#2d333b] bg-transparent px-2 py-1.5 text-sm font-bold text-[#e6edf3]"
              placeholder={`Pilar ${i + 1}`}
            />
            <textarea
              value={p.description}
              onChange={(e) => {
                const next = pillars.map((x, idx) =>
                  idx === i ? { ...x, description: e.target.value } : x,
                );
                update("content_pillars", next);
              }}
              rows={2}
              className="mt-2 w-full rounded-md border border-[#2d333b] bg-transparent px-2 py-1.5 text-xs text-[#e6edf3]"
              placeholder="Descripción..."
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PreferencesStep({
  data,
  update,
}: {
  data: Record<string, unknown>;
  update: (k: string, v: unknown) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-[#e6edf3]">Preferencias</h2>
      <Label t="Zona horaria">
        <select
          value={(data.timezone as string) ?? "America/Bogota"}
          onChange={(e) => update("timezone", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
        >
          <option value="America/Bogota">Colombia (GMT-5)</option>
          <option value="America/Mexico_City">México (GMT-6)</option>
          <option value="America/Argentina/Buenos_Aires">
            Argentina (GMT-3)
          </option>
          <option value="Europe/Madrid">España (GMT+1)</option>
        </select>
      </Label>
      <Label t="Frecuencia">
        <select
          value={(data.frequency as string) ?? "daily"}
          onChange={(e) => update("frequency", e.target.value)}
          className="w-full rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3]"
        >
          <option value="daily">Diaria</option>
          <option value="3x_week">3 veces por semana</option>
          <option value="weekly">Semanal</option>
        </select>
      </Label>
    </div>
  );
}

function DoneStep({ agencyName }: { agencyName: string }) {
  return (
    <div className="space-y-4 py-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0f766e]/20 text-[#0f766e]">
        <Check className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-black text-[#e6edf3]">Todo listo</h2>
      <p className="mx-auto max-w-md text-sm text-[#7d8590]">
        Tu agencia <b>{agencyName}</b> ya puede empezar a trabajar. Recibirás
        avisos por WhatsApp o email cuando haya contenido para aprobar.
      </p>
    </div>
  );
}

function Label({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#7d8590]">
        {t}
      </span>
      {children}
    </label>
  );
}
