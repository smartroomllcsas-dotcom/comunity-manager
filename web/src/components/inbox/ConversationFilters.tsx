"use client";
import { useInboxStore } from "@/stores/inbox";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useInboxBrands } from "@/hooks/useInboxBrands";
import { brandFilterOptions } from "@/lib/inbox/brand-display";

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
  const brandFilter = useInboxStore((s) => s.brandFilter);
  const setBrandFilter = useInboxStore((s) => s.setBrandFilter);
  const { data: brands } = useInboxBrands();
  // El selector sólo lista lo que el backend devolvió como accesible; no se
  // construyen opciones en el cliente.
  const brandOptions = brandFilterOptions(brands);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-white/[0.06] p-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 icon-sm text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder="Buscar contacto..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-8 max-sm:min-h-[var(--touch-target)] pl-8 pr-3 rounded-md bg-[var(--inbox-canvas)] border border-white/[0.08] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-colors duration-[var(--duration-fast)] hover:border-white/10 focus:outline-none focus:border-[var(--accent-border)] focus:ring-1 focus:ring-[var(--accent-soft)]"
        />
      </div>

      {/* Filtro «Marca».
          Es presentación: acotar la vista. La autorización real la aplica el
          backend, que responde 403 si el brandId no pertenece al usuario. */}
      <div className="flex items-center gap-1.5">
        <label htmlFor="inbox-brand-filter" className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] shrink-0">
          Marca
        </label>
        <select
          id="inbox-brand-filter"
          data-testid="brand-filter"
          aria-label="Filtrar por marca"
          value={brandFilter}
          onChange={(event) => setBrandFilter(event.target.value)}
          className="min-w-0 flex-1 h-7 max-sm:min-h-[var(--touch-target)] rounded-md border border-white/[0.08] bg-[var(--inbox-canvas)] px-2 text-[11px] text-[var(--text-primary)] transition-colors duration-[var(--duration-fast)] hover:border-white/10 focus:border-[var(--accent-border)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-soft)] disabled:opacity-40"
        >
          <option value="all">
            {brandOptions.length > 0 ? "Todas las marcas" : "Sin marcas asignadas"}
          </option>
          {brandOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-[var(--inbox-canvas)] p-0.5">
        {statusFilters.map((sf) => (
          <button
            key={sf.value}
            onClick={() => setStatusFilter(sf.value)}
            className={cn(
              "flex-1 text-[11px] font-medium py-1 max-sm:min-h-[var(--touch-target)] rounded transition-[background-color,color] duration-[var(--duration-fast)] ease-[var(--easing-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-inset active:scale-[0.98]",
              statusFilter === sf.value
                ? "bg-[var(--inbox-raised)] text-[var(--accent-text)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--inbox-hover)]"
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
              "text-[11px] font-medium px-2 py-0.5 max-sm:min-h-[var(--touch-target)] rounded-full border transition-[background-color,color,border-color] duration-[var(--duration-fast)] ease-[var(--easing-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:scale-[0.98]",
              filter === f.value
                ? "bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent-border)]"
                : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--inbox-hover)]"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
