"use client";
import { useState } from "react";
import { useBroadcasts } from "@/hooks/useBroadcasts";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Radio, Search, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const dynamic = "force-dynamic";

const statusConfig: Record<string, { label: string; dotColor: string; badgeBg: string; badgeText: string }> = {
  draft: { label: "Borrador", dotColor: "bg-yellow-400", badgeBg: "bg-yellow-500/20", badgeText: "text-yellow-400" },
  scheduled: { label: "Programada", dotColor: "bg-blue-400", badgeBg: "bg-blue-500/20", badgeText: "text-blue-400" },
  sending: { label: "En curso", dotColor: "bg-green-400", badgeBg: "bg-green-500/20", badgeText: "text-green-400" },
  completed: { label: "Completada", dotColor: "bg-green-400", badgeBg: "bg-green-500/20", badgeText: "text-green-400" },
  failed: { label: "Fallida", dotColor: "bg-red-400", badgeBg: "bg-red-500/20", badgeText: "text-red-400" },
};

const sidebarFilters = [
  { id: "all", label: "Todos", dotColor: "" },
  { id: "draft", label: "Borrador", dotColor: "bg-yellow-400" },
  { id: "scheduled", label: "Programada", dotColor: "bg-blue-400" },
  { id: "sending", label: "En curso", dotColor: "bg-green-400" },
  { id: "completed", label: "Completada", dotColor: "bg-green-400" },
  { id: "failed", label: "Fallida", dotColor: "bg-red-400" },
];

export default function BroadcastsPage() {
  const { data: broadcasts, isLoading } = useBroadcasts();
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = broadcasts?.filter((b) => {
    if (activeFilter !== "all" && b.status !== activeFilter) return false;
    if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = broadcasts?.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || { all: 0 };

  return (
    <div className="flex h-full bg-[#0d1117]">
      {/* Left Sidebar */}
      <div className="w-[220px] border-r border-[#2d333b] bg-[#161b22] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#2d333b]">
          <h2 className="text-sm font-semibold text-white">Difusiones</h2>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sidebarFilters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                activeFilter === filter.id
                  ? "bg-[#1a1f2e] text-white"
                  : "text-[#8b949e] hover:bg-[#1a1f2e]/50 hover:text-white"
              }`}
            >
              {filter.dotColor ? (
                <span className={`h-2 w-2 rounded-full ${filter.dotColor} shrink-0`} />
              ) : (
                <Radio className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1 text-left">{filter.label}</span>
              <span className="text-xs text-[#8b949e]">{counts[filter.id] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2d333b] bg-[#161b22]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b949e]" />
            <Input
              placeholder="Buscar difusiones..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] focus:border-blue-500 h-9"
            />
          </div>
          <div className="flex-1" />
          <Link href="/broadcasts/new">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-1.5" />
              Añadir difusión
            </Button>
          </Link>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-2 text-[#8b949e]">
                <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>Cargando...</span>
              </div>
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="h-20 w-20 rounded-full bg-[#1a1f2e] border border-[#2d333b] flex items-center justify-center">
                  <Radio className="h-10 w-10 text-[#2d333b]" />
                </div>
                <div>
                  <p className="font-medium text-white mb-1">No hay difusiones</p>
                  <p className="text-sm text-[#8b949e]">Crea tu primera difusion para enviar mensajes masivos</p>
                </div>
                <Link href="/broadcasts/new">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Crear difusion
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#161b22] border-b border-[#2d333b]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Template</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Enviados</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Entregados</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Leidos</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Fallidos</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((broadcast) => {
                  const sc = statusConfig[broadcast.status] || statusConfig.draft;
                  return (
                    <tr key={broadcast.id} className="border-b border-[#2d333b]/50 hover:bg-[#161b22] transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-white">{broadcast.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${sc.badgeBg} ${sc.badgeText}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dotColor}`} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8b949e]">
                        {broadcast.template?.name || "---"}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-400 font-medium">
                        {broadcast.sent_count || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-400 font-medium">
                        {broadcast.delivered_count || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-purple-400 font-medium">
                        {broadcast.read_count || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-400 font-medium">
                        {broadcast.failed_count || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8b949e]">
                        {format(new Date(broadcast.created_at), "dd MMM yyyy", { locale: es })}
                      </td>
                      <td className="px-4 py-3">
                        <button className="p-1 rounded hover:bg-[#1a1f2e] text-[#8b949e] hover:text-white transition-colors">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {filtered && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2d333b] bg-[#161b22] text-sm text-[#8b949e]">
            <span>{filtered.length} difusiones</span>
          </div>
        )}
      </div>
    </div>
  );
}
