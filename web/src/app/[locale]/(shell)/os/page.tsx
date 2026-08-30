import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Inbox, Users, Zap, TrendingUp, MessageSquare, Plus, Bot, Target } from 'lucide-react';
import { getOSRepositoryForRequest, requireOrgIdFromRequest, getActiveOrgFromRequest } from '@/lib/os/server';
import type { Agent, Activity, Connector, Goal } from '@/lib/os/repository';
import { PulseCards } from '@/components/os/PulseCards';
import { ActivityFeed } from '@/components/os/ActivityFeed';
import { AgentRoster } from '@/components/os/AgentRoster';
import { ConnectionsStrip } from '@/components/os/ConnectionsStrip';
import { ConnectorBars } from '@/components/os/home/ConnectorBars';
import { HealthMeter } from '@/components/os/home/HealthMeter';
import { HomeSocialGraph } from '@/components/os/home/HomeSocialGraph';

export const dynamic = 'force-dynamic';

interface QuickAction {
  href: string;
  icon: typeof Plus;
  label: string;
  description: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { href: '/es/os/comms',        icon: Inbox,   label: 'Abrir inbox',    description: 'Ver conversaciones' },
  { href: '/es/os/agents',       icon: Bot,     label: 'Crear agente',   description: 'Nuevo autómata' },
  { href: '/es/os/goals',        icon: Target,  label: 'Nuevo goal',     description: 'Standing sentinel' },
  { href: '/es/os/integrations', icon: Zap,     label: 'Conectar canal', description: 'Meta · WA · Slack' },
];

export default async function OsConsolePage() {
  const t = await getTranslations('os.console');

  let agents: Agent[] = [];
  let activity: Activity[] = [];
  let connectors: Connector[] = [];
  let goals: Goal[] = [];
  const { orgName } = await getActiveOrgFromRequest();

  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    [agents, activity, connectors, goals] = await Promise.all([
      repo.agents.all(orgId),
      repo.activity.recent(orgId, 20),
      repo.connectors.all(orgId),
      repo.goals.all(orgId),
    ]);
  } catch {
    // Unauthenticated — sub-components fall back to placeholder data internally.
  }

  const liveConnectors = connectors.filter((c) => c.status === 'live').length;
  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const goalsOk = goals.filter((g) => g.lastStatus === 'ok').length;

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">
            {t('subtitle', { brand: orgName ?? '—' })}
          </div>
        </div>
      </div>

      {/* Pulse row — reuses existing PulseCards */}
      <PulseCards agents={agents} connectors={connectors} goals={goals} />

      {/* Systems row — connector bars + composite health meter (from FounderOS-DEMO) */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-os-border bg-os-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
                Estado de conectores
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-[24px] font-semibold text-os-muted">{liveConnectors}</span>
                <span className="font-mono text-[11px] text-os-dim">
                  / {connectors.length || '—'} en vivo
                </span>
              </div>
            </div>
            <Link
              href="/es/os/integrations"
              className="font-mono text-[10.5px] font-semibold text-os-accent hover:underline"
            >
              Board →
            </Link>
          </div>
          <ConnectorBars connectors={connectors} />
          <div className="mt-3 flex gap-4 font-mono text-[10px] uppercase tracking-wider text-os-dim">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" strokeWidth={2} />
              {activeAgents} agentes
            </span>
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" strokeWidth={2} />
              {goalsOk} goals ok
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" strokeWidth={2} />
              {activity.length} eventos
            </span>
          </div>
        </div>

        <HealthMeter agents={agents} connectors={connectors} goals={goals} />
      </section>

      {/* Home social graph — agents/connectors/goals as nodes around an OS hub */}
      <section className="mt-6">
        <HomeSocialGraph agents={agents} connectors={connectors} goals={goals} />
      </section>

      {/* Recent activity + Agent roster (reused existing components) */}
      <section className="mt-6 split">
        <ActivityFeed activity={activity} />
        <AgentRoster agents={agents} />
      </section>

      {/* Connections strip (existing) */}
      <section className="mt-6">
        <ConnectionsStrip connectors={connectors} />
      </section>

      {/* Quick actions */}
      <section className="mt-6">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-os-dim">
          Acciones rápidas
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-3 rounded-md-t border border-os-border bg-os-surface px-4 py-3 transition-colors hover:border-os-accent/40 hover:bg-os-surface2/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-os-border bg-os-surface2 text-os-accent transition-colors group-hover:bg-os-accent/10">
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-os-muted">{a.label}</div>
                  <div className="font-mono text-[10.5px] text-os-dim">{a.description}</div>
                </div>
                <Plus className="h-3.5 w-3.5 shrink-0 text-os-dim opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </section>

      <div className="footbar">
        <span><kbd>⌘K</kbd> command</span>
        <span><kbd>g</kbd> <kbd>a</kbd> agents</span>
        <span><kbd>g</kbd> <kbd>c</kbd> comms</span>
        <div className="right">
          <span>
            flag: os-shell <Users className="inline h-3 w-3" />
          </span>
        </div>
      </div>
    </main>
  );
}
