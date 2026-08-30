'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PresenceStack } from './PresenceStack';
import { OsBrandSwitcher } from './OsBrandSwitcher';
import type { PresenceUser } from '@/hooks/useOsPresence';

export function OsTopbar({ orgId }: { orgId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Omit<PresenceUser, 'since'> | null>(null);

  useEffect(() => {
    if (!orgId) return;
    fetch('/api/os/presence')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.userId) setMe({ ...data, route: pathname });
      })
      .catch(() => {});
  }, [orgId]);

  // Keep route in sync as user navigates
  useEffect(() => {
    if (me) setMe(prev => prev ? { ...prev, route: pathname } : prev);
  }, [pathname]);

  // Derive section label from pathname
  const section = (() => {
    const parts = pathname.split('/').filter(Boolean);
    // parts: ['es', 'os', 'agents?']
    const idx = parts.indexOf('os');
    if (idx === -1) return 'Console';
    const sub = parts[idx + 1];
    if (!sub) return 'Console';
    return sub.charAt(0).toUpperCase() + sub.slice(1);
  })();

  const isEs = pathname.startsWith('/es/');

  const switchLocale = (locale: 'es' | 'en') => {
    const newPath = pathname.replace(/^\/[a-z]{2}\//, `/${locale}/`);
    router.push(newPath);
  };

  return (
    <header className="topbar">
      <div className="crumb">
        <strong>OS</strong>
        <span className="slash">/</span>
        <span>{section}</span>
      </div>
      <div className="topbar-right">
        <OsBrandSwitcher />
        {orgId && me && <PresenceStack orgId={orgId} me={me} />}
        <div className="lang-toggle">
          <button
            aria-pressed={isEs}
            onClick={() => switchLocale('es')}
            type="button"
          >
            ES
          </button>
          <button
            aria-pressed={!isEs}
            onClick={() => switchLocale('en')}
            type="button"
          >
            EN
          </button>
        </div>
        <button className="cmd-chip" type="button" aria-label="Command palette">
          <kbd>⌘K</kbd> Command
        </button>
        <div className="avatar" aria-hidden="true" />
      </div>
    </header>
  );
}
