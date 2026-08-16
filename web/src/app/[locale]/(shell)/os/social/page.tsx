import { getTranslations } from 'next-intl/server';

export default async function OsSocialPage() {
  const t = await getTranslations('os.social');
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">En construcción · PR#9</div>
        </div>
      </div>
    </main>
  );
}
