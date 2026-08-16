import { getTranslations } from 'next-intl/server';
import { createClient } from '@supabase/supabase-js';
import { SocialStatStrip } from '@/components/os/SocialStatStrip';
import { FollowerBarChart } from '@/components/os/FollowerBarChart';
import { AudiencePie } from '@/components/os/AudiencePie';
import { AudienceConsistencyLazy } from '@/components/os/AudienceConsistencyLazy';
import { PillarRadar } from '@/components/os/PillarRadar';
import type { FollowerPoint, PieItem } from '@/lib/os/social-chart';
import type { PillarAxis } from '@/lib/os/pillar-radar';
import type { SocialGrowth, DmThread } from '@/lib/os/social';
import type { PostDay } from '@/lib/os/posting-activity';
import { requireOrgIdFromRequest } from '@/lib/os/server';

// ---------------------------------------------------------------------------
// Fallback placeholder data (Bliss Glamping · 3 accounts)
// Used when cm_social_accounts / cm_metrics_account have no rows for this org.
// TODO Sprint 3: remove once all orgs have live social accounts connected.
// ---------------------------------------------------------------------------
const PLACEHOLDER_FOLLOWER_SERIES: FollowerPoint[] = [
  { date: '2026-06-01', followers: 18200 },
  { date: '2026-06-15', followers: 18950 },
  { date: '2026-07-01', followers: 19800 },
  { date: '2026-07-15', followers: 20650 },
  { date: '2026-08-01', followers: 21400 },
  { date: '2026-08-14', followers: 22100 },
];
const PLACEHOLDER_PIE: PieItem[] = [
  { key: 'instagram', label: '@blissglamping (IG)', value: 14300 },
  { key: 'tiktok',    label: '@blissglamping (TikTok)', value: 5200 },
  { key: 'facebook',  label: 'Bliss Glamping (FB)',  value: 2600 },
];
const PLACEHOLDER_PILLAR_AXES: PillarAxis[] = [
  { id: 'nature',     label: 'Naturaleza',         color: '#3df08c', score: 88, roster: 90, freshness: 85, sop: 80 },
  { id: 'experience', label: 'Experiencia',         color: '#5ec9f8', score: 75, roster: 70, freshness: 80, sop: 72 },
  { id: 'community',  label: 'Comunidad',           color: '#a78bfa', score: 62, roster: 60, freshness: 65, sop: 58 },
  { id: 'offers',     label: 'Ofertas',             color: '#f59e0b', score: 50, roster: 48, freshness: 55, sop: 44 },
  { id: 'behind',     label: 'Behind the scenes',   color: '#f87171', score: 70, roster: 68, freshness: 72, sop: 66 },
];
const PLACEHOLDER_AUDIENCE_GROWTH: SocialGrowth = { d7: 1.2, d30: 4.8, d60: 9.1, allTime: 21.4 };
const PLACEHOLDER_DM_GROWTH: SocialGrowth = { d7: 3.5, d30: 12.0, d60: 18.5, allTime: null };

// ---------------------------------------------------------------------------
// Server-side data fetch helpers
// ---------------------------------------------------------------------------

/** Service-role Supabase client (bypasses RLS — server only). */
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface MetricRow {
  platform: string;
  snapshot_at: string;
  followers: number;
  followers_delta_30d: number;
}

interface PillarRow {
  id: string;
  name: string;
  color: string;
  post_count: number;
}

interface PostRow {
  scheduled_date: string;
  platform: string;
  status: string;
}

interface MentionRow {
  id: string;
  created_at: string;
}

async function fetchSocialData(orgId: string) {
  const sb = serviceClient();

  // Latest snapshot per platform (accounts + most-recent metric)
  const { data: accounts } = await sb
    .from('cm_social_accounts')
    .select('id, platform, account_name, account_id')
    .eq('organization_id', orgId)
    .eq('status', 'active');

  // Last 90 days of snapshots for the history chart
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: history } = await sb
    .from('cm_metrics_account')
    .select('platform, snapshot_at, followers, followers_delta_30d')
    .eq('organization_id', orgId)
    .gte('snapshot_at', since90)
    .order('snapshot_at', { ascending: true });

  // ── Sprint 3: content pillars for PillarRadar ──────────────────────────
  // orgId == cm_client_id in the CM data model (see identify.ts)
  const { data: pillars } = await sb
    .from('cm_content_pillars')
    .select('id, name, color, post_count')
    .eq('client_id', orgId)
    .order('post_count', { ascending: false });

  // ── Sprint 3: published + scheduled posts last 90d for AudienceConsistency ─
  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: posts } = await sb
    .from('cm_scheduled_posts')
    .select('scheduled_date, platform, status')
    .eq('client_id', orgId)
    .in('status', ['published', 'scheduled'])
    .gte('scheduled_date', since90d)
    .order('scheduled_date', { ascending: true });

  // ── Sprint 3: DM count from cm_mentions (source_type = 'dm') last 30d ──
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: dms30 } = await sb
    .from('cm_mentions')
    .select('id, created_at')
    .eq('client_id', orgId)
    .eq('source_type', 'dm')
    .gte('created_at', since30);
  // prior 30d window (30–60 days ago) for growth calc
  const { data: dms60 } = await sb
    .from('cm_mentions')
    .select('id, created_at')
    .eq('client_id', orgId)
    .eq('source_type', 'dm')
    .gte('created_at', since60)
    .lt('created_at', since30);

  return {
    accounts: accounts ?? [],
    history: (history ?? []) as MetricRow[],
    pillars: (pillars ?? []) as PillarRow[],
    posts: (posts ?? []) as PostRow[],
    dms30: (dms30 ?? []) as MentionRow[],
    dms60: (dms60 ?? []) as MentionRow[],
  };
}

