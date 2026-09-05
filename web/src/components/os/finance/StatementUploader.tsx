'use client';

/**
 * Drag-and-drop CSV uploader for bank / credit-card statements.
 * POSTs to /api/os/finance/upload; refreshes the route on success so the
 * KPI card / expense chart pick up the new rows.
 */
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'ok'; parsed: number; inserted: number; filename: string }
  | { kind: 'error'; message: string };

export function StatementUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setStatus({ kind: 'uploading' });
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch('/api/os/finance/upload', { method: 'POST', body: form });
        const body = await res.json();
        if (!res.ok || body.error) {
          setStatus({ kind: 'error', message: body.error ?? body.detail ?? `HTTP ${res.status}` });
          return;
        }
        setStatus({
          kind: 'ok',
          parsed: body.parsed ?? 0,
          inserted: body.inserted ?? 0,
          filename: body.filename ?? file.name,
        });
        router.refresh();
      } catch (e: any) {
        setStatus({ kind: 'error', message: e?.message ?? 'network_error' });
      }
    },
    [router],
  );

  const onDrop = (ev: React.DragEvent<HTMLLabelElement>) => {
    ev.preventDefault();
    setDragOver(false);
    const file = ev.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition"
        style={{
          borderColor: dragOver ? 'var(--accent, #6366f1)' : 'var(--border)',
          background: dragOver ? 'var(--surface-1, rgba(99,102,241,0.05))' : 'var(--surface-2)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        <UploadCloud className="mb-2 h-8 w-8" style={{ color: 'var(--text-2)' }} />
        <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          Arrastra un CSV o haz clic para cargar
        </div>
        <div className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
          Extractos bancarios y de tarjeta de crédito (formato Date / Description / Amount)
        </div>
      </label>

      {status.kind === 'uploading' && (
        <div
          className="mt-3 flex items-center gap-2 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Procesando...
        </div>
      )}

      {status.kind === 'ok' && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg border p-3 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>
            <strong>{status.filename}</strong> · {status.parsed} filas leídas, {status.inserted}{' '}
            nuevas insertadas.
          </span>
        </div>
      )}

      {status.kind === 'error' && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg border p-3 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        >
          <AlertCircle className="h-4 w-4 text-rose-500" />
          <span>Error: {status.message}</span>
        </div>
      )}
    </div>
  );
}
