import { getTranslations } from 'next-intl/server';
import { SocialStatStrip } from '@/components/os/SocialStatStrip';
import { FollowerBarChart } from '@/components/os/FollowerBarChart';
import { AudiencePie } from '@/components/os/AudiencePie';
import { AudienceConsistencyLazy } from '@/components/os/AudienceConsistencyLazy';
import { PillarRadar } from '@/components/os/PillarRadar';
import type { FollowerPoint } from '@/lib/os/social-chart';
import type { PieItem } from '@/lib/os/social-chart';
import type { PillarAxis } from '@/lib/os/pillar-radar';
import type { SocialGrowth, DmThread } from '@/lib/os/social';
import type { PostDay } from '@/lib/os/posting-activity';

// ---------------------------------------------------------------------------
// TODO Sprint 2: replace all placeholder data with real cm_social_stats queries
// Placeholder: Bliss Glamping · 3 accounts · @blissglamping / IG / FB
// ---------------------------------------------------------------------------

const FOLLOWER_SERIES: FollowerPoint[] = [
  { date: '2026-06-01', followers: 18200 },
  { date: '2026-06-15', followers: 18950 },
  { date: '2026-07-01', followers: 19800 },
  { date: '2026-07-15', followers: 20650 },
  { date: '2026-08-01', followers: 21400 },
  { date: '2026-08-14', followers: 22100 },
];

const AUDIENCE_PIE_ITEMS: PieItem[] = [
  { key: 'instagram', label: '@blissglamping (IG)', value: 14300 },
  { key: 'tiktok', label: '@blissglamping (TikTok)', value: 5200 },
  { key: 'facebook', label: 'Bliss Glamping (FB)', value: 2600 },
];

const PILLAR_AXES: PillarAxis[] = [
  { id: 'nature', label: 'Naturaleza', color: '#3df08c', score: 88, roster: 90, freshness: 85, sop: 80 },
  { id: 'experience', label: 'Experiencia', color: '#5ec9f8', score: 75, roster: 70, freshness: 80, sop: 72 },
  { id: 'community', label: 'Comunidad', color: '#a78bfa', score: 62, roster: 60, freshness: 65, sop: 58 },
  { id: 'offers', label: 'Ofertas', color: '#f59e0b', score: 50, roster: 48, freshness: 55, sop: 44 },
  { id: 'behind', label: 'Behind the scenes', color: '#f87171', score: 70, roster: 68, freshness: 72, sop: 66 },
];

const AUDIENCE_GROWTH: SocialGrowth = { d7: 1.2, d30: 4.8, d60: 9.1, allTime: 21.4 };
const DM_GROWTH: SocialGrowth = { d7: 3.5, d30: 12.0, d60: 18.5, allTime: null };
const DM_THREADS: DmThread[] = [];
const POST_DAYS: PostDay[] = [];

export default async function OsSocialPage() {
  const t = await getTranslations('os.social');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
      </div>

      {/* Stat strip — 4 tiles: reach / audience growth / DMs / inbox */}
      <div className="mt-6">
        <SocialStatStrip
          audienceTotal={22100}
          audienceGrowth={AUDIENCE_GROWTH}
          totalDms={148}
          dmGrowth={DM_GROWTH}
          platformsCount={3}
          dmThreads={DM_THREADS}
        />
      </div>

      {/* Charts grid */}
      <div className="mt-2 grid gap-6 lg:grid-cols-2">
        {/* Follower bar chart */}
        <section className="rounded-lg-t border border-os-border bg-os-surface px-5 py-[18px]">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">{t('followers')}</h2>
          {/* TODO Sprint 2: load from cm_social_stats WHERE platform='instagram' ORDER BY date */}
          <FollowerBarChart series={FOLLOWER_SERIES} />
        </section>

        {/* Audience pie */}
        <section>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">{t('audience')}</h2>
          {/* TODO Sprint 2: load from cm_social_stats latest snapshot per platform */}
          <AudiencePie items={AUDIENCE_PIE_ITEMS} total={22100} donutPx={160} />
        </section>

        {/* Audience consistency (lazy-loaded SVG chart) */}
        <section className="lg:col-span-2">
          {/* TODO Sprint 2: audience from cm_social_stats, postDays from cm_posts */}
          <AudienceConsistencyLazy
            audience={[]}
            postDays={POST_DAYS}
            today={today}
          />
        </section>

        {/* Pillar radar */}
        <section className="rounded-lg-t border border-os-border bg-os-surface px-5 py-[18px] lg:col-span-2">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">{t('pillars')}</h2>
          {/* TODO Sprint 2: derive axes from cm_content_pillars + cm_posts engagement */}
          <div className="flex justify-center">
            <PillarRadar axes={PILLAR_AXES} health={69} warnings={1} />
          </div>
        </section>
      </div>
    </main>
  );
}
