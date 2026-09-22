"use client";
/**
 * Pausar o reactivar una campaña desde el CRM.
 *
 * Pide confirmación SIEMPRE, y la confirmación dice lo que está en juego —lo
 * gastado y los leads que trajo—, porque "¿seguro?" a secas no ayuda a decidir.
 * Lo que se pausa deja de gastar de inmediato; lo que se reactiva puede no
 * arrancar, y en ese caso Meta explica por qué.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Loader2, AlertTriangle } from "lucide-react";

type Props = {
  clientId: string;
  campaignId: string;
  campaignName: string;
  /** Estado efectivo que informa Meta. */
  status?: string | null;
  spend?: number | null;
  leads?: number | null;
  onDone?: () => void;
};

const money = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function CampaignStatusButton({
  clientId,
  campaignId,
  campaignName,
  status,
  spend,
  leads,
  onDone,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const activa = String(status || "").toUpperCase() === "ACTIVE";
  const accion: "PAUSED" | "ACTIVE" = activa ? "PAUSED" : "ACTIVE";

  async function aplicar() {
    setBusy(true);
    try {
      const res = await fetch(`/api/meta/campaigns/${campaignId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, status: accion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar el estado");
      // Se muestra lo que respondió META, no lo que pedimos: es la diferencia
      // entre "se envió" y "quedó hecho".
      const META_ESTADO: Record<string, string> = {
        ACTIVE: "activa",
        PAUSED: "en pausa",
        CAMPAIGN_PAUSED: "en pausa",
        ADSET_PAUSED: "en pausa (el conjunto)",
        WITH_ISSUES: "con problemas",
        ARCHIVED: "archivada",
        DELETED: "eliminada",
        IN_PROCESS: "procesándose",
      };
      const comoQuedo = META_ESTADO[String(data.status || "").toUpperCase()] || data.status;
      toast.success(`Meta la dejó ${comoQuedo}`, {
        description: `${campaignName} · confirmado por Meta, no sólo guardado aquí`,
      });
      if (data.aviso) toast.warning(data.aviso, { duration: 8000 });
      setConfirming(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left">
        <p className="flex items-start gap-2 text-[11px] text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {accion === "PAUSED" ? "Vas a pausar" : "Vas a reactivar"} <strong>{campaignName}</strong>
            {typeof spend === "number" && spend > 0 && (
              <span className="block text-amber-200/80">
                Lleva {money(spend)} gastados
                {typeof leads === "number" && leads > 0 ? ` y ${leads} leads` : " y ningún lead"} en el periodo que
                estás viendo.
              </span>
            )}
            {accion === "PAUSED" ? (
              <span className="block text-amber-200/80">Deja de gastar de inmediato. Se puede reactivar después.</span>
            ) : (
              <span className="block text-amber-200/80">Volverá a gastar en cuanto Meta la apruebe.</span>
            )}
          </span>
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void aplicar()}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              accion === "PAUSED"
                ? "bg-amber-500/25 text-amber-100 hover:bg-amber-500/35"
                : "bg-green-500/25 text-green-100 hover:bg-green-500/35"
            }`}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : accion === "PAUSED" ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Sí, {accion === "PAUSED" ? "pausar" : "reactivar"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="rounded-md border border-[#30363d] px-3 py-1.5 text-xs text-[#8b949e] hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
        activa
          ? "border-amber-500/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
          : "border-green-500/35 bg-green-500/10 text-green-200 hover:bg-green-500/20"
      }`}
    >
      {activa ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      {activa ? "Pausar" : "Reactivar"}
    </button>
  );
}