function buildFollowerSeries(history: MetricRow[]): FollowerPoint[] {
  // Aggregate followers across all platforms per date (daily buckets)
  const byDate: Record<string, number> = {};
  for (const row of history) {
    const date = row.snapshot_at.slice(0, 10);
    byDate[date] = (byDate[date] ?? 0) + (row.followers ?? 0);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, followers]) => ({ date, followers }));
}

function buildPieItems(history: MetricRow[]): { items: PieItem[]; total: number } {
  // Latest snapshot per platform (tracked in two parallel maps for type safety)
  const latestFollowers: Record<string, number> = {};
  const latestAt: Record<string, string> = {};
  for (const row of history) {
    const prevAt = latestAt[row.platform];
    if (!prevAt || row.snapshot_at > prevAt) {
      latestFollowers[row.platform] = row.followers ?? 0;
      latestAt[row.platform] = row.snapshot_at;
    }
  }
  const platformLabel: Record<string, string> = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    linkedin: 'LinkedIn', x: 'X / Twitter', youtube: 'YouTube',
    threads: 'Threads', pinterest: 'Pinterest',
  };
  const items: PieItem[] = Object.entries(latestFollowers).map(([platform, value]) => ({
    key: platform,
    label: platformLabel[platform] ?? platform,
    value,
  }));
  const total = items.reduce((s, i) => s + (i.value ?? 0), 0);
  return { items, total };
}

function buildGrowth(history: MetricRow[]): SocialGrowth {
  if (!history.length) return PLACEHOLDER_AUDIENCE_GROWTH;
  // Sum the most-recent followers_delta_30d across all platforms
  const latest: Record<string, MetricRow> = {};
  for (const row of history) {
    const cur = latest[row.platform];
    if (!cur || row.snapshot_at > cur.snapshot_at) latest[row.platform] = row;
  }
  const rows = Object.values(latest);
  const totalFollowers = rows.reduce((s, r) => s + (r.followers ?? 0), 0);
  const totalDelta30d  = rows.reduce((s, r) => s + (r.followers_delta_30d ?? 0), 0);
  const d30 = totalFollowers > 0 ? (totalDelta30d / (totalFollowers - totalDelta30d)) * 100 : 0;
  return { d7: null, d30: parseFloat(d30.toFixed(2)), d60: null, allTime: null };
}

// ── Sprint 3 builders ─────────────────────────────────────────────────────

/**
 * Map cm_content_pillars rows into PillarAxis[].
 * score = normalized post_count (0–100, relative to the most-active pillar).
 * roster/freshness/sop approximate the same value until post-level signals land.
 */
function buildPillarAxes(pillars: PillarRow[]): PillarAxis[] {
  if (!pillars.length) return PLACEHOLDER_PILLAR_AXES;
  const maxCount = Math.max(...pillars.map((p) => p.post_count ?? 0), 1);
  return pillars.map((p) => {
    const score = Math.round(((p.post_count ?? 0) / maxCount) * 100);
    return {
      id: p.id,
      label: p.name,
      color: p.color ?? '#3df08c',
      score,
      roster: score,    // TODO Sprint 4: derive from cm_metrics_post per pillar
      freshness: score,
      sop: score,
    };
  });
}

/**
 * Map cm_scheduled_posts rows into PostDay[] for AudienceConsistency.
 * PostDay = { date: string; platforms: string[] }
 */
