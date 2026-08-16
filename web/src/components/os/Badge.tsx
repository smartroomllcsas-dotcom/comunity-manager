'use client';

// Minimal Badge stub — replaces @/components/terminal Badge used by PostComposer.
export function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'accent' | 'warn' | 'ok' | 'err' }) {
  const cls: Record<string, string> = {
    default: 'border-os-border text-os-dim',
    accent: 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent',
    warn: 'border-os-warn bg-os-warn/10 text-os-warn',
    ok: 'border-os-ok bg-os-ok/10 text-os-ok',
    err: 'border-os-err bg-os-err/10 text-os-err',
  };
  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${cls[tone] ?? cls.default}`}>
      {children}
    </span>
  );
}
