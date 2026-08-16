import { getTranslations } from 'next-intl/server';
import { getOSRepositoryForRequest } from '@/lib/os/server';
import { MarketplaceGrid } from '@/components/os/MarketplaceGrid';

export default async function OsMarketplacePage() {
  const t = await getTranslations('os.marketplace');
  const repo = await getOSRepositoryForRequest();
  const templates = await repo.templates.all();

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">{t('subtitle')}</div>
        </div>
      </div>
      <MarketplaceGrid templates={templates} />
    </main>
  );
}
