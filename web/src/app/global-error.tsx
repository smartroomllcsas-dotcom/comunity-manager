"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0d1117", color: "#c9d1d9", fontFamily: "system-ui" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              background: "#161b22",
              border: "1px solid #2d333b",
              borderRadius: 12,
              padding: 32,
              maxWidth: 480,
              textAlign: "center",
            }}
          >
            <h1 style={{ fontSize: 20, marginTop: 0, color: "white" }}>Error crítico</h1>
            <p style={{ fontSize: 14, color: "#8b949e", marginBottom: 24 }}>
              La aplicación no puede continuar. Recarga la página o vuelve más tarde.
            </p>
            {error.digest && (
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#484f58",
                  marginBottom: 24,
                }}
              >
                Referencia: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                background: "#4f46e5",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
