import { CheckSquare } from 'lucide-react';
import { EmptyState } from '@/components/os/EmptyState';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { listTasks } from '@/lib/os/tasks-repository';
import { TaskBoard } from '@/components/os/tasks/TaskBoard';

/**
 * Tasks page — ported from FounderOS-DEMO/app/tasks/page.tsx.
 *
 * Server component: resolves brand scope for this org, loads OS tasks from
 * smarttalk.os_tasks (falls back to empty on DB error since the migration
 * may not be applied yet), and looks up agent names for the board.
 */
export default async function OsTasksPage() {
  const orgId = await requireOrgIdFromRequest();
  const brandIds = await resolveBrandIds(orgId);

  let tasks: Awaited<ReturnType<typeof listTasks>> = [];
  let dbAvailable = true;
  try {
    tasks = await listTasks(orgId, brandIds);
  } catch (e) {
    // Table missing / migration not run — surface empty state gracefully.
    console.error('[os/tasks] failed to load tasks:', e);
    dbAvailable = false;
  }

  const repo = await getOSRepositoryForRequest();
  const agents = await repo.agents.all(orgId);
  const agentNames = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Tareas</h1>
          <div className="page-sub">
            Cola de tareas generada por agentes — cada card lleva contexto, dueño humano y deadline
          </div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={dbAvailable ? 'No hay tareas pendientes' : 'Tabla os_tasks no encontrada'}
          description={
            dbAvailable
              ? 'Tus agents alimentan esta lista. Cuando detecten algo que requiera acción humana (aprobar respuesta, revisar lead, escalar bug), aparecerá aquí como tarjeta accionable.'
              : 'Aplica la migración web/migrations/os_tasks.sql para habilitar el tablero.'
          }
          action={{ label: 'Configurar agentes', href: '/os/agents' }}
          secondary={{ label: 'Ver reglas de escalación', href: '/os/skills' }}
        />
      ) : (
        <TaskBoard initialTasks={tasks} agentNames={agentNames} />
      )}
    </main>
  );
}
