'use client';

/**
 * EditorialPipeline
 * Kanban 3-lanes (Draft · Scheduled · Published) fed by /api/os/posts +
 * /api/os/content/drafts. Cards show title/body, platform icons, date, author.
 */
import { useEffect, useMemo, useState } from 'react';
import { Camera, Users, MessageSquare, Briefcase, Play, Music2, Hash, Calendar } from 'lucide-react';

type Post = {
  id: string;
  content: string;
  platforms: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduled_at: string | null;
  published_at?: string | null;
  created_by?: string | null;
  media_urls?: string[] | null;
};

type Draft = {
  id: string;
  title: string;
  body: string;
  platforms: string[];
  updated_at: string;
  created_by?: string | null;
  media_urls?: string[];
};

const PLATFORM_ICON: Record<string, typeof Camera> = {
  instagram: Camera,
  'ig-feed': Camera,
  'ig-reel': Camera,
  facebook: Users,
  fb: Users,
  twitter: MessageSquare,
  x: MessageSquare,
  linkedin: Briefcase,
  youtube: Play,
  yt: Play,
  tiktok: Music2,
  threads: Hash,
};

function PlatformIcons({ platforms }: { platforms: string[] }) {
  return (
    <div className="flex gap-1">
      {platforms.slice(0, 4).map((p) => {
        const Icon = PLATFORM_ICON[p] ?? Hash;
        return <Icon key={p} className="h-3 w-3" style={{ color: 'var(--text-2)' }} />;
      })}
    </div>
  );
}

function fmt(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Card({
  title, sub, platforms, date, author,
}: { title: string; sub?: string; platforms: string[]; date: string; author?: string | null }) {
  return (
    <article
      className="rounded-lg border p-3 mb-2"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
    >
      <div className="text-[13px] font-medium line-clamp-2" style={{ color: 'var(--text-1)' }}>
        {title}
      </div>
      {sub ? (
        <div className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--text-2)' }}>
          {sub}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between">
        <PlatformIcons platforms={platforms} />
        <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-2)' }}>
          <Calendar className="h-3 w-3" /> {date}
        </div>
      </div>
      {author ? (
        <div className="mt-1 text-[10px]" style={{ color: 'var(--text-2)' }}>
          por {author}
        </div>
      ) : null}
    </article>
  );
}

export function EditorialPipeline() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [pRes, dRes] = await Promise.all([
          fetch('/api/os/posts?limit=100').catch(() => null),
          fetch('/api/os/content/drafts?limit=100').catch(() => null),
        ]);
        const pJson = pRes && pRes.ok ? await pRes.json() : {};
        const dJson = dRes && dRes.ok ? await dRes.json() : {};
        if (cancelled) return;
        const rawPosts = (pJson.posts ?? pJson.data ?? []) as any[];
        setPosts(
          rawPosts.map((p) => ({
            id: p.id,
            content: p.content ?? p.caption ?? '',
            platforms: p.platforms ?? [],
            status: p.status ?? 'draft',
            scheduled_at: p.scheduled_at ?? p.scheduledFor ?? null,
            published_at: p.published_at ?? null,
            created_by: p.created_by ?? null,
            media_urls: p.media_urls ?? null,
          })),
        );
        setDrafts((dJson.drafts ?? []) as Draft[]);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const lanes = useMemo(() => {
    const draftCards = drafts.map((d) => ({
      key: `d:${d.id}`,
      title: d.title || d.body.slice(0, 60) || '(sin título)',
      sub: d.body.slice(0, 100),
      platforms: d.platforms ?? [],
      date: fmt(d.updated_at),
      author: d.created_by ?? null,
    }));
    const scheduled = posts.filter((p) => p.status === 'scheduled').map((p) => ({
      key: `p:${p.id}`,
      title: p.content.slice(0, 60) || '(sin contenido)',
      sub: p.content.slice(0, 100),
      platforms: p.platforms,
      date: fmt(p.scheduled_at),
      author: p.created_by,
    }));
    const published = posts.filter((p) => p.status === 'published').map((p) => ({
      key: `p:${p.id}`,
      title: p.content.slice(0, 60) || '(sin contenido)',
      sub: p.content.slice(0, 100),
      platforms: p.platforms,
      date: fmt(p.published_at ?? p.scheduled_at),
      author: p.created_by,
    }));
    return [
      { name: 'Drafts', tone: 'oklch(70% 0.05 250)', items: draftCards },
      { name: 'Programados', tone: 'oklch(70% 0.14 250)', items: scheduled },
      { name: 'Publicados', tone: 'oklch(70% 0.16 145)', items: published },
    ];
  }, [posts, drafts]);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          Editorial pipeline
        </h2>
        {loading ? <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>Cargando…</span> : null}
      </div>
      {err ? (
        <div className="mb-2 text-[11px]" style={{ color: 'oklch(70% 0.18 20)' }}>
          Error: {err}
        </div>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {lanes.map((lane) => (
          <div
            key={lane.name}
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: lane.tone }} />
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-1)' }}>
                  {lane.name}
                </div>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                {lane.items.length}
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto pr-1">
              {lane.items.length === 0 ? (
                <div className="text-[11px] py-6 text-center" style={{ color: 'var(--text-2)' }}>
                  Sin elementos
                </div>
              ) : (
                lane.items.map((c) => (
                  <Card
                    key={c.key}
                    title={c.title}
                    sub={c.sub}
                    platforms={c.platforms}
                    date={c.date}
                    author={c.author ?? null}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
