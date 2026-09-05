import { notFound } from 'next/navigation';
import { communityOsFlag } from '@/lib/flags';
import { Sidebar } from '@/components/layout/Sidebar';
import { OsTopbar } from '@/components/os/OsTopbar';

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const enabled = await communityOsFlag();
  if (!enabled) notFound();

  return (
    <div className="flex min-h-screen bg-[var(--surface-base)]">
      <Sidebar showCommunityOs={true} />
      <div className="os-shell main flex-1 min-w-0 flex flex-col">
        <OsTopbar />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
