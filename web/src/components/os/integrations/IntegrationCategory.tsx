'use client';

import { useState } from 'react';

interface Props {
  label: string;
  count: number;
  active?: boolean;
  onClick?: () => void;
}

/**
 * IntegrationCategory — filterable pill / header used to group connectors.
 * Client component: only holds hover state; parent owns the "active" flag.
 */
export function IntegrationCategory({ label, count, active = false, onClick }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ring-1 ${
        active
          ? 'bg-blue-500/20 text-blue-300 ring-blue-500/40'
          : hovered
          ? 'bg-zinc-800 text-zinc-100 ring-zinc-700'
          : 'bg-zinc-900/60 text-zinc-400 ring-zinc-800'
      }`}
    >
      <span>{label}</span>
      <span
        className={`inline-flex min-w-[1.25rem] justify-center rounded-full px-1 text-[10px] font-semibold ${
          active
            ? 'bg-blue-500/30 text-blue-100'
            : 'bg-zinc-800 text-zinc-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
