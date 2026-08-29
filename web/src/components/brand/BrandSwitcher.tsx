"use client";

/**
 * BrandSwitcher — selector global de empresa activa en el panel.
 *
 * Reemplaza el stub hardcoded "Bliss Glamping" del OsSidebar. Reutiliza las
 * clases CSS existentes (.brand-switcher, .brand-switcher-label, .brand-chip,
 * .brand-chip-dot) para no cambiar el estilo del sidebar.
 *
 * Dropdown propio (no shadcn command/dropdown-menu) para no traer deps y
 * mantener bundle limpio. Búsqueda visible solo si hay >6 marcas.
 *
 * Al elegir marca: escribe cookie via useActiveBrand + emite toast + cierra
 * dropdown. NO forzamos syncUrl aquí — las páginas que usan `?clientId=`
 * en query lo respetan por su cuenta desde el context.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useActiveBrand } from "@/hooks/useActiveBrand";

export function BrandSwitcher() {
  const { clients, activeClient, activeClientId, setActiveClientId, loading, error } = useActiveBrand();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Cerrar al clic fuera + Escape
  useEffect(() => {
    if (!open) return;
    function handlePointer(ev: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
    }
    function handleKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Estados: loading inicial
  if (loading && clients.length === 0) {
    return (
      <div className="brand-switcher">
        <div className="brand-switcher-label">Marca activa</div>
        <div className="brand-chip" aria-busy="true">
          <div className="brand-chip-dot" />
          <span>Cargando…</span>
        </div>
      </div>
    );
  }

  // Sin marcas visibles
  if (!loading && clients.length === 0) {
    return (
      <div className="brand-switcher">
        <div className="brand-switcher-label">Sin marcas</div>
        <div className="brand-chip" title={error ?? "El usuario no tiene marcas asignadas"}>
          <div className="brand-chip-dot" />
          <span>{error ?? "Sin acceso"}</span>
        </div>
      </div>
    );
  }

  const filtered = query.trim()
    ? clients.filter((c) => (c.name ?? "").toLowerCase().includes(query.trim().toLowerCase()))
    : clients;

  function pick(id: string) {
    const name = clients.find((c) => c.id === id)?.name ?? id.slice(0, 8);
    // Si la URL actual ya tiene ?clientId=, hay que sincronizarla en la misma
    // acción — de lo contrario el resolver del provider (prio URL) pisaría
    // la elección manual del usuario en el siguiente tick.
    const shouldSyncUrl =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("clientId");
    setActiveClientId(id, { syncUrl: shouldSyncUrl });
    setOpen(false);
    setQuery("");
    toast.success(`Marca activa: ${name}`);
  }

  return (
    <div ref={rootRef} className="brand-switcher" style={{ position: "relative" }}>
      <div className="brand-switcher-label">Marca activa</div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="brand-chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ width: "100%", cursor: "pointer", background: "transparent", border: 0, padding: 0, textAlign: "left" }}
      >
        <div className="brand-chip-dot" />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeClient?.name ?? "Seleccionar…"}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ width: 12, height: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(100% + 6px)",
            zIndex: 50,
            borderRadius: 8,
            border: "1px solid #2d333b",
            background: "#161b22",
            boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
            overflow: "hidden",
          }}
        >
          {clients.length > 6 && (
            <div style={{ padding: 8, borderBottom: "1px solid #2d333b" }}>
              <input
                autoFocus
                type="text"
                placeholder="Buscar empresa…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: "100%",
                  background: "#0d1117",
                  border: "1px solid #2d333b",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 13,
                  color: "#c9d1d9",
                  outline: "none",
                }}
              />
            </div>
          )}
          <div style={{ maxHeight: 288, overflowY: "auto", padding: "4px 0" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 12, color: "#8b949e" }}>Sin resultados</div>
            )}
            {filtered.map((c) => {
              const active = c.id === activeClientId;
              const dotColor = c.status === "paused" ? "#f59e0b" : c.status === "active" ? "#22c55e" : "#64748b";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  role="option"
                  aria-selected={active}
                  style={{
                    display: "flex",
                    width: "100%",
                    padding: "8px 12px",
                    alignItems: "center",
                    gap: 8,
                    border: 0,
                    background: active ? "#1c2128" : "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "#c9d1d9",
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = active ? "#1c2128" : "#1c2128"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = active ? "#1c2128" : "transparent"; }}
                >
                  <span
                    style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flex: "0 0 auto" }}
                    aria-hidden
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name}
                    </span>
                    {c.industry && (
                      <span style={{ display: "block", fontSize: 11, color: "#8b949e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.industry}
                      </span>
                    )}
                  </span>
                  {active && (
                    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
