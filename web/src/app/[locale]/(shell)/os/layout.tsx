import { notFound } from 'next/navigation';
import { communityOsFlag } from '@/lib/flags';
import { OsSidebar } from '@/components/os/OsSidebar';
import { OsTopbar } from '@/components/os/OsTopbar';

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const enabled = await communityOsFlag();
  if (!enabled) notFound();

  return (
    <div className="os-shell app">
      <OsSidebar />
      <div className="main">
        <OsTopbar />
        {children}
      </div>
    </div>
  );
}
