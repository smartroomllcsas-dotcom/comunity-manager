import { getTranslations } from 'next-intl/server';
import { PostComposerShell } from './PostComposerShell';
import type { SocialPost } from '@/lib/os/schemas';

// TODO Sprint 2: replace with real cm_posts query (status IN ('draft','scheduled'))
const PLACEHOLDER_DRAFTS: SocialPost[] = [];

export default async function OsContentPage() {
  const t = await getTranslations('os.content');

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">{t('compose')}</h2>
        {/* PostComposerShell is a client component that injects the onSubmit handler */}
        <PostComposerShell initialPosts={PLACEHOLDER_DRAFTS} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Drafts</h2>
        {PLACEHOLDER_DRAFTS.length === 0 ? (
          <p className="rounded-lg-t border border-os-border bg-os-surface px-4 py-8 text-center font-mono text-[11px] text-os-dim">
            {t('emptyState')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {PLACEHOLDER_DRAFTS.map((post) => (
              <div key={post.id} className="rounded-lg-t border border-os-border bg-os-surface px-4 py-3">
                <p className="text-[13px] text-os-text">{post.caption}</p>
                <div className="mt-1.5 flex gap-2 font-mono text-[9.5px] text-os-dim">
                  {post.platforms.map((p) => <span key={p}>{p}</span>)}
                  {post.scheduledFor && <span>· {new Date(post.scheduledFor).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Calendar view placeholder — Sprint 2 renders a real calendar */}
      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">Calendar</h2>
        <div className="rounded-lg-t border border-os-border bg-os-surface px-4 py-10 text-center font-mono text-[11px] text-os-dim">
          {/* TODO Sprint 2: render weekly/monthly publishing calendar from cm_posts */}
          Calendar view coming in Sprint 2
        </div>
      </section>
    </main>
  );
}
