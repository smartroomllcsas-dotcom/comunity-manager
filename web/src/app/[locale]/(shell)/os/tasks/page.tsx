import { CheckSquare } from 'lucide-react';
import { EmptyState } from '@/components/os/EmptyState';

export default function OsTasksPage() {
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
      <EmptyState
        icon={CheckSquare}
        title="No hay tareas pendientes"
        description="Cuando un agente detecte algo que requiera acción humana (aprobar respuesta, revisar lead, escalar bug), aparecerá aquí como tarjeta accionable con contexto completo."
        action={{ label: 'Configurar agentes', href: '/chatbot/ai' }}
        secondary={{ label: 'Ver reglas de escalación', href: '/es/os/skills' }}
      />
    </main>
  );
}