function buildPostDays(posts: PostRow[]): PostDay[] {
  // Group platforms by date
  const byDate = new Map<string, Set<string>>();
  for (const p of posts) {
    if (!byDate.has(p.scheduled_date)) byDate.set(p.scheduled_date, new Set());
    byDate.get(p.scheduled_date)!.add(p.platform);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, platforms]) => ({ date, platforms: Array.from(platforms) }));
}

/**
 * Build DM growth metric from two consecutive 30-day windows of cm_mentions DMs.
 */
function buildDmGrowth(dms30: MentionRow[], dms60: MentionRow[]): SocialGrowth {
  const cur = dms30.length;
  const prior = dms60.length;
  const d30 = prior > 0 ? parseFloat((((cur - prior) / prior) * 100).toFixed(1)) : null;
  return { d7: null, d30, d60: null, allTime: null };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function OsSocialPage() {
  const t = await getTranslations('os.social');
  const today = new Date().toISOString().slice(0, 10);

  // Attempt real data; fall back to placeholder on auth/db error
  let followerSeries: FollowerPoint[] = PLACEHOLDER_FOLLOWER_SERIES;
  let pieItems: PieItem[]             = PLACEHOLDER_PIE;
  let pieTotal                        = 22100;
  let audienceGrowth: SocialGrowth   = PLACEHOLDER_AUDIENCE_GROWTH;
  let platformsCount                  = 3;
  let isPlaceholder                   = true;

  // Sprint 3: real pillar / postDays / DM data
  let pillarAxes: PillarAxis[]  = PLACEHOLDER_PILLAR_AXES;
  let postDays: PostDay[]       = [];
  let dmGrowth: SocialGrowth    = PLACEHOLDER_DM_GROWTH;
  let dmCount                   = 148; // placeholder total DMs until we accumulate history
  const dmThreads: DmThread[]   = [];  // TODO Sprint 4: surface individual DM threads

  try {
    const orgId = await requireOrgIdFromRequest();
    const { accounts, history, pillars, posts, dms30, dms60 } = await fetchSocialData(orgId);

    if (history.length > 0) {
      isPlaceholder  = false;
      followerSeries = buildFollowerSeries(history);
      const pie      = buildPieItems(history);
      pieItems       = pie.items;
      pieTotal       = pie.total;
      audienceGrowth = buildGrowth(history);
      platformsCount = accounts.length || pie.items.length;
    }

    // PillarRadar — real pillars from cm_content_pillars
    if (pillars.length > 0) {
      pillarAxes = buildPillarAxes(pillars);
    }

    // AudienceConsistency — post publishing cadence from cm_scheduled_posts
    if (posts.length > 0) {
      postDays = buildPostDays(posts);
    }

    // DM count + growth from cm_mentions source_type='dm'
    if (dms30.length > 0 || dms60.length > 0) {
      dmCount  = dms30.length;
      dmGrowth = buildDmGrowth(dms30, dms60);
    }
  } catch {
    // Unauthenticated preview or DB unavailable — keep placeholders
  }

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
          audienceTotal={pieTotal}
          audienceGrowth={audienceGrowth}
          totalDms={dmCount}
          dmGrowth={dmGrowth}
          platformsCount={platformsCount}
          dmThreads={dmThreads}
        />
      </div>

      {/* Charts grid */}
      <div className="mt-2 grid gap-6 lg:grid-cols-2">
        {/* Follower bar chart */}
        <section className="rounded-lg-t border border-os-border bg-os-surface px-5 py-[18px]">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">{t('followers')}</h2>
          {/* Source: cm_metrics_account · organization_id · last 90d */}
          {isPlaceholder && (
            <p className="mb-1 font-mono text-[9px] text-os-muted">
              demo data · connect accounts to see live metrics
            </p>
          )}
          <FollowerBarChart series={followerSeries} />
        </section>

        {/* Audience pie */}
        <section>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">{t('audience')}</h2>
          {/* Source: cm_metrics_account latest snapshot per platform */}
          <AudiencePie items={pieItems} total={pieTotal} donutPx={160} />
        </section>

        {/* Audience consistency — Source: cm_scheduled_posts · client_id · last 90d */}
        <section className="lg:col-span-2">
          <AudienceConsistencyLazy
            audience={[]}
            postDays={postDays}
            today={today}
          />
        </section>

        {/* Pillar radar — Source: cm_content_pillars · client_id · post_count score */}
        <section className="rounded-lg-t border border-os-border bg-os-surface px-5 py-[18px] lg:col-span-2">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-os-dim">{t('pillars')}</h2>
          <div className="flex justify-center">
            <PillarRadar
              axes={pillarAxes}
              health={Math.round(pillarAxes.reduce((s, a) => s + a.score, 0) / Math.max(pillarAxes.length, 1))}
              warnings={pillarAxes.filter((a) => a.score < 30).length}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
