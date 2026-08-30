"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BrandAccountPicker } from "@/components/whatsapp/cloud/BrandAccountPicker";
import { TemplateForm } from "@/components/whatsapp/cloud/TemplateForm";
import type { TemplateFormValue } from "@/components/whatsapp/cloud/TemplateForm";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import {
  TEMPLATE_PRESETS,
  PRESET_GROUP_LABELS,
  buildPreset,
  type PresetGroup,
} from "@/lib/whatsapp/cloud/template-presets";

export const dynamic = "force-dynamic";

const PRESET_GROUP_ORDER: PresetGroup[] = [
  "leads_meta",
  "bienvenida",
  "seguimiento",
  "nurture",
  "operativa",
];

export default function NewTemplatePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeClientId, activeClient } = useActiveBrand();
  const [clientId, setClientId] = useState<string | null>(params.get("clientId") ?? activeClientId);
  const [accountId, setAccountId] = useState<string | null>(params.get("accountId"));
  const [submitting, setSubmitting] = useState(false);
  const [presetInitial, setPresetInitial] = useState<TemplateFormValue | null>(null);
  const [presetKey, setPresetKey] = useState<string>("manual");
  const [presetNonce, setPresetNonce] = useState(0);
  const [showPresets, setShowPresets] = useState(true);

  // Al cambiar de marca, el preset precargado quedaría con el nombre de la
  // marca anterior → resetear a manual para evitar enviar texto equivocado.
  useEffect(() => {
    setPresetInitial(null);
    setPresetKey("manual");
    setPresetNonce((n) => n + 1);
  }, [clientId]);

  // Adopta switcher global si no hay override en URL. El provider detecta
  // ?clientId= en la URL cuando pasa, por lo que no necesitamos notificarlo
  // desde aquí (evita ciclo con el resolver).
  useEffect(() => {
    const urlId = params.get("clientId");
    if (!urlId && activeClientId && activeClientId !== clientId) {
      setClientId(activeClientId);
      setAccountId(null);
    }
  }, [activeClientId, params, clientId]);

  async function handleSubmit(v: TemplateFormValue) {
    if (!clientId || !accountId) {
      toast.error("Selecciona empresa y cuenta WhatsApp primero");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/whatsapp/cloud/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          whatsapp_account_id: accountId,
          name: v.name,
          language: v.language,
          category: v.category,
          components: v.components,
          tag: v.tag || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const composite = data.warning ? `${data.error} — ${data.warning}` : (data.error ?? "No se pudo crear");
        throw new Error(composite);
      }
      toast.success("Plantilla creada. Meta la revisará en minutos.");
      router.push(`/whatsapp/templates/${data.template.id}?clientId=${clientId}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-[#0d1117] text-[#c9d1d9]">
      <div className="border-b border-[#2d333b] bg-[#161b22] px-6 py-4 flex items-center justify-between">
        <div>
          <Link href={`/whatsapp/templates${clientId ? `?clientId=${clientId}` : ""}`} className="text-sm text-[#8b949e] hover:text-white">
            ← Volver
          </Link>
          <h1 className="text-xl font-semibold">Nueva plantilla</h1>
          <p className="text-sm text-[#8b949e]">Se creará en Meta y quedará en revisión.</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4">
          <BrandAccountPicker
            clientId={clientId}
            accountId={accountId}
            onChange={(cid, aid) => {
              setClientId(cid);
              setAccountId(aid);
            }}
          />
          {clientId && !accountId && (
            <p className="text-xs text-yellow-400 mt-2">
              Selecciona una cuenta WhatsApp para crear la plantilla.
            </p>
          )}
        </div>
        <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4">
          <button
            type="button"
            onClick={() => setShowPresets((s) => !s)}
            className="flex w-full items-center justify-between text-sm font-medium text-white"
          >
            <span>
              Plantillas prediseñadas{" "}
              <span className="text-[#8b949e] font-normal">
                ({TEMPLATE_PRESETS.length} modelos{activeClient ? ` · ${activeClient.name}` : ""})
              </span>
            </span>
            <span className="text-[#8b949e]">{showPresets ? "▾" : "▸"}</span>
          </button>
          {showPresets && (
            <div className="mt-3 space-y-4">
              {PRESET_GROUP_ORDER.map((group) => {
                const items = TEMPLATE_PRESETS.filter((p) => p.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="text-xs uppercase tracking-wider text-[#8b949e] mb-1.5">
                      {PRESET_GROUP_LABELS[group]}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {items.map((p) => {
                        const active = presetKey === p.key;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => {
                              setPresetInitial(buildPreset(p, activeClient?.name ?? ""));
                              setPresetKey(p.key);
                              setPresetNonce((n) => n + 1);
                            }}
                            className={`text-left rounded-md border p-2.5 transition-colors ${
                              active
                                ? "border-emerald-500 bg-emerald-500/10"
                                : "border-[#2d333b] bg-[#0d1117] hover:border-[#8b949e]"
                            }`}
                          >
                            <div className="text-[13px] font-medium text-white">{p.label}</div>
                            <div className="text-xs text-[#8b949e] mt-0.5 line-clamp-2">
                              {p.description}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {presetKey !== "manual" && (
                <button
                  type="button"
                  onClick={() => {
                    setPresetInitial(null);
                    setPresetKey("manual");
                    setPresetNonce((n) => n + 1);
                  }}
                  className="text-xs text-[#8b949e] hover:text-white underline"
                >
                  Limpiar y empezar desde cero
                </button>
              )}
            </div>
          )}
        </div>
        <TemplateForm
          key={`${presetKey}-${presetNonce}`}
          initial={presetInitial ?? undefined}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
