"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Pause, Play, XCircle, RotateCcw, RefreshCw } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";

export const dynamic = "force-dynamic";

type Recipient = {
  id: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  error: string | null;
  skipped_label: string | null;
  contact: { id: string; name: string | null; wa_id: string | null } | null;
};

const R_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "text-[#8b949e]" },
  sent: { label: "Enviado", cls: "text-blue-300" },
  delivered: { label: "Entregado", cls: "text-green-300" },
  read: { label: "Leído", cls: "text-purple-300" },
  replied: { label: "Respondió", cls: "text-cyan-300" },
  failed: { label: "Falló", cls: "text-red-300" },
  skipped: { label: "Excluido", cls: "text-[#6e7681]" },
};

const B_STATUS: Record<string, string> = {
  draft: "Borrador", scheduled: "Programada", sending: "Enviando", paused: "Pausada", completed: "Completada", cancelled: "Cancelada", failed: "Fallida",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
}

export default function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeClientId } = useActiveBrand();
  const [broadcast, setBroadcast] = useState<Record<string, unknown> | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [tab, setTab] = useState<"all" | "pending" | "sent" | "replied" | "failed" | "skipped">("all");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/broadcasts/v2/${id}?clientId=${activeClientId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar");
      setBroadcast(data.broadcast);
      setRecipients(data.recipients || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeClientId, id]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (broadcast?.status !== "sending") return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [broadcast?.status, load]);

  async function act(action: "pause" | "resume" | "cancel" | "retry_failed") {
    if (!activeClientId) return;
    if (action === "cancel" && !window.confirm("¿Cancelar esta difusión?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/broadcasts/v2/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: activeClientId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo aplicar");
      toast.success(action === "retry_failed" ? `${data.retried} destinatarios vuelven a la cola` : "Listo");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const b = broadcast as (Record<string, unknown> & { status?: string }) | null;
  const n = (k: string) => Number((b?.[k] as number) || 0);
  const shown = recipients.filter((r) => {
    if (tab === "all") return r.status !== "skipped";
    if (tab === "sent") return ["sent", "delivered", "read"].includes(r.status);
    return r.status === tab;
  });

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/broadcasts" className="text-[#8b949e] hover:text-white"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-white truncate">{(b?.name as string) || "Difusión"}</h1>
          <p className="text-xs text-[#8b949e]">
            {b?.status ? B_STATUS[b.status] || b.status : ""} · {b?.channel_kind === "waha" ? "WhatsApp por QR" : "WhatsApp API"}
            {b?.scheduled_at && b?.status === "scheduled" ? ` · programada para ${fmt(b.scheduled_at as string)}` : ""}
            {` · ${n("send_rate_per_hour")} por hora`}
          </p>
          {b?.last_error ? <p className="text-xs text-amber-300">{String(b.last_error)}</p> : null}
        </div>
        <button onClick={() => void load()} className="rounded-md border border-[#2d333b] p-2 text-[#8b949e] hover:text-white"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        {(b?.status === "sending" || b?.status === "scheduled") && (
          <button disabled={busy} onClick={() => act("pause")} className="inline-flex items-center gap-1 rounded-md border border-[#2d333b] px-3 py-2 text-xs text-white hover:bg-[#21262d]"><Pause className="h-3.5 w-3.5" /> Pausar</button>
        )}
        {b?.status === "paused" && (
          <button disabled={busy} onClick={() => act("resume")} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700"><Play className="h-3.5 w-3.5" /> Reanudar</button>
        )}
        {n("failed_count") > 0 && b?.status !== "cancelled" && (
          <button disabled={busy} onClick={() => act("retry_failed")} className="inline-flex items-center gap-1 rounded-md border border-[#2d333b] px-3 py-2 text-xs text-white hover:bg-[#21262d]"><RotateCcw className="h-3.5 w-3.5" /> Reintentar fallidos</button>
        )}
        {["sending", "scheduled", "paused", "draft"].includes(String(b?.status)) && (
          <button disabled={busy} onClick={() => act("cancel")} className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"><XCircle className="h-3.5 w-3.5" /> Cancelar</button>
        )}
      </div>

      <div className="p-6 space-y-5">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Destinatarios", n("total_recipients"), "text-white"],
            ["Enviados", n("sent_count"), "text-blue-300"],
            ["Entregados", n("delivered_count"), "text-green-300"],
            ["Leídos", n("read_count"), "text-purple-300"],
            ["Respondieron", n("replied_count"), "text-cyan-300"],
            ["Fallidos", n("failed_count"), "text-red-300"],
          ].map(([label, value, cls]) => (
            <div key={String(label)} className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
              <div className="text-xs text-[#8b949e]">{label}</div>
              <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
            </div>
          ))}
        </div>

        {b?.message_text ? (
          <div className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
            <div className="text-xs text-[#8b949e] mb-1">Mensaje</div>
            <pre className="whitespace-pre-wrap text-sm text-white font-sans">{String(b.message_text)}</pre>
          </div>
        ) : null}

        <div className="rounded-xl border border-[#2d333b] bg-[#161b22]">
          <div className="flex items-center gap-1 px-4 pt-3 flex-wrap">
            {([
              ["all", "Todos"],
              ["pending", "Pendientes"],
              ["sent", "Enviados"],
              ["replied", "Respondieron"],
              ["failed", "Fallidos"],
              ["skipped", `Excluidos (${n("skipped_count")})`],
            ] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 text-xs ${tab === k ? "bg-blue-500/20 text-blue-300" : "text-[#8b949e] hover:text-white"}`}>{label}</button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-2">
              <thead className="text-xs text-[#8b949e]">
                <tr className="text-left border-b border-[#2d333b]">
                  <th className="px-4 py-2 font-medium">Contacto</th>
                  <th className="px-3 py-2 font-medium">Teléfono</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Enviado</th>
                  <th className="px-3 py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-[#8b949e]">Nada en esta vista.</td></tr>}
                {shown.slice(0, 500).map((r) => {
                  const st = R_STATUS[r.status] || R_STATUS.pending;
                  return (
                    <tr key={r.id} className="border-b border-[#2d333b]/50">
                      <td className="px-4 py-2">
                        {r.contact ? <Link href={`/contacts/${r.contact.id}`} className="text-white hover:underline">{r.contact.name || "Sin nombre"}</Link> : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-[#8b949e]">{r.contact?.wa_id || "—"}</td>
                      <td className={`px-3 py-2 text-xs font-medium ${st.cls}`}>{st.label}</td>
                      <td className="px-3 py-2 text-xs text-[#8b949e]">{fmt(r.sent_at)}</td>
                      <td className="px-3 py-2 text-xs text-[#8b949e]">
                        {r.status === "skipped" ? r.skipped_label : r.error ? <span className="text-red-300">{r.error}</span> : r.replied_at ? `Respondió ${fmt(r.replied_at)}` : r.read_at ? `Leído ${fmt(r.read_at)}` : r.delivered_at ? `Entregado ${fmt(r.delivered_at)}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
