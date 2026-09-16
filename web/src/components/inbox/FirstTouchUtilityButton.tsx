"use client";
/**
 * Reenviar a mano el primer contacto con la plantilla Utility de la empresa.
 *
 * Desde el 16 de septiembre el reintento ocurre solo cuando Meta bloquea la
 * plantilla de marketing. Este botón sirve para los leads que fallaron ANTES de
 * ese cambio, y para mandarla a mano cuando el asesor lo vea necesario.
 *
 * Se pinta de dos maneras a propósito: en ámbar y explicado cuando el primer
 * contacto falló (ahí hay algo que arreglar), y como una línea discreta cuando
 * sí llegó — mandarle otra plantilla a quien ya la recibió casi nunca es lo que
 * se quiere, pero tiene que poder hacerse.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, SendHorizonal, AlertTriangle } from "lucide-react";

type State = {
  available: boolean;
  reason?: string;
  templateName?: string;
  templateStatus?: string | null;
  failed: boolean;
  firstTouch: string | null;
};

export function FirstTouchUtilityButton({ contactId }: { contactId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/first-touch-utility`, { cache: "no-store" });
      if (!res.ok) return;
      setState(await res.json());
    } catch {
      /* la ficha funciona igual sin este bloque */
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  async function send() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/first-touch-utility`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar");
      toast.success(data.detail || "Enviado");
      setSent(true);
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-xs text-green-200">
        Primer contacto enviado con la plantilla Utility. Queda la nota en el chat.
      </div>
    );
  }

  // Al lead SÍ le llegó el primer contacto: nada que arreglar, pero se deja la
  // opción a mano por si el asesor la necesita.
  if (!state.failed) {
    if (!state.available) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6e7681]">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[#8b949e] underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <SendHorizonal className="h-3 w-3" />}
          Enviar plantilla Utility «{state.templateName}»
        </button>
        <span>
          {state.firstTouch === "enviado"
            ? "A este lead ya le llegó el primer contacto."
            : `Primer contacto: ${state.firstTouch}.`}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <p className="flex items-start gap-2 text-xs text-amber-200">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          A este lead no le llegó el primer contacto.
          {state.firstTouch && <span className="block text-[11px] text-amber-300/80">{state.firstTouch}</span>}
        </span>
      </p>

      {state.available ? (
        <>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}
            Enviar con plantilla Utility
          </button>
          <p className="text-[11px] text-[#8b949e]">
            Usará «{state.templateName}». Meta entrega las Utility aunque haya limitado las de marketing.
          </p>
        </>
      ) : (
        <p className="text-[11px] text-[#8b949e]">{state.reason}</p>
      )}
    </div>
  );
}
