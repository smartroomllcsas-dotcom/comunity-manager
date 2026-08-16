'use client';

import { usePathname, useRouter } from 'next/navigation';

export function OsTopbar() {
  const pathname = usePathname();
  const router = useRouter();

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
        <div className="status-pill">
          <span className="live-dot" />
          7 canales activos
        </div>
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
