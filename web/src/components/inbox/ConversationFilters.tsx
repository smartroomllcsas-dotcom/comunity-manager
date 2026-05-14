"use client";
import { useInboxStore } from "@/stores/inbox";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

const ownerFilters = [
  { value: "all", label: "Todos" },
  { value: "mine", label: "Mios" },
  { value: "unassigned", label: "No asignados" },
] as const;

const statusFilters = [
  { value: "open", label: "Abiertos" },
  { value: "closed", label: "Cerrados" },
  { value: "pending", label: "En espera" },
  { value: "snoozed", label: "Snoozed" },
] as const;

export function ConversationFilters() {
  const filter = useInboxStore((s) => s.filter);
  const setFilter = useInboxStore((s) => s.setFilter);
  const searchQuery = useInboxStore((s) => s.searchQuery);
  const setSearchQuery = useInboxStore((s) => s.setSearchQuery);
  const statusFilter = useInboxStore((s) => s.statusFilter);
  const setStatusFilter = useInboxStore((s) => s.setStatusFilter);

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#484f58]" />
        <input
          type="text"
          placeholder="Buscar contacto..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-8 pl-8 pr-3 rounded-md bg-[#0d1117] border border-[#2d333b] text-sm text-white placeholder:text-[#484f58] focus:outline-none focus:border-[#388bfd] focus:ring-1 focus:ring-[#388bfd]/30 transition-colors"
        />
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-0.5 bg-[#0d1117] rounded-md p-0.5">
        {statusFilters.map((sf) => (
          <button
            key={sf.value}
            onClick={() => setStatusFilter(sf.value)}
            className={cn(
              "flex-1 text-[11px] font-medium py-1 rounded transition-colors",
              statusFilter === sf.value
                ? "bg-[#1a1f2e] text-[#58a6ff] shadow-sm"
                : "text-[#8b949e] hover:text-white"
            )}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Owner Filter Tabs */}
      <div className="flex items-center gap-1">
        {ownerFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value as typeof filter)}
            className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors",
              filter === f.value
                ? "bg-[#388bfd]/15 text-[#58a6ff] border border-[#388bfd]/30"
                : "text-[#8b949e] hover:text-white hover:bg-[#1a1f2e]"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
