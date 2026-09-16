"use client";
/**
 * Conexión de publicación y anuncios de UNA empresa.
 *
 * Va aparte de los canales de chat a propósito: su propio diálogo de Meta, su
 * propio token y su propia tabla. Si Meta rechaza un permiso de aquí, el chat
 * de Messenger e Instagram de todas las marcas sigue funcionando.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Loader2, Check, Unplug } from "lucide-react";

type AdAccount = { account_id: string; name: string; account_status?: number; business_name?: string | null };
type Connection = {
  ad_account_id: string | null;
  ad_account_name: string | null;
  available_accounts: AdAccount[];
  token_expires_at: string | null;
  connected: boolean;
  last_error: string | null;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : null;

export function AdsConnectionCard({ clientId }: { clientId: string }) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ads/connection?clientId=${clientId}`, { cache: "no-store" });
      if (res.ok) setConn((await res.json()).connection);
    } catch {
      /* la tarjeta funciona igual sin esto */
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  function connect() {
    window.location.href = `/api/auth/meta-ads?clientId=${clientId}`;
  }

  async function changeAccount(adAccountId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/ads/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, adAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar la cuenta");
      setConn(data.connection);
      toast.success(`Ahora usa «${data.connection.ad_account_name}»`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch(`/api/ads/connection?clientId=${clientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo desconectar");
      setConn(null);
      toast.success("Publicación y anuncios desconectados");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  if (!conn?.connected) {
    return (
      <button
        onClick={connect}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-600/20 px-3 py-2.5 text-xs font-medium text-violet-200 transition-colors hover:bg-violet-600/30"
      >
        <Megaphone className="h-4 w-4" />
        Conectar publicación y anuncios
      </button>
    );
  }

  const expires = fmt(conn.token_expires_at);

  return (
    <div className="mb-3 rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-violet-400" />
        <span className="text-[11px] font-medium text-violet-300">Publicación y anuncios conectados</span>
      </div>

      {conn.available_accounts.length > 1 ? (
        <select
          disabled={busy}
          value={conn.ad_account_id ?? ""}
          onChange={(e) => void changeAccount(e.target.value)}
          className="mt-2 w-full rounded-md border border-[#2d333b] bg-[#0d1117] px-2 py-1.5 text-[11px] text-white disabled:opacity-50"
        >
          {conn.available_accounts.map((a) => (
            <option key={a.account_id} value={a.account_id}>
              {a.name} · act_{a.account_id}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-[11px] text-violet-200">
          {conn.ad_account_name}
          <span className="block text-[10px] text-[#8b949e]">act_{conn.ad_account_id}</span>
        </p>
      )}

      <p className="mt-2 text-[10px] text-[#8b949e]">
        {expires ? `El permiso vence el ${expires}.` : "Permiso sin fecha de vencimiento."} Publicar en Facebook e
        Instagram y leer campañas.
      </p>
      {conn.last_error && <p className="mt-1 text-[10px] text-red-300">{conn.last_error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={connect}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-200 transition hover:bg-violet-500/20"
        >
          <Check className="h-3 w-3" /> Reconectar
        </button>
        <button
          onClick={() => void disconnect()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-[11px] text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
          Desconectar
        </button>
      </div>
    </div>
  );
}
