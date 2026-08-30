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
        {rows ? (
          rows.map((row, i) => (
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
        ) : (
          <div className="feed-row">
            <div className="feed-body">
              <div className="feed-line">Sin actividad todavía</div>
              <div className="feed-meta">los eventos de agentes y canales aparecerán aquí</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
