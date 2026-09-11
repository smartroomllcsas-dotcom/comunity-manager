"use client";
/**
 * Control del seguimiento automático de un contacto: detenerlo cuando ya lo
 * atiende un asesor, o marcarlo "no contactar" si el cliente lo pidió.
 * Se usa en la pestaña Notas del chat y en la ficha del contacto.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Ban, Loader2 } from "lucide-react";

type State = "active" | "stopped" | "do_not_contact";
type Status = {
  state: State;
  stage: string | null;
  attemptsDone: number;
  attemptsTotal: number;
  followupEnabled: boolean;
  lastAttemptAt: string | null;
  hasMeeting: boolean;
  reason: string | null;
};

export function FollowupControl({ contactId, compact }: { contactId: string; compact?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/followup`, { cache: "no-store" });
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      // sin estado, el bloque no se muestra
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "stop" | "resume" | "do_not_contact" | "allow_contact") {
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/followup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo aplicar");
      toast.success(
        action === "stop"
          ? "Listo: no recibirá más mensajes de seguimiento automático"
          : action === "do_not_contact"
            ? "Marcado como «no contactar»"
            : action === "resume"
              ? "Seguimiento automático reanudado"
              : "Se permite contactarlo de nuevo"
      );
      setNote("");
      setShowNote(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  const title = compact ? null : (
    <h3 className="mb-2 text-sm font-semibold text-white">Seguimiento automático</h3>
  );

  const box = "rounded-lg border px-3 py-2.5 text-sm";
  const btn =
    "inline-flex items-center gap-1.5 rounded-md border border-[#2d333b] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#21262d] disabled:opacity-50";

  if (status.state === "do_not_contact") {
    return (
      <div>
        {title}
        <div className={`${box} border-red-500/30 bg-red-500/10`}>
        <div className="flex items-center gap-2 text-red-200">
          <Ban className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            No contactar. No recibe seguimiento, difusiones ni plantillas.
            {status.reason ? <span className="block text-[11px] text-red-300/80">{status.reason}</span> : null}
          </span>
          <button disabled={busy} onClick={() => act("allow_contact")} className={btn}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Permitir de nuevo
          </button>
          </div>
        </div>
      </div>
    );
  }

  if (status.state === "stopped") {
    return (
      <div>
        {title}
        <div className={`${box} border-amber-500/30 bg-amber-500/10`}>
        <div className="flex items-center gap-2 text-amber-100">
          <BellOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Seguimiento automático detenido. Este cliente lo atiendes tú.
            {status.reason ? <span className="block text-[11px] text-amber-200/80">{status.reason}</span> : null}
          </span>
          <button disabled={busy} onClick={() => act("resume")} className={btn}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />} Reanudar
          </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {title}
      <div className={`${box} border-[#2d333b] bg-[#0d1117]`}>
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="h-4 w-4 shrink-0 text-[#8b949e]" />
        <span className="flex-1 min-w-[180px] text-[#8b949e]">
          {status.hasMeeting
            ? "Tiene reunión agendada: no recibe seguimiento automático."
            : !status.followupEnabled
              ? "El seguimiento automático está apagado para esta empresa."
              : status.attemptsTotal > 0
                ? `Seguimiento automático activo: ${status.attemptsDone} de ${status.attemptsTotal} intentos enviados.`
                : "Seguimiento automático activo."}
        </span>
        {!showNote ? (
          <>
            <button disabled={busy} onClick={() => setShowNote(true)} className={btn}>
              <BellOff className="h-3.5 w-3.5" /> Detener seguimiento
            </button>
            <button
              disabled={busy}
              onClick={() => act("do_not_contact")}
              className={`${btn} border-red-500/40 text-red-300 hover:bg-red-500/10`}
            >
              <Ban className="h-3.5 w-3.5" /> No contactar
            </button>
          </>
        ) : null}
      </div>
      {showNote && (
        <div className="mt-2 space-y-2">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="¿Por qué? Ej: lo atendí por llamada (opcional)"
            className="w-full rounded-md border border-[#2d333b] bg-[#161b22] px-3 py-1.5 text-sm text-white"
          />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => act("stop")} className={`${btn} border-amber-500/40 text-amber-200`}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />} Confirmar
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setShowNote(false);
                setNote("");
              }}
              className={btn}
            >
              Cancelar
            </button>
          </div>
          <p className="text-[11px] text-[#6e7681]">
            Queda una nota en el chat y el cliente no vuelve a recibir mensajes automáticos de seguimiento. Puedes reanudarlo cuando quieras.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
