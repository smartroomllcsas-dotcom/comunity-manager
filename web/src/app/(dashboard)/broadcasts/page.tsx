"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Radio, RefreshCw, Pause, Play, XCircle, Eye } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";

export const dynamic = "force-dynamic";

type BroadcastItem = {
  id: string;
  name: string;
  status: string;
  channel_kind: "whatsapp_cloud" | "waha";
  channel_name: string | null;
  template_name: string | null;
  message_text: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  skipped_count: number;
  last_error: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-zinc-500/20 text-zinc-300" },
  scheduled: { label: "Programada", cls: "bg-blue-500/20 text-blue-300" },
  sending: { label: "Enviando", cls: "bg-amber-500/20 text-amber-300" },
  paused: { label: "Pausada", cls: "bg-orange-500/20 text-orange-300" },
  completed: { label: "Completada", cls: "bg-green-500/20 text-green-300" },
  cancelled: { label: "Cancelada", cls: "bg-zinc-500/20 text-zinc-400" },
  failed: { label: "Fallida", cls: "bg-red-500/20 text-red-300" },
};

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "sending", label: "Enviando" },
  { id: "scheduled", label: "Programadas" },
  { id: "paused", label: "Pausadas" },
  { id: "completed", label: "Completadas" },
  { id: "cancelled", label: "Canceladas" },
];

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
}

export default function BroadcastsPage() {
  const { activeClientId, activeClient } = useActiveBrand();
  const [items, setItems] = useState<BroadcastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/broadcasts/v2?clientId=${activeClientId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las difusiones");
      setItems(data.broadcasts || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresco suave mientras haya difusiones enviando
  useEffect(() => {
    if (!items.some((b) => b.status === "sending")) return;
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [items, load]);

  async function act(id: string, action: "pause" | "resume" | "cancel") {
    if (!activeClientId) return;
    if (action === "cancel" && !window.confirm("¿Cancelar esta difusión? Los pendientes no se enviarán.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/broadcasts/v2/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: activeClientId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo aplicar");
      toast.success(action === "pause" ? "Difusión pausada" : action === "resume" ? "Difusión reanudada" : "Difusión cancelada");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const filtered = items.filter((b) => filter === "all" || b.status === filter);
  const counts = items.reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.status]: (acc[b.status] || 0) + 1, all: (acc.all || 0) + 1 }), {});

  if (!activeClientId) {
    return (
      <div className="p-6 text-sm text-[#8b949e]">Elige una empresa en el menú lateral para ver sus difusiones.</div>
    );
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white">Difusiones</h1>
          <p className="text-xs text-[#8b949e]">
            Mensajes masivos por WhatsApp para <span className="text-white">{activeClient?.name}</span>. Cada difusión es sólo de esta empresa.
          </p>
        </div>
        <button onClick={() => void load()} className="rounded-md border border-[#2d333b] p-2 text-[#8b949e] hover:text-white" title="Actualizar">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <Link href="/broadcasts/new" className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> Nueva difusión
        </Link>
      </div>

      <div className="flex gap-1 px-6 pt-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs ${filter === f.id ? "bg-blue-500/20 text-blue-300" : "text-[#8b949e] hover:text-white"}`}
          >
            {f.label} <span className="opacity-70">{counts[f.id] || 0}</span>
          </button>
        ))}
      </div>

      <div className="p-6">
        {loading && items.length === 0 ? (
          <p className="text-sm text-[#8b949e]">Cargando…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2d333b] p-12 text-center">
            <Radio className="mx-auto h-8 w-8 text-[#2d333b]" />
            <p className="mt-3 text-sm font-medium text-white">Sin difusiones todavía</p>
            <p className="text-xs text-[#8b949e]">Crea la primera: eliges a quién, con qué plantilla y cuándo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#2d333b]">
            <table className="w-full text-sm">
              <thead className="bg-[#161b22] text-xs text-[#8b949e]">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium">Difusión</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-3 py-2.5 font-medium">Progreso</th>
                  <th className="px-3 py-2.5 font-medium text-right">Entregados</th>
                  <th className="px-3 py-2.5 font-medium text-right">Leídos</th>
                  <th className="px-3 py-2.5 font-medium text-right">Respondieron</th>
                  <th className="px-3 py-2.5 font-medium text-right">Fallidos</th>
                  <th className="px-3 py-2.5 font-medium">Cuándo</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const st = STATUS[b.status] || STATUS.draft;
                  const pct = b.total_recipients ? Math.round((b.sent_count / b.total_recipients) * 100) : 0;
                  return (
                    <tr key={b.id} className="border-t border-[#2d333b]/60 hover:bg-[#161b22]">
                      <td className="px-4 py-3">
                        <Link href={`/broadcasts/${b.id}`} className="font-medium text-white hover:underline">{b.name}</Link>
                        <div className="text-[11px] text-[#8b949e]">
                          {b.channel_kind === "waha" ? "WhatsApp por QR" : "WhatsApp API"} · {b.template_name || (b.message_text ? "Texto libre" : "—")}
                        </div>
                        {b.last_error && <div className="text-[11px] text-amber-300">{b.last_error}</div>}
                      </td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span></td>
                      <td className="px-3 py-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-[#2d333b]"><div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
                          <span className="text-[11px] text-[#8b949e] whitespace-nowrap">{b.sent_count}/{b.total_recipients}</span>
                        </div>
                        {b.skipped_count > 0 && <div className="text-[10px] text-[#6e7681]">{b.skipped_count} excluidos</div>}
                      </td>
                      <td className="px-3 py-3 text-right text-green-300">{b.delivered_count}</td>
                      <td className="px-3 py-3 text-right text-purple-300">{b.read_count}</td>
                      <td className="px-3 py-3 text-right text-cyan-300">{b.replied_count}</td>
                      <td className="px-3 py-3 text-right text-red-300">{b.failed_count}</td>
                      <td className="px-3 py-3 text-xs text-[#8b949e] whitespace-nowrap">
                        {b.status === "scheduled" ? `Programada ${fmt(b.scheduled_at)}` : b.completed_at ? `Terminó ${fmt(b.completed_at)}` : b.started_at ? `Inició ${fmt(b.started_at)}` : fmt(b.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/broadcasts/${b.id}`} className="rounded p-1 text-[#8b949e] hover:text-white" title="Ver detalle"><Eye className="h-4 w-4" /></Link>
                          {(b.status === "sending" || b.status === "scheduled") && (
                            <button disabled={busy === b.id} onClick={() => act(b.id, "pause")} className="rounded p-1 text-[#8b949e] hover:text-white" title="Pausar"><Pause className="h-4 w-4" /></button>
                          )}
                          {b.status === "paused" && (
                            <button disabled={busy === b.id} onClick={() => act(b.id, "resume")} className="rounded p-1 text-[#8b949e] hover:text-white" title="Reanudar"><Play className="h-4 w-4" /></button>
                          )}
                          {["sending", "scheduled", "paused", "draft"].includes(b.status) && (
                            <button disabled={busy === b.id} onClick={() => act(b.id, "cancel")} className="rounded p-1 text-[#8b949e] hover:text-red-300" title="Cancelar"><XCircle className="h-4 w-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
