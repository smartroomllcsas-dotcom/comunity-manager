import type { Activity } from '@/lib/os/repository';

type FeedMark = 'accent' | 'ok' | 'warn' | 'err';

function markFromActivity(a: Activity): FeedMark {
  if (a.ok === false) return 'err';
  if (a.kind === 'goal_breach') return 'err';
  if (a.kind === 'session_reconnect') return 'warn';
  if (a.kind === 'agent_run') return 'accent';
  return 'ok';
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} h`;
}

interface ActivityFeedProps {
  activity: Activity[];
}

export function ActivityFeed({ activity }: ActivityFeedProps) {
  const rows = activity.length > 0 ? activity.slice(0, 6) : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Actividad reciente · en vivo</div>
        <div className="panel-meta">últimas 24 h</div>
      </div>
      <div className="feed">
        {rows
          ? rows.map((row, i) => (
              <div key={i} className="feed-row">
                <div className={`feed-mark ${markFromActivity(row)}`} />
                <div className="feed-body">
                  <div className="feed-line">
                    {row.actorId && <span className="actor">{row.actorId}</span>}
                    {row.actorId ? ' ' : ''}
                    {row.summary}
                  </div>
                  <div className="feed-meta">{row.kind}</div>
                </div>
                <div className="feed-time">{relativeTime(row.at)}</div>
              </div>
            ))
          : PLACEHOLDER_ROWS.map((row, i) => (
              <div key={i} className="feed-row">
                <div className={`feed-mark ${row.mark}`} />
                <div className="feed-body">
                  <div className="feed-line">
                    <span className="actor">{row.actor}</span>
                    {' '}
                    <span dangerouslySetInnerHTML={{ __html: row.title }} />
                  </div>
                  <div className="feed-meta">{row.meta}</div>
                </div>
                <div className="feed-time">{row.time}</div>
              </div>
            ))}
      </div>
    </div>
  );
}

const PLACEHOLDER_ROWS = [
  { mark: 'accent' as FeedMark, actor: 'Auto-responder',   title: 'respondió a Diego Marín en WhatsApp',            meta: 'verificado · 68 tokens · US$ 0.0011',                 time: '2 min' },
  { mark: 'ok'     as FeedMark, actor: 'Lead-qualifier',   title: 'marcó a Carla Ríos como <strong>caliente</strong>', meta: 'score 0.87 · próximo paso: agendar cita',           time: '7 min' },
  { mark: 'warn'   as FeedMark, actor: 'WAHA-watchdog',    title: 'reconectó sesión perdida',                         meta: 'downtime 34 s · sin mensajes perdidos',              time: '12 min' },
  { mark: 'err'    as FeedMark, actor: 'Goals sentinel',   title: 'detectó <strong>breach</strong>: SLA > 5 min',     meta: '3 conversaciones en cola — escalar a humano',        time: '18 min' },
  { mark: 'accent' as FeedMark, actor: 'Content-writer',   title: 'generó 3 borradores para Instagram',               meta: 'pilar: naturaleza · pendiente aprobación',           time: '27 min' },
  { mark: 'ok'     as FeedMark, actor: 'Broadcast-sender', title: 'envió campaña <strong>Reserva agosto</strong> a 342 contactos', meta: 'entrega 98.5 % · CTR 12 % (parcial)', time: '1 h' },
];
