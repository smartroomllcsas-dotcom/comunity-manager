import { EditorialPipeline } from '@/components/os/content/EditorialPipeline';
import { PostComposerPro } from '@/components/os/content/PostComposerPro';
import { ContentCalendar } from '@/components/os/content/ContentCalendar';
import { PillarsManager } from '@/components/os/content/PillarsManager';
import { DraftManager } from '@/components/os/content/DraftManager';

/**
 * OS Content page — ported from FounderOS-DEMO with CM-native wiring.
 * Feature suite: pipeline kanban, multi-platform composer + AI writer,
 * calendar with drag-and-drop, pillars CRUD, drafts manager.
 */

export const dynamic = 'force-dynamic';

export default function OsContentPage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Contenido</h1>
          <div className="page-sub">
            Pipeline editorial: pilares → drafts → aprobación → publicación multi-canal
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {[
          { label: 'Drafts activos', value: '—', hint: 'pendiente aprobación' },
          { label: 'Programados esta semana', value: '—', hint: 'próximas 7d' },
          { label: 'Publicados 30d', value: '—', hint: 'reach' },
          { label: 'Engagement rate', value: '—', hint: 'último mes' },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
              {k.label}
            </div>
            <div className="text-2xl font-semibold mt-1" style={{ color: 'var(--text-1)' }}>
              {k.value}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-2)' }}>
              {k.hint}
            </div>
          </div>
        ))}
      </div>

      {/* Composer + AI writer */}
      <PostComposerPro />

      {/* Editorial pipeline kanban */}
      <EditorialPipeline />

      {/* Content calendar (month + week + drag&drop) */}
      <ContentCalendar />

      {/* Pillars CRUD */}
      <PillarsManager />

      {/* Draft manager */}
      <DraftManager />
    </main>
  );
}
