import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/../i18n';
import '@/styles/os.css';
import { CommandPalette } from '@/components/os/CommandPalette';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { identify } from '@/lib/identify';

async function getOrgTheme(): Promise<{ hue: number; mode: 'dark' | 'light' }> {
  try {
    const ent = await identify();
    if (!ent.orgId) return { hue: 250, mode: 'dark' };
    const cookieStore = await cookies();
    const sb = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
    const { data } = await sb
      .from('os_org_theme')
      .select('accent_hue, theme_mode')
      .eq('org_id', ent.orgId)
      .maybeSingle();
    return {
      hue: data?.accent_hue ?? 250,
      mode: (data?.theme_mode ?? 'dark') as 'dark' | 'light',
    };
  } catch {
    return { hue: 250, mode: 'dark' };
  }
}

export default async function ShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  const messages = await getMessages();
  const theme = await getOrgTheme();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div
        style={{ '--accent-hue': theme.hue } as React.CSSProperties}
        data-theme={theme.mode}
      >
        {children}
        <CommandPalette />
      </div>
    </NextIntlClientProvider>
  );
}
