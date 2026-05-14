"use client";
import { useState, useEffect } from "react";
import { useContacts } from "@/hooks/useContacts";
import { useSegments } from "@/hooks/useSegments";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentBuilder } from "@/components/contacts/SegmentBuilder";
import { ImportDialog } from "@/components/contacts/ImportDialog";
import { Search, Plus, Upload, Download, Users, Ban, Filter, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const lifecycleColors: Record<string, string> = {
  lead: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  customer: "bg-green-500/20 text-green-400 border-green-500/30",
  opportunity: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  churned: "bg-red-500/20 text-red-400 border-red-500/30",
};

const tagColors = [
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
];

const avatarColors = [
  "bg-blue-600", "bg-green-600", "bg-purple-600", "bg-orange-600",
  "bg-pink-600", "bg-cyan-600", "bg-red-600", "bg-yellow-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getTagColor(index: number) {
  return tagColors[index % tagColors.length];
}

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [activeSegment, setActiveSegment] = useState("all");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [segmentBuilderOpen, setSegmentBuilderOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: segments } = useSegments();

  // Reset to page 0 when search changes
  useEffect(() => {
    setPage(0);
  }, [search, activeSegment]);

  const { data: contactsData, isLoading } = useContacts({
    searchQuery: search,
    page,
    pageSize: PAGE_SIZE,
  });

  const contacts = contactsData?.contacts;
  const totalCount = contactsData?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount > 0 ? page * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, totalCount);

  function toggleContact(id: string) {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!contacts) return;
    if (selectedContacts.size === contacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (activeSegment !== "all" && activeSegment !== "blocked") {
        params.set("segment_id", activeSegment);
      }
      const res = await fetch(`/api/contacts/export?${params.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `contactos_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  }

  // Generate visible page numbers (max 5 around current page)
  function getPageNumbers(): number[] {
    const pages: number[] = [];
    let start = Math.max(0, page - 2);
    const end = Math.min(totalPages - 1, start + 4);
    start = Math.max(0, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  return (
    <div className="flex h-full bg-[#0d1117]">
      {/* Left Sidebar */}
      <div className="w-[220px] border-r border-[#2d333b] bg-[#161b22] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#2d333b]">
          <h2 className="text-sm font-semibold text-white">Contactos</h2>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {/* Built-in segments */}
          <button
            onClick={() => setActiveSegment("all")}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
              activeSegment === "all"
                ? "bg-[#1a1f2e] text-white"
                : "text-[#8b949e] hover:bg-[#1a1f2e]/50 hover:text-white"
            }`}
          >
            <Users className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left truncate">Todos los contactos</span>
            <span className="text-xs text-[#8b949e]">{totalCount}</span>
          </button>
          <button
            onClick={() => setActiveSegment("blocked")}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
              activeSegment === "blocked"
                ? "bg-[#1a1f2e] text-white"
                : "text-[#8b949e] hover:bg-[#1a1f2e]/50 hover:text-white"
            }`}
          >
            <Ban className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left truncate">Bloqueados</span>
            <span className="text-xs text-[#8b949e]">0</span>
          </button>

          {/* Custom segments from DB */}
          <div className="px-3 pt-4 pb-1">
            <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Segmentos</span>
          </div>
          {segments && segments.length > 0 ? (
            segments.map((seg) => (
              <button
                key={seg.id}
                onClick={() => setActiveSegment(seg.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  activeSegment === seg.id
                    ? "bg-[#1a1f2e] text-white"
                    : "text-[#8b949e] hover:bg-[#1a1f2e]/50 hover:text-white"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                <span className="flex-1 text-left truncate">{seg.name}</span>
                <span className="text-xs text-[#8b949e]">{seg.contact_count}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-[#8b949e]/60">Sin segmentos</p>
          )}
        </div>
        <div className="p-3 border-t border-[#2d333b]">
          <button
            onClick={() => setSegmentBuilderOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Crear segmento</span>
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2d333b] bg-[#161b22]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b949e]" />
            <Input
              placeholder="Buscar por nombre o numero..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] focus:border-blue-500 h-9"
            />
          </div>
          <Button variant="outline" size="sm" className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white">
            <Filter className="h-4 w-4 mr-1.5" />
            Filtros
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
            className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            Importar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Exportar
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Anadir contacto
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#161b22] border-b border-[#2d333b]">
                <th className="w-10 px-3 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={contacts?.length ? selectedContacts.size === contacts.length : false}
                    onChange={toggleAll}
                    className="rounded border-[#2d333b] bg-[#0d1117] text-blue-500"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Nombre</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Identificacion</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Ciclo de vida</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Correo electronico</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Telefono</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Etiquetas</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Asignado a</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Fecha de creacion</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-[#8b949e]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Cargando contactos...</span>
                    </div>
                  </td>
                </tr>
              ) : contacts?.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-[#8b949e]">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="h-12 w-12 text-[#2d333b]" />
                      <div>
                        <p className="font-medium text-white mb-1">No hay contactos</p>
                        <p className="text-sm">Anade tu primer contacto para comenzar</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                contacts?.map((contact) => {
                  const displayName = contact.name || "Sin nombre";
                  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                  const lifecycle = contact.custom_fields?.lifecycle;
                  const email = contact.custom_fields?.email;
                  const assignedTo = contact.custom_fields?.assigned_to;

                  return (
                    <tr
                      key={contact.id}
                      className="border-b border-[#2d333b]/50 hover:bg-[#161b22] transition-colors group"
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedContacts.has(contact.id)}
                          onChange={() => toggleContact(contact.id)}
                          className="rounded border-[#2d333b] bg-[#0d1117] text-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/contacts/${contact.id}`} className="flex items-center gap-2.5 group/name">
                          <div className={`h-8 w-8 rounded-full ${getAvatarColor(displayName)} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
                            {initials}
                          </div>
                          <span className="text-sm font-medium text-white group-hover/name:text-blue-400 transition-colors">
                            {displayName}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[#8b949e]">
                        {contact.wa_id || "---"}
                      </td>
                      <td className="px-3 py-2.5">
                        {lifecycle ? (
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${lifecycleColors[lifecycle] || "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
                            {lifecycle}
                          </span>
                        ) : (
                          <span className="text-[#8b949e] text-sm">---</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[#8b949e]">
                        {email || "---"}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[#8b949e]">
                        {contact.wa_id || "---"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {contact.tags?.length ? (
                            contact.tags.map((tag: string, idx: number) => (
                              <span
                                key={tag}
                                className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded border ${getTagColor(idx)}`}
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-[#8b949e] text-sm">---</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[#8b949e]">
                        {assignedTo || "---"}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[#8b949e]">
                        {contact.created_at
                          ? format(new Date(contact.created_at), "dd MMM yyyy", { locale: es })
                          : "---"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with Pagination */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2d333b] bg-[#161b22] text-sm text-[#8b949e]">
          <span>
            {selectedContacts.size > 0
              ? `${selectedContacts.size} seleccionados`
              : totalCount > 0
              ? `Mostrando ${rangeStart}-${rangeEnd} de ${totalCount} contactos`
              : `0 contactos`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs rounded-md bg-[#1a1f2e] border border-[#2d333b] text-white hover:bg-[#2d333b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              {getPageNumbers().map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    p === page
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-[#1a1f2e] border-[#2d333b] text-white hover:bg-[#2d333b]"
                  }`}
                >
                  {p + 1}
                </button>
              ))}
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs rounded-md bg-[#1a1f2e] border border-[#2d333b] text-white hover:bg-[#2d333b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <SegmentBuilder
        open={segmentBuilderOpen}
        onOpenChange={setSegmentBuilderOpen}
      />
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </div>
  );
}
