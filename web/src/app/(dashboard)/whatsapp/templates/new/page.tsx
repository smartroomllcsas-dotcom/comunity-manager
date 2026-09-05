"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BrandAccountPicker } from "@/components/whatsapp/cloud/BrandAccountPicker";
import { TemplateForm } from "@/components/whatsapp/cloud/TemplateForm";
import type { TemplateFormValue } from "@/components/whatsapp/cloud/TemplateForm";
import { useActiveBrand } from "@/hooks/useActiveBrand";

export const dynamic = "force-dynamic";

export default function NewTemplatePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeClientId } = useActiveBrand();
  const [clientId, setClientId] = useState<string | null>(params.get("clientId") ?? activeClientId);
  const [accountId, setAccountId] = useState<string | null>(params.get("accountId"));
  const [submitting, setSubmitting] = useState(false);

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

  /**
   * Graph v26 rechaza con INVALID_FORMAT las variables posicionales {{1}}
   * (verificado 2026-09-01 contra dos WABAs distintas; sin example y con
   * example igual). Convertimos a parámetros con nombre ({{var1}}) y
   * generamos los example obligatorios antes de enviar a Meta.
   */
  // Convierte {{1}} → {{var1}} (Meta v26 rechaza posicional en este WABA) y
  // adjunta los ejemplos REALES que el usuario escribió por variable.
  function toNamedParams(
    components: TemplateFormValue["components"],
    examples: string[]
  ) {
    let hasVars = false;
    const converted = components.map((c) => {
      if (!c.text || !/\{\{\s*\d+\s*\}\}/.test(c.text)) return c;
      hasVars = true;
      const nums: number[] = [];
      const text = c.text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
        const num = Number(n);
        if (!nums.includes(num)) nums.push(num);
        return `{{var${num}}}`;
      });
      const exampleFor = (num: number) => examples[num - 1] || `Ejemplo ${num}`;
      const example =
        c.type === "BODY"
          ? {
              body_text_named_params: nums.map((num) => ({
                param_name: `var${num}`,
                example: exampleFor(num),
              })),
            }
          : c.type === "HEADER"
          ? { header_text: nums.map((num) => exampleFor(num)) }
          : undefined;
      return { ...c, text, ...(example ? { example } : {}) };
    });
    return { converted, parameterFormat: hasVars ? "NAMED" : "POSITIONAL" };
  }

  async function handleSubmit(v: TemplateFormValue) {
    if (!clientId || !accountId) {
      toast.error("Selecciona empresa y cuenta WhatsApp primero");
      return;
    }
    setSubmitting(true);
    try {
      const { converted, parameterFormat } = toNamedParams(v.components, v.examples);
      const res = await fetch("/api/whatsapp/cloud/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          whatsapp_account_id: accountId,
          name: v.name,
          language: v.language,
          category: v.category,
          parameter_format: parameterFormat,
          components: converted,
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
        <TemplateForm submitting={submitting} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
