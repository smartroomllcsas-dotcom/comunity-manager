'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SUBNAV_ITEMS = [
  { href: '/os',              label: 'Console' },
  { href: '/os/agents',      label: 'Agents' },
  { href: '/os/goals',       label: 'Goals' },
  { href: '/os/skills',      label: 'Skills' },
  { href: '/os/funnel',      label: 'Funnel' },
  { href: '/os/content',     label: 'Content' },
  { href: '/os/social',      label: 'Social' },
  { href: '/os/workflows',   label: 'Workflows' },
  { href: '/os/integrations', label: 'Integrations' },
  { href: '/os/observability', label: 'Observability' },
  { href: '/os/analytics',   label: 'Analytics' },
  { href: '/os/marketplace',    label: 'Marketplace' },
  { href: '/os/settings/cohorts', label: 'Settings' },
  { href: '/os/settings/theme',   label: 'Theme' },
];

interface OsSubnavProps {
  t: (key: string) => string;
}

export function OsSubnav({ t: _t }: OsSubnavProps) {
  const pathname = usePathname();

  // Derive locale-agnostic suffix for matching
  const isActive = (href: string) => {
    // exact match for console (/es/os or /en/os)
    if (href === '/os') {
      return /^\/[a-z]{2}\/os$/.test(pathname);
    }
    return pathname.includes(href);
  };

  return (
    <nav className="subnav" aria-label="OS sections">
      {SUBNAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={`/es${item.href}`}
          className={`subnav-item${isActive(item.href) ? ' active' : ''}`}
          aria-current={isActive(item.href) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
