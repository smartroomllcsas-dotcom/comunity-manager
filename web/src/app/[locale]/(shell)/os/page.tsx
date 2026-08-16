import { getTranslations } from 'next-intl/server';
import { ConsoleHome } from '@/components/os/ConsoleHome';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';

export default async function OsConsolePage() {
  const t = await getTranslations('os.console');

  let agents: Awaited<ReturnType<Awaited<ReturnType<typeof getOSRepositoryForRequest>>['agents']['all']>> = [];
  let activity: Awaited<ReturnType<Awaited<ReturnType<typeof getOSRepositoryForRequest>>['activity']['recent']>> = [];
  let connectors: Awaited<ReturnType<Awaited<ReturnType<typeof getOSRepositoryForRequest>>['connectors']['all']>> = [];
  let goals: Awaited<ReturnType<Awaited<ReturnType<typeof getOSRepositoryForRequest>>['goals']['all']>> = [];

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
    // Unauthenticated in dev — components fall back to placeholder data
  }

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">
            {t('subtitle', { brand: 'Bliss Glamping' })}
          </div>
        </div>
      </div>
      <ConsoleHome
        agents={agents}
        activity={activity}
        connectors={connectors}
        goals={goals}
      />
    </main>
  );
}
