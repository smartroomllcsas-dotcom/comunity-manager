"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Subscription } from "@/types/database";

const STATUS_COLORS: Record<string, string> = {
  trial: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  past_due: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  suspended: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  trial: "Trial",
  active: "Activa",
  past_due: "Vencida",
  cancelled: "Cancelada",
  suspended: "Suspendida",
};

interface SubRow extends Omit<Subscription, "organization" | "plan"> {
  organization?: { name: string };
  plan?: { name: string };
}

export default function AdminSubscriptionsPage() {
  const supabase = createClient();
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("subscriptions")
        .select("*, organization:organizations(name), plan:plans(name)")
        .order("created_at", { ascending: false });
      setSubs((data as SubRow[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return subs;
    return subs.filter((s) => s.status === statusFilter);
  }, [subs, statusFilter]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  async function updateStatus(id: string, status: string) {
    await supabase.from("subscriptions").update({ status }).eq("id", id);
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, status: status as any } : s)));
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando suscripciones...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Suscripciones</h1>
        <p className="text-sm text-[#8b949e] mt-1">Gestiona todas las suscripciones de la plataforma</p>
      </div>

      {/* Status filters */}
      <div className="flex gap-1 flex-wrap">
        {["all", "trial", "active", "past_due", "cancelled", "suspended"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(0); }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              statusFilter === s
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "text-[#8b949e] hover:text-white border border-[#1e2433] hover:border-[#3d444d]"
            }`}
          >
            {s === "all" ? "Todas" : STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2433] text-[#8b949e] text-xs">
                <th className="text-left px-5 py-3 font-medium">Organizacion</th>
                <th className="text-left px-5 py-3 font-medium">Plan</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
                <th className="text-left px-5 py-3 font-medium">Inicio</th>
                <th className="text-left px-5 py-3 font-medium">Fin</th>
                <th className="text-left px-5 py-3 font-medium">Ultimo Pago</th>
                <th className="text-left px-5 py-3 font-medium">Metodo</th>
                <th className="text-left px-5 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((sub) => (
                <tr key={sub.id} className="border-b border-[#1e2433]/50 hover:bg-[#1a1f2e]/30">
                  <td className="px-5 py-3 text-white font-medium">{(sub as any).organization?.name || "—"}</td>
                  <td className="px-5 py-3 text-[#8b949e] capitalize">{(sub as any).plan?.name || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${STATUS_COLORS[sub.status] || ""}`}>
                      {STATUS_LABELS[sub.status] || sub.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#8b949e]">
                    {sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString("es-CO") : "—"}
                  </td>
                  <td className="px-5 py-3 text-[#8b949e]">
                    {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("es-CO") : "—"}
                  </td>
                  <td className="px-5 py-3 text-[#8b949e]">
                    {sub.last_payment_at
                      ? `$${(sub.last_payment_amount ?? 0).toLocaleString("es-CO")} - ${new Date(sub.last_payment_at).toLocaleDateString("es-CO")}`
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-[#8b949e] capitalize">{sub.payment_method || "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      {sub.status === "cancelled" || sub.status === "suspended" ? (
                        <button
                          onClick={() => updateStatus(sub.id, "active")}
                          className="px-2 py-1 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded hover:bg-green-500/20 transition-colors"
                        >
                          Reactivar
                        </button>
                      ) : (
                        <button
                          onClick={() => updateStatus(sub.id, "cancelled")}
                          className="px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-[#8b949e]">
                    No se encontraron suscripciones
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#1e2433]">
            <span className="text-xs text-[#8b949e]">Pagina {page + 1} de {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded hover:bg-[#1e2433] text-[#8b949e] disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded hover:bg-[#1e2433] text-[#8b949e] disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
