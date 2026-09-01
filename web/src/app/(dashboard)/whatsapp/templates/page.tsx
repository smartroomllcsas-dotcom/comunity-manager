"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BrandAccountPicker } from "@/components/whatsapp/cloud/BrandAccountPicker";
import { StatusBadge, QualityBadge } from "@/components/whatsapp/cloud/StatusBadge";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import type { CmWaTemplate } from "@/lib/whatsapp/cloud/types";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { value: "",          label: "Todas" },
  { value: "APPROVED",  label: "Aprobadas" },
  { value: "PENDING",   label: "Pendientes" },
  { value: "REJECTED",  label: "Rechazadas" },
  { value: "PAUSED",    label: "Pausadas" },
  { value: "DISABLED",  label: "Deshabilitadas" },
];

export default function WhatsAppTemplatesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeClientId, setActiveClientId } = useActiveBrand();
  // Prioridad clientId: URL > switcher global (context). Estado local sincroniza con ambos.
  const [clientId, setClientId] = useState<string | null>(params.get("clientId") ?? activeClientId);
  const [accountId, setAccountId] = useState<string | null>(params.get("accountId"));
  const [statusFilter, setStatusFilter] = useState<string>(params.get("status") ?? "");
  const [search, setSearch] = useState<string>(params.get("search") ?? "");
  const [templates, setTemplates] = useState<CmWaTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Si el switcher global cambia y no hay override explícito en URL, adopta la nueva marca.
  useEffect(() => {
    const urlId = params.get("clientId");
    if (!urlId && activeClientId && activeClientId !== clientId) {
      setClientId(activeClientId);
      setAccountId(null);
    }
  }, [activeClientId, params, clientId]);

  useEffect(() => {
    // sync URL solamente. El provider detecta ?clientId= en URL y actualiza
    // activeClientId por su cuenta — evitamos el ciclo bidireccional que
    // disparaba fetches duplicados.
    const q = new URLSearchParams();
    if (clientId) q.set("clientId", clientId);
    if (accountId) q.set("accountId", accountId);
    if (statusFilter) q.set("status", statusFilter);
    if (search) q.set("search", search);
    router.replace(`?${q.toString()}`, { scroll: false });
  }, [clientId, accountId, statusFilter, search, router]);

  useEffect(() => {
    if (!clientId) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    const q = new URLSearchParams({ clientId });
    if (accountId) q.set("accountId", accountId);
    if (statusFilter) q.set("status", statusFilter);
    if (search.trim()) q.set("search", search.trim());
    fetch(`/api/whatsapp/cloud/templates?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setTemplates(d.templates ?? []);
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [clientId, accountId, statusFilter, search]);

  async function handleSync() {
    if (!clientId) {
      toast.error("Selecciona una empresa primero");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/cloud/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync falló");
      toast.success(`Sincronizadas ${data.synced} plantillas (${data.created} nuevas, ${data.updated} actualizadas)`);
      // re-fetch
      setStatusFilter((s) => s);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const counts = useMemo(() => {
    const c = { total: templates.length, approved: 0, pending: 0, rejected: 0 };
    for (const t of templates) {
      if (t.status === "APPROVED") c.approved++;
      else if (t.status === "PENDING") c.pending++;
      else if (t.status === "REJECTED") c.rejected++;
    }
    return c;
  }, [templates]);

  return (
    <div className="min-h-full bg-[#0d1117] text-[#c9d1d9]">
      <div className="border-b border-[#2d333b] bg-[#161b22] px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Plantillas de WhatsApp Business</h1>
            <p className="text-sm text-[#8b949e]">Gestión de mensajes de plantilla por empresa · Cloud API oficial</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/whatsapp/automatizacion"
              className="px-3 py-2 rounded-md bg-[#21262d] hover:bg-[#30363d] text-sm border border-[#30363d]"
            >
              ⚡ Automatización de leads
            </Link>
            <button
              onClick={handleSync}
              disabled={!clientId || syncing}
              className="px-3 py-2 rounded-md bg-[#21262d] hover:bg-[#30363d] text-sm border border-[#30363d] disabled:opacity-50"
            >
              {syncing ? "Sincronizando..." : "Sincronizar con Meta"}
            </button>
            <Link
              href={`/whatsapp/templates/new${clientId ? `?clientId=${clientId}${accountId ? `&accountId=${accountId}` : ""}` : ""}`}
              className={`px-3 py-2 rounded-md text-sm font-medium ${clientId ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-[#21262d] text-[#8b949e] pointer-events-none"}`}
            >
              + Nueva plantilla
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <BrandAccountPicker
            clientId={clientId}
            accountId={accountId}
            onChange={(cid, aid) => {
              setClientId(cid);
              setAccountId(aid);
            }}
          />
          <label className="block">
            <span className="block text-xs text-[#8b949e] mb-1">Estado</span>
            <select className="input min-w-[180px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="block flex-1 max-w-md">
            <span className="block text-xs text-[#8b949e] mb-1">Buscar por nombre</span>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="pedido_..." />
          </label>
        </div>

        {clientId && (
          <div className="flex gap-3 text-xs text-[#8b949e]">
            <span>Total: <strong className="text-white">{counts.total}</strong></span>
            <span>Aprobadas: <strong className="text-green-400">{counts.approved}</strong></span>
            <span>Pendientes: <strong className="text-yellow-400">{counts.pending}</strong></span>
            <span>Rechazadas: <strong className="text-red-400">{counts.rejected}</strong></span>
          </div>
        )}

        {!clientId ? (
          <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-8 text-center text-[#8b949e]">
            Selecciona una empresa para ver sus plantillas.
          </div>
        ) : loading ? (
          <div className="text-center py-8 text-[#8b949e]">Cargando...</div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-[#2d333b] bg-[#161b22] p-8 text-center text-[#8b949e]">
            No hay plantillas todavía. Crea una nueva o sincroniza con Meta.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#2d333b] bg-[#161b22]">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-[#8b949e] bg-[#0d1117]">
                <tr>
                  <th className="px-4 py-2 text-left">Nombre</th>
                  <th className="px-4 py-2 text-left">Idioma</th>
                  <th className="px-4 py-2 text-left">Categoría</th>
                  <th className="px-4 py-2 text-left">Estado</th>
                  <th className="px-4 py-2 text-left">Calidad</th>
                  <th className="px-4 py-2 text-left">Sync</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-t border-[#2d333b] hover:bg-[#1c2128]">
                    <td className="px-4 py-2">
                      <Link href={`/whatsapp/templates/${t.id}?clientId=${clientId}`} className="text-blue-400 hover:underline font-medium">
                        {t.name}
                      </Link>
                      {t.tag && <div className="text-xs text-[#8b949e]">{t.tag}</div>}
                    </td>
                    <td className="px-4 py-2 text-[#c9d1d9]">{t.language}</td>
                    <td className="px-4 py-2 text-[#8b949e]">{t.category}</td>
                    <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-2"><QualityBadge quality={t.quality} /></td>
                    <td className="px-4 py-2 text-xs text-[#8b949e]">
                      {new Date(t.synced_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
