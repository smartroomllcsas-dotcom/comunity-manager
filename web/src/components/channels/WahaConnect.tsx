"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  brandId: string;
  onConnected?: (channelId: string) => void;
}

type Status = "IDLE" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED" | "STOPPED";

export default function WahaConnect({ brandId, onConnected }: Props) {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("IDLE");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentQrUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (qrRef.current) { clearInterval(qrRef.current); qrRef.current = null; }
    if (currentQrUrlRef.current) {
      URL.revokeObjectURL(currentQrUrlRef.current);
      currentQrUrlRef.current = null;
    }
    setQrUrl(null);
  }, []);

  const refreshQr = useCallback(async (id: string) => {
    const res = await fetch(`/api/channels/waha/${id}/qr`, { cache: "no-store" });
    if (res.status === 409) return; // WORKING
    if (!res.ok) { setError(`QR fetch failed: ${res.status}`); return; }
    const blob = await res.blob();
    const nextUrl = URL.createObjectURL(blob);
    if (currentQrUrlRef.current) URL.revokeObjectURL(currentQrUrlRef.current);
    currentQrUrlRef.current = nextUrl;
    setQrUrl(nextUrl);
  }, []);

  const pollStatus = useCallback(async (id: string) => {
    const res = await fetch(`/api/channels/waha/${id}/status`, { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setStatus(j.status as Status);
    if (j.status === "WORKING") {
      cleanup();
      onConnected?.(id);
      setOpen(false);
    }
    if (j.status === "FAILED" || j.status === "STOPPED") {
      setError(j.last_error ?? `Sesion termino en ${j.status}`);
    }
  }, [cleanup, onConnected]);

  const start = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/channels/waha/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? `HTTP ${res.status}`);
      return;
    }
    const j = await res.json();
    setChannelId(j.channelId);
    setStatus(j.status as Status);
    await refreshQr(j.channelId);
    qrRef.current = setInterval(() => refreshQr(j.channelId), 25_000);
    pollRef.current = setInterval(() => pollStatus(j.channelId), 3_000);
  }, [brandId, refreshQr, pollStatus]);

  useEffect(() => () => cleanup(), [cleanup]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void start(); }}
        className="rounded bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700"
      >
        Conectar WhatsApp (Beta)
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Conectar WhatsApp — canal beta</h3>
            <p className="mt-2 text-sm text-amber-700">
              Canal no oficial. Usa la Web de WhatsApp bajo tu propio riesgo.
              El numero puede ser suspendido por Meta si se detecta uso automatizado agresivo.
            </p>
            <div className="mt-4 flex items-center justify-center">
              {qrUrl ? (
                <img src={qrUrl} alt="QR code" className="h-64 w-64" />
              ) : (
                <div className="text-sm text-gray-500">
                  {status === "IDLE" ? "Iniciando sesion..." : `Estado: ${status}`}
                </div>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-between">
              <button
                type="button"
                className="text-sm text-gray-500 hover:underline"
                onClick={() => { cleanup(); setOpen(false); }}
              >
                Cancelar
              </button>
              <span className="text-xs text-gray-400">Estado: {status}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
