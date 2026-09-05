'use client';

/**
 * Kanban task board — 3 columns (todo / in_progress / done) with drag+drop.
 *
 * Ported from FounderOS-DEMO/components/TaskBoard.tsx, refactored into
 * TaskColumn + TaskCard sub-components and wired to CM's `/api/os/tasks/[id]`
 * (PATCH for status/assignee, GET for polling). Optimistic on drop, reconciled
 * on a 6s poll.
 *
 * Includes an agent filter dropdown that fetches only tasks assigned to a
 * specific agent (server-side ?agent= filter).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OsTask, OsTaskStatus } from '@/lib/os/schemas/task';
import { TaskColumn } from './TaskColumn';
import { TaskCard } from './TaskCard';

const COLUMNS: { status: OsTaskStatus; label: string; tone: string }[] = [
  { status: 'todo', label: 'To do', tone: 'var(--text-3, #999)' },
  { status: 'in_progress', label: 'In progress', tone: 'var(--warn, #f59e0b)' },
  { status: 'done', label: 'Done', tone: 'var(--ok, #10b981)' },
];

export function TaskBoard({
  initialTasks,
  agentNames,
}: {
  initialTasks: OsTask[];
  agentNames: Record<string, string>;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<OsTaskStatus | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('');
  const pending = useRef(0);

  // Poll every 6s so agent-created tasks appear without a hard refresh.
  useEffect(() => {
    const id = setInterval(async () => {
      if (pending.current > 0) return;
      try {
        const qs = agentFilter ? `?agent=${encodeURIComponent(agentFilter)}` : '';
        const res = await fetch(`/api/os/tasks${qs}`, { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { tasks?: OsTask[] };
        if (Array.isArray(body.tasks)) setTasks(body.tasks);
      } catch {
        /* keep last good board */
      }
    }, 6000);
    return () => clearInterval(id);
  }, [agentFilter]);

  // Re-fetch immediately when the agent filter changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = agentFilter ? `?agent=${encodeURIComponent(agentFilter)}` : '';
        const res = await fetch(`/api/os/tasks${qs}`, { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { tasks?: OsTask[] };
        if (!cancelled && Array.isArray(body.tasks)) setTasks(body.tasks);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentFilter]);

  const move = async (id: string, status: OsTaskStatus) => {
    const cur = tasks.find((t) => t.id === id);
    if (!cur || cur.status === status) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    pending.current += 1;
    try {
      await fetch(`/api/os/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch {
      /* poll reconciles */
    } finally {
      pending.current -= 1;
    }
  };

  const agentOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const id of Object.keys(agentNames)) ids.add(id);
    for (const t of tasks) if (t.assigneeAgentId) ids.add(t.assigneeAgentId);
    return [...ids].sort((a, b) => (agentNames[a] ?? a).localeCompare(agentNames[b] ?? b));
  }, [tasks, agentNames]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px]" style={{ color: 'var(--text-3, #666)' }}>
          Arrastra una tarjeta entre columnas. Los agents mueven sus propias tarjetas al avanzar.
        </p>
        <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3, #666)' }}>
          Agente:
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-md border px-2 py-1 text-[11px]"
            style={{
              borderColor: 'var(--border, #333)',
              background: 'var(--surface, transparent)',
              color: 'var(--text-1, currentColor)',
            }}
          >
            <option value="">Todos</option>
            {agentOptions.map((id) => (
              <option key={id} value={id}>
                {agentNames[id] ?? id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status);
          return (
            <TaskColumn
              key={col.status}
              status={col.status}
              label={col.label}
              tone={col.tone}
              count={colTasks.length}
              isOver={overCol === col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.status);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                if (dragId) void move(dragId, col.status);
                setDragId(null);
              }}
            >
              {colTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  agentName={task.assigneeAgentId ? agentNames[task.assigneeAgentId] ?? task.assigneeAgentId : 'sin asignar'}
                  dragging={dragId === task.id}
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                />
              ))}
            </TaskColumn>
          );
        })}
      </div>
    </div>
  );
}
