import { getTranslations } from 'next-intl/server';

export default async function OsSkillsPage() {
  const t = await getTranslations('os.skills');
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">En construcción · PR#8</div>
        </div>
      </div>
    </main>
  );
}
