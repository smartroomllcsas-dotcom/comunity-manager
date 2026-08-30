import { notFound } from 'next/navigation';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import { communityOsFlag } from '@/lib/flags';
import { Sidebar } from '@/components/layout/Sidebar';
import { OsTopbar } from '@/components/os/OsTopbar';
import { ActiveBrandProvider } from '@/components/providers/ActiveBrandProvider';
import { getActiveOrgFromRequest } from '@/lib/os/server';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const enabled = await communityOsFlag();
  if (!enabled) notFound();
  const { orgId } = await getActiveOrgFromRequest();

  return (
    <ActiveBrandProvider>
      <div className="flex min-h-screen bg-[var(--surface-base)]">
        <Sidebar showCommunityOs={true} />
        <div className={`os-shell main flex-1 min-w-0 flex flex-col ${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
          <OsTopbar orgId={orgId ?? undefined} />
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </ActiveBrandProvider>
  );
}
