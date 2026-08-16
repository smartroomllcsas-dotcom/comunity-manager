import { getTranslations } from 'next-intl/server';

export default async function OsAgentsPage() {
  const t = await getTranslations('os.agents');
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">En construcción · PR#7</div>
        </div>
      </div>
    </main>
  );
}
