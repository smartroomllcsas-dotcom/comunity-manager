'use client';

import { useEffect } from 'react';

export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[os-shell error boundary]', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        background: 'var(--os-paper, oklch(11% 0.005 250))',
        color: 'var(--os-ink, oklch(96% 0.005 250))',
        fontFamily: 'var(--os-font-body, Inter, system-ui, sans-serif)',
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          fontFamily: 'var(--os-font-display, "Space Grotesk", system-ui, sans-serif)',
        }}
      >
        Algo falló en esta sección
      </div>
      <div style={{ fontSize: 13, color: 'var(--os-ink-2, oklch(74% 0.01 250))', maxWidth: 420, textAlign: 'center' }}>
        El resto de la plataforma sigue funcionando. Puedes reintentar esta vista o volver al inicio.
        {error.digest ? ` (ref: ${error.digest})` : null}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid var(--os-line-2, oklch(30% 0.018 250))',
            background: 'var(--os-accent, oklch(70% 0.14 250))',
            color: 'oklch(15% 0.02 250)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
        <a
          href="/es/os"
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid var(--os-line, oklch(22% 0.012 250))',
            background: 'var(--os-paper-2, oklch(14% 0.008 250))',
            color: 'var(--os-ink-2, oklch(74% 0.01 250))',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
