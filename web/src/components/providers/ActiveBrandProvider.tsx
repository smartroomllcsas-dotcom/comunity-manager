"use client";

/**
 * ActiveBrandProvider — contexto global de la empresa activa en el panel.
 *
 * Resolución del `activeClientId` (en este orden):
 *   1. Query param `?clientId=` (si la ruta lo respeta — permite deep-link)
 *   2. Cookie `cm_active_brand_id` (persistencia entre navegaciones)
 *   3. Primera marca del listado (fallback)
 *
 * setActiveClientId() escribe la cookie SIEMPRE. Opcionalmente sincroniza
 * la URL (`syncUrl: true`) para las rutas que trabajan con `?clientId=` en
 * query (WA templates hoy). Las páginas nuevas pueden solo usar el hook.
 *
 * IMPORTANTE: la cookie `cm_active_brand_id` es SEPARADA de `cm_user_id`
 * (auth local MySQL) — NO colisiona con nada existente.
 *
 * NO se hace fetch de `/api/cm/clients` en SSR: es client-only para que
 * las páginas RSC actuales sigan funcionando sin cambios. El primer render
 * muestra "Cargando…" en el switcher; en un tick ya está.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface ActiveBrandClient {
  id: string;
  name: string;
  industry?: string | null;
  platforms?: string[] | null;
  status?: string | null;
}

interface ActiveBrandContextValue {
  clients: ActiveBrandClient[];
  activeClientId: string | null;
  activeClient: ActiveBrandClient | null;
  setActiveClientId: (id: string | null, opts?: { syncUrl?: boolean }) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

const COOKIE_NAME = "cm_active_brand_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 días

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string | null) {
  if (typeof document === "undefined") return;
  if (value === null) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function ActiveBrandProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ActiveBrandClient[]>([]);
  const [activeClientId, setActiveClientIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cm/clients", { credentials: "same-origin" });
      if (!res.ok) {
        // 401 (sin sesión) o 501 (mysql local): estado limpio sin ruido
        setClients([]);
        setError(res.status === 401 ? "No autenticado" : null);
        return;
      }
      const data = (await res.json()) as { clients?: ActiveBrandClient[] };
      setClients(Array.isArray(data.clients) ? data.clients : []);
      setError(null);
    } catch (err) {
      console.error("[ActiveBrandProvider] refresh error", err);
      setClients([]);
      setError("No se pudieron cargar las marcas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Effect A · resolver: computa el próximo activeClientId con setter funcional
  // (activeClientId NO va en deps para evitar re-triggers en cadena).
  // Prio: URL > cookie > primera. Si el actual sigue siendo válido, respeta.
  useEffect(() => {
    if (clients.length === 0) {
      setActiveClientIdState(null);
      return;
    }
    setActiveClientIdState((prev) => {
      const urlId = searchParams.get("clientId");
      if (urlId && clients.some((c) => c.id === urlId)) return urlId;
      if (prev && clients.some((c) => c.id === prev)) return prev;
      const cookieId = readCookie(COOKIE_NAME);
      if (cookieId && clients.some((c) => c.id === cookieId)) return cookieId;
      return clients[0].id;
    });
  }, [clients, searchParams]);

  // Effect B · persist: escribir cookie cuando cambia activeClientId (side effect
  // aislado del resolver — evita loops y mantiene la cookie autoritativa).
  useEffect(() => {
    if (activeClientId) writeCookie(COOKIE_NAME, activeClientId);
  }, [activeClientId]);

  const setActiveClientId = useCallback(
    (id: string | null, opts?: { syncUrl?: boolean }) => {
      setActiveClientIdState(id);
      writeCookie(COOKIE_NAME, id);
      if (opts?.syncUrl && id) {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        params.set("clientId", id);
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    },
    [router, searchParams]
  );

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? null,
    [clients, activeClientId]
  );

  const value = useMemo<ActiveBrandContextValue>(
    () => ({
      clients,
      activeClientId,
      activeClient,
      setActiveClientId,
      loading,
      error,
      refresh,
    }),
    [clients, activeClientId, activeClient, setActiveClientId, loading, error, refresh]
  );

  return <ActiveBrandContext.Provider value={value}>{children}</ActiveBrandContext.Provider>;
}

export function useActiveBrand() {
  const ctx = useContext(ActiveBrandContext);
  if (!ctx) {
    throw new Error("useActiveBrand debe usarse dentro de <ActiveBrandProvider>");
  }
  return ctx;
}
