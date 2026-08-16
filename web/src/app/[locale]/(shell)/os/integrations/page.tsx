import { getTranslations } from 'next-intl/server';

export default async function OsIntegrationsPage() {
  const t = await getTranslations('os.integrations');
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">En construcción · PR#10</div>
        </div>
      </div>
    </main>
  );
}
