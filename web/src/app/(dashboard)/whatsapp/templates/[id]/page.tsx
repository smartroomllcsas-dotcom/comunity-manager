"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { StatusBadge, QualityBadge } from "@/components/whatsapp/cloud/StatusBadge";
import { TemplatePreview } from "@/components/whatsapp/cloud/TemplatePreview";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import type { CmWaTemplate } from "@/lib/whatsapp/cloud/types";
import { friendlyRejectionReason } from "@/lib/whatsapp/cloud/error-map";

export const dynamic = "force-dynamic";

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const { activeClientId } = useActiveBrand();
  // Prio: query param (deep-link) → switcher global (context)
  const clientId = search.get("clientId") ?? activeClientId;
  const [tpl, setTpl] = useState<CmWaTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [toPhone, setToPhone] = useState("");
  const [samples, setSamples] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`/api/whatsapp/cloud/templates/${id}?clientId=${clientId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setTpl(d.template);
        // preparar samples con el # de vars
        const body = d.template?.components?.find((c: { type: string }) => c.type === "BODY") as { text?: string } | undefined;
        const nums = new Set(
          (body?.text?.match(/\{\{\s*(\d+)\s*\}\}/g) || []).map((m: string) => Number(m.replace(/[^\d]/g, "")))
        );
        setSamples(Array.from({ length: nums.size }, () => ""));
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [id, clientId]);

  async function handleDelete(hard = false) {
    if (!clientId) return;
    if (!confirm(hard ? "Borrar TODAS las traducciones del template?" : "Borrar esta variante de idioma?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/whatsapp/cloud/templates/${id}?clientId=${clientId}${hard ? "&hard=1" : ""}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo borrar");
      toast.success("Plantilla marcada para eliminación");
      router.push(`/whatsapp/templates?clientId=${clientId}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSend() {
    if (!clientId || !tpl) return;
    if (!/^\d{7,15}$/.test(toPhone)) {
      toast.error("Formato E.164 sin '+': ej 573001234567");
      return;
    }
    setSending(true);
    try {
      // Construir components send-side: solo BODY con variables si existen
      const components: unknown[] = [];
      if (samples.length > 0) {
        components.push({
          type: "body",
          parameters: samples.map((s) => ({ type: "text", text: s || "sample" })),
        });
      }
      const res = await fetch(`/api/whatsapp/cloud/templates/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, to: toPhone, components }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Envío falló");
      toast.success(`Enviado. wamid: ${data.wamid ?? "—"}`);
      setShowSend(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!clientId) return <div className="p-6 text-red-400">Falta clientId en la URL.</div>;
  if (loading) return <div className="p-6 text-[#8b949e]">Cargando...</div>;
  if (!tpl) return <div className="p-6 text-red-400">Plantilla no encontrada.</div>;

  return (
    <div className="min-h-full bg-[#0d1117] text-[#c9d1d9]">
      <div className="border-b border-[#2d333b] bg-[#161b22] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/whatsapp/templates?clientId=${clientId}`} className="text-sm text-[#8b949e] hover:text-white">
              ← Volver
            </Link>
            <h1 className="text-xl font-semibold flex items-center gap-3">
              {tpl.name}
              <StatusBadge status={tpl.status} />
              <QualityBadge quality={tpl.quality} />
            </h1>
            <p className="text-sm text-[#8b949e]">
              {tpl.category} · {tpl.language} · Actualizada {new Date(tpl.updated_at).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSend(true)}
              disabled={tpl.status !== "APPROVED"}
              className="px-3 py-2 rounded-md text-sm bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:pointer-events-none"
            >
              Enviar prueba
            </button>
            <button
              onClick={() => handleDelete(false)}
              disabled={deleting}
              className="px-3 py-2 rounded-md text-sm bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50"
            >
              Eliminar variante
            </button>
            <button
              onClick={() => handleDelete(true)}
              disabled={deleting}
              className="px-3 py-2 rounded-md text-sm bg-red-700/80 hover:bg-red-700 text-white disabled:opacity-50"
            >
              Eliminar todas
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          {tpl.status === "REJECTED" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <h4 className="text-sm font-medium text-red-300">Rechazada</h4>
              <p className="text-sm text-red-200 mt-1">{friendlyRejectionReason(tpl.rejection_reason)}</p>
              <p className="text-xs text-red-200/70 mt-2">Corrige el contenido y crea una nueva.</p>
            </div>
          )}
          {tpl.status === "PAUSED" && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4">
              <h4 className="text-sm font-medium text-orange-300">Pausada por baja calidad</h4>
              <p className="text-sm text-orange-200 mt-1">Los usuarios están reportando/bloqueando. Revisa el copy.</p>
            </div>
          )}

          <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4">
            <h4 className="text-sm font-medium mb-3">Componentes</h4>
            <pre className="text-xs text-[#8b949e] overflow-auto max-h-96">
              {JSON.stringify(tpl.components, null, 2)}
            </pre>
          </div>

          <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-4 grid grid-cols-2 gap-3 text-sm">
            <Meta label="ID Meta" value={tpl.meta_id ?? "—"} />
            <Meta label="ID local" value={tpl.id.slice(0, 12)} />
            <Meta label="Cuenta WhatsApp" value={tpl.whatsapp_account_id.slice(0, 12)} />
            <Meta label="Formato variables" value={tpl.parameter_format} />
            <Meta label="Categoría anterior" value={tpl.previous_category ?? "—"} />
            <Meta label="Etiqueta" value={tpl.tag ?? "—"} />
          </div>
        </div>

        <div>
          <div className="sticky top-4 space-y-2">
            <h4 className="text-sm text-[#8b949e]">Vista previa</h4>
            <TemplatePreview components={tpl.components} samples={samples.map((s, i) => s || `Var ${i + 1}`)} />
          </div>
        </div>
      </div>

      {showSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSend(false)}>
          <div className="max-w-md w-full rounded-lg bg-[#161b22] border border-[#2d333b] p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Enviar prueba</h3>
            <label className="block">
              <span className="text-xs text-[#8b949e]">Teléfono destino (E.164 sin '+')</span>
              <input className="input" value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="573001234567" />
            </label>
            {samples.map((s, i) => (
              <label key={i} className="block">
                <span className="text-xs text-[#8b949e]">Variable {`{{${i + 1}}}`}</span>
                <input
                  className="input"
                  value={s}
                  onChange={(e) => setSamples((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder="Valor de prueba"
                />
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-2 text-sm rounded bg-[#21262d]" onClick={() => setShowSend(false)}>
                Cancelar
              </button>
              <button
                className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[#8b949e]">{label}</div>
      <div className="text-sm font-mono text-[#c9d1d9] break-all">{value}</div>
    </div>
  );
}
