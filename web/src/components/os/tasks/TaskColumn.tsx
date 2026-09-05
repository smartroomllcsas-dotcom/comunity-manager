'use client';

/**
 * A single kanban column. Handles drag-over highlight & drop.
 * Adapted from FounderOS-DEMO/components/TaskBoard.tsx (inlined column block).
 */
import type { ReactNode } from 'react';
import type { OsTaskStatus } from '@/lib/os/schemas/task';

export function TaskColumn({
  status,
  label,
  tone,
  count,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  status: OsTaskStatus;
  label: string;
  tone: string;
  count: number;
  isOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  children: ReactNode;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="flex min-h-[260px] flex-col gap-2.5 rounded-xl border p-3 transition-colors"
      style={{
        borderColor: isOver ? 'var(--os-accent, oklch(70% 0.14 250))' : 'var(--border, #333)',
        background: isOver ? 'var(--surface-2, transparent)' : 'var(--surface, transparent)',
      }}
      data-status={status}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
          <span
            className="font-mono text-[11px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-2, currentColor)' }}
          >
            {label}
          </span>
        </span>
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-3, #666)' }}>
          {count}
        </span>
      </div>
      {children}
      {count === 0 && (
        <div
          className="rounded-lg border border-dashed px-3 py-6 text-center font-mono text-[10px]"
          style={{ borderColor: 'var(--border, #333)', color: 'var(--text-3, #666)' }}
        >
          drop here
        </div>
      )}
    </div>
  );
}
