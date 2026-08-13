"use client";
/**
 * «Selecciona el canal para esta marca».
 *
 * Aparece cuando Meta devuelve más de una página administrada. Antes esa
 * decisión la tomaba el código con `pages[0]`, que es el orden que decide Meta
 * y no tiene relación con lo que el usuario eligió en el diálogo.
 *
 * La pantalla nunca recibe tokens: `/api/auth/meta/select-page` devuelve
 * únicamente nombre, id parcial y —en el flujo de Instagram— la cuenta
 * asociada. El id completo tampoco se muestra: basta el sufijo para distinguir
 * páginas con el mismo nombre.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, AtSign, Building2, CheckCircle2, Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

interface Candidate {
  id: string;
  name: string;
  idHint: string;
  instagramId?: string | null;
  instagramUsername?: string | null;
  disabled: boolean;
  disabledReason: string | null;
  connectedToBrand: string | null;
}

interface SelectionPayload {
  id: string;
  flow: "facebook" | "facebook_instagram_ads";
  brand: { id: string; name: string | null };
  candidates: Candidate[];
}

function SelectChannelInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectionId = searchParams.get("selection") || "";

  const [selection, setSelection] = useState<SelectionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectionId) {
        setError("Falta el identificador de la selección.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(
          `/api/auth/meta/select-page?selection=${encodeURIComponent(selectionId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(payload?.error || "No fue posible cargar las páginas disponibles.");
          return;
        }
        setSelection(payload.selection as SelectionPayload);
      } catch {
        if (!cancelled) setError("No fue posible contactar el servidor.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectionId]);

  async function confirm() {
    if (!chosen || !selection) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/meta/select-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: selection.id, pageId: chosen }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "No fue posible conectar la página seleccionada.");
        return;
      }
      // Al volver a /clients, la tarjeta de la marca destino se recarga con su
      // conexión nueva. Ninguna otra marca cambia.
      router.push(payload.redirectTo || "/clients");
    } catch {
      setError("No fue posible contactar el servidor.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-slate-400" data-testid="select-loading">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Cargando páginas disponibles...</span>
        </div>
      </div>
    );
  }

  if (!selection) {
    return (
      <div className="p-6">
        <div
          data-testid="select-error"
          className="max-w-xl rounded-lg border border-red-500/30 bg-red-500/10 p-5"
        >
          <div className="flex items-center gap-2 text-red-300">
            <AlertCircle className="h-5 w-5" />
            <h1 className="text-sm font-semibold">No fue posible continuar</h1>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {error || "La selección expiró o ya se utilizó. Vuelve a iniciar la conexión."}
          </p>
          <Link
            href="/clients"
            className="mt-4 inline-flex text-xs font-medium text-violet-300 hover:text-violet-200"
          >
            Volver a marcas
          </Link>
        </div>
      </div>
    );
  }

  const isInstagramFlow = selection.flow !== "facebook";

  return (
    <div className="p-6" data-testid="select-channel-page">
      <div className="max-w-2xl">
        <h1 className="text-xl font-bold text-slate-100">Selecciona el canal para esta marca</h1>

        {/* La marca destino, siempre visible: es la pregunta que el usuario
            necesita tener presente mientras elige. */}
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
          <Building2 className="h-4 w-4 text-violet-300 shrink-0" />
          <p className="text-xs text-violet-200" data-testid="select-target-brand">
            Se conectará a la marca{" "}
            <span className="font-semibold">{selection.brand.name || "sin nombre"}</span>
          </p>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Meta devolvió varias páginas administradas. Elige cuál corresponde a esta marca;
          las demás quedan disponibles para otras.
        </p>

        {error && (
          <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {selection.candidates.map((candidate) => {
            const selected = chosen === candidate.id;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  data-testid="select-candidate"
                  data-page-id={candidate.id}
                  disabled={candidate.disabled}
                  aria-pressed={selected}
                  onClick={() => setChosen(candidate.id)}
                  className={[
                    "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    candidate.disabled
                      ? "cursor-not-allowed border-slate-800 bg-slate-900/60 opacity-60"
                      : selected
                        ? "border-violet-500 bg-violet-500/10"
                        : "border-slate-800 bg-slate-900 hover:border-slate-700",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {candidate.name}
                      </p>
                      {/* Sólo el sufijo del id: suficiente para desambiguar dos
                          páginas homónimas sin publicar el identificador. */}
                      <p className="mt-0.5 text-[11px] text-slate-500">ID {candidate.idHint}</p>

                      {isInstagramFlow && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-pink-300">
                          <AtSign className="h-3 w-3" />
                          {candidate.instagramUsername
                            ? `@${candidate.instagramUsername}`
                            : "Sin cuenta de Instagram asociada"}
                        </p>
                      )}

                      {candidate.disabled && (
                        <p className="mt-1 text-[11px] text-amber-300" data-testid="candidate-blocked">
                          {candidate.disabledReason ||
                            `Ya está conectada a ${candidate.connectedToBrand || "otra marca"}.`}
                        </p>
                      )}
                    </div>
                    {selected && !candidate.disabled && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-300" />
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            data-testid="select-confirm"
            onClick={() => void confirm()}
            disabled={!chosen || saving}
            className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            {saving ? "Conectando..." : "Conectar a esta marca"}
          </button>
          <Link
            href="/clients"
            className="rounded-md px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SelectChannelPage() {
  return (
    <Suspense fallback={null}>
      <SelectChannelInner />
    </Suspense>
  );
}
