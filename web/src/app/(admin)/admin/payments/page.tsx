"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  failed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  failed: "Fallido",
};

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  epayco_ref: string | null;
  description: string | null;
  created_at: string;
  organization?: { name: string };
}

export default function AdminPaymentsPage() {
  const supabase = createClient();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("payments")
        .select("*, organization:organizations(name)")
        .order("created_at", { ascending: false });
      setPayments((data as PaymentRow[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return payments;
    return payments.filter((p) => p.status === statusFilter);
  }, [payments, statusFilter]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando pagos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Pagos</h1>
        <p className="text-sm text-[#8b949e] mt-1">Historial de pagos de todas las organizaciones</p>
      </div>

      {/* Filters */}
      <div className="flex gap-1 flex-wrap">
        {["all", "pending", "approved", "rejected", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(0); }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              statusFilter === s
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "text-[#8b949e] hover:text-white border border-[#1e2433] hover:border-[#3d444d]"
            }`}
          >
            {s === "all" ? "Todos" : PAYMENT_STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2433] text-[#8b949e] text-xs">
                <th className="text-left px-5 py-3 font-medium">Fecha</th>
                <th className="text-left px-5 py-3 font-medium">Organizacion</th>
                <th className="text-left px-5 py-3 font-medium">Monto</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
                <th className="text-left px-5 py-3 font-medium">Metodo</th>
                <th className="text-left px-5 py-3 font-medium">Ref. ePayco</th>
                <th className="text-left px-5 py-3 font-medium">Descripcion</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => (
                <tr key={p.id} className="border-b border-[#1e2433]/50 hover:bg-[#1a1f2e]/30">
                  <td className="px-5 py-3 text-[#8b949e]">{new Date(p.created_at).toLocaleDateString("es-CO")}</td>
                  <td className="px-5 py-3 text-white font-medium">{p.organization?.name || "—"}</td>
                  <td className="px-5 py-3 text-white font-medium">
                    ${Number(p.amount).toLocaleString("es-CO")} <span className="text-[#8b949e] text-xs">{p.currency}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${PAYMENT_STATUS_COLORS[p.status] || ""}`}>
                      {PAYMENT_STATUS_LABELS[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#8b949e] capitalize">{p.payment_method || "—"}</td>
                  <td className="px-5 py-3 text-[#8b949e] font-mono text-xs">{p.epayco_ref || "—"}</td>
                  <td className="px-5 py-3 text-[#8b949e] max-w-[200px] truncate">{p.description || "—"}</td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[#8b949e]">
                    No se encontraron pagos
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
