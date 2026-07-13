"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[inbox error boundary]", error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-300">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-white">Algo se rompió en la bandeja</h2>
        <p className="mt-1 text-sm text-[#8b949e]">
          {error.message || "Error inesperado. Reintenta o recarga la página."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[10px] text-[#484f58]">Referencia: {error.digest}</p>
        )}
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6366f1] transition-colors"
      >
        <RefreshCcw className="h-4 w-4" />
        Reintentar
      </button>
    </div>
  );
}
