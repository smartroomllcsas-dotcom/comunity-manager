import { getTranslations } from 'next-intl/server';

export default async function OsCommandPage() {
  const t = await getTranslations('os.command');
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
