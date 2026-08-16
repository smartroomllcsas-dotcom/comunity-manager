import { getTranslations } from 'next-intl/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { PostComposerShell } from './PostComposerShell';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import type { SocialPost } from '@/lib/os/schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createSbClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
  });
}

type CmPost = {
  id: string;
  content: string | null;
  platforms: string[] | null;
  status: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  updated_at?: string | null;
  published_at?: string | null;
};

/** Maps a cm_scheduled_posts row → SocialPost shape for PostComposer */
function toSocialPost(row: CmPost): SocialPost {
  return {
    id: row.id,
    caption: row.content ?? '',
    platforms: (row.platforms ?? []) as SocialPost['platforms'],
    mediaUrl: null,
    scheduledFor: row.scheduled_date ?? null,
    status: (row.status as SocialPost['status']) ?? 'draft',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OsContentPage() {
  const t = await getTranslations('os.content');

  // Resolve client_id for this session (orgId === cm_client_id in this app)
  let clientId: string | null = null;
  try {
    clientId = await requireOrgIdFromRequest();
  } catch {
    // unauthenticated — show empty state gracefully
  }

  let drafts: SocialPost[] = [];
  let scheduled: SocialPost[] = [];
  let published: SocialPost[] = [];

  if (clientId) {
    const sb = getPublicAdmin();
    const { data } = await sb
      .from('cm_scheduled_posts')
      .select('id, content, platforms, status, scheduled_date, created_at, published_at')
      .eq('client_id', clientId)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(50);

    const rows: CmPost[] = data ?? [];
    drafts    = rows.filter(r => r.status === 'draft').map(toSocialPost);
    scheduled = rows.filter(r => r.status === 'scheduled').map(toSocialPost);
    published = rows.filter(r => r.status === 'published').slice(0, 10).map(toSocialPost);
  }

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 font-mono text-[10px] text-green-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
          Cron activo — publica cada minuto los scheduled listos
        </span>
      </div>

      {/* Composer — passes real drafts so PostComposer can show them inline */}
      <section className="mt-6">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">{t('compose')}</h2>
        <PostComposerShell initialPosts={drafts} />
      </section>

      {/* Scheduled */}
      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
          Programados ({scheduled.length})
        </h2>
        <ul className="divide-y divide-os-border rounded border border-os-border">
          {scheduled.length === 0 ? (
            <li className="px-4 py-8 text-center font-mono text-[11px] text-os-dim">
              Sin posts programados
            </li>
          ) : (
            scheduled.map(p => (
              <li key={p.id} className="px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2">
                  {p.platforms.map(pl => (
                    <span key={pl} className="rounded bg-os-surface px-1.5 py-0.5 font-mono text-[9px] uppercase text-os-dim">
                      {pl}
                    </span>
                  ))}
                  {p.scheduledFor && (
                    <span className="font-mono text-[10px] text-accent">
                      {new Date(p.scheduledFor).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-os-text">{p.caption}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Published (recent) */}
      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">
          Publicados recientes ({published.length})
        </h2>
        <ul className="divide-y divide-os-border rounded border border-os-border">
          {published.length === 0 ? (
            <li className="px-4 py-8 text-center font-mono text-[11px] text-os-dim">
              Sin posts publicados
            </li>
          ) : (
            published.map(p => (
              <li key={p.id} className="px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2">
                  {p.platforms.map(pl => (
                    <span key={pl} className="rounded bg-os-surface px-1.5 py-0.5 font-mono text-[9px] uppercase text-os-dim">
                      {pl}
                    </span>
                  ))}
                  <span className="font-mono text-[10px] text-green-400">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : ''}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-os-text">{p.caption}</p>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
