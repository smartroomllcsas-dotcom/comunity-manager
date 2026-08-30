import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
  secondary?: { label: string; href: string };
}

/**
 * Empty state para páginas OS. Reemplaza el patrón anterior
 * "POST /api/os/dev/seed" con un CTA real que apunta a un flow
 * de configuración de producción.
 */
export function EmptyState({ icon: Icon, title, description, action, secondary }: EmptyStateProps) {
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center"
      style={{ color: 'var(--text-2)' }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full border"
        style={{
          borderColor: 'var(--border)',
          background: 'linear-gradient(180deg, var(--os-accent-tint), transparent 70%)',
        }}
      >
        <Icon className="h-6 w-6" style={{ color: 'var(--os-accent)' }} />
      </div>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
        {title}
      </h2>
      <p className="text-sm leading-relaxed max-w-sm">{description}</p>
      {(action || secondary) && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {action && (
            <Link
              href={action.href}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{ background: 'var(--os-accent)', color: 'white' }}
            >
              {action.label}
            </Link>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
