"use client";
import { Building2 } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";

/** Selector de empresa para las vistas de Difusiones (misma empresa activa que el resto del CRM). */
export function BrandPicker() {
  const { clients, activeClientId, setActiveClientId, loading } = useActiveBrand();
  return (
    <label className="flex items-center gap-2 rounded-md border border-[#2d333b] bg-[#0d1117] px-2.5 py-1.5 text-xs text-[#8b949e]">
      <Building2 className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Empresa</span>
      <select
        value={activeClientId ?? ""}
        disabled={loading}
        onChange={(e) => setActiveClientId(e.target.value || null)}
        className="bg-transparent text-sm text-white outline-none"
      >
        {!activeClientId && <option value="">Selecciona…</option>}
        {clients.map((c) => (
          <option key={c.id} value={c.id} className="bg-[#0d1117]">{c.name}</option>
        ))}
      </select>
    </label>
  );
}
