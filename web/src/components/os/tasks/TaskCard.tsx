'use client';

/**
 * Single draggable task card. Rendered inside a TaskColumn.
 * Adapted from FounderOS-DEMO/components/TaskBoard.tsx (inlined card block).
 */
import { User, Calendar } from 'lucide-react';
import type { OsTask } from '@/lib/os/schemas/task';

export function TaskCard({
  task,
  agentName,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: OsTask;
  agentName: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const isDone = task.status === 'done';
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const dueLabel = due ? due.toLocaleDateString() : null;
  const overdue = due && !isDone && due.getTime() < Date.now();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-lg border p-3 transition-opacity active:cursor-grabbing ${dragging ? 'opacity-40' : ''}`}
      style={{
        borderColor: 'var(--border, #333)',
        background: 'var(--surface-2, transparent)',
      }}
    >
      <div
        className="text-[12.5px] font-medium leading-snug"
        style={{
          color: isDone ? 'var(--text-3, #999)' : 'var(--text-1, currentColor)',
          textDecoration: isDone ? 'line-through' : 'none',
        }}
      >
        {task.title}
      </div>

      {task.description && (
        <div
          className="mt-1 line-clamp-2 text-[11px] leading-snug"
          style={{ color: 'var(--text-3, #999)' }}
        >
          {task.description}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]" style={{ color: 'var(--text-3, #999)' }}>
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {agentName}
        </span>
        {dueLabel && (
          <span
            className="flex items-center gap-1"
            style={{ color: overdue ? 'var(--err, #ef4444)' : undefined }}
          >
            <Calendar className="h-3 w-3" />
            {dueLabel}
          </span>
        )}
      </div>
    </div>
  );
}
