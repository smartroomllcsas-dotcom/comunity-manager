"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BrandAccountPicker } from "@/components/whatsapp/cloud/BrandAccountPicker";
import { TemplateForm } from "@/components/whatsapp/cloud/TemplateForm";
import type { TemplateFormValue } from "@/components/whatsapp/cloud/TemplateForm";

export const dynamic = "force-dynamic";

export default function NewTemplatePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [clientId, setClientId] = useState<string | null>(params.get("clientId"));
  const [accountId, setAccountId] = useState<string | null>(params.get("accountId"));
  const [submitting, setSubmitting] = useState(false);

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
        <TemplateForm submitting={submitting} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
