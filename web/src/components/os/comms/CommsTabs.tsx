'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { MessageSquare, Mail, Hash, Camera, Phone, Globe, Inbox, type LucideIcon } from 'lucide-react';
import type { CommsThread } from '@/app/api/os/comms/threads/route';
import { CommsItem } from './CommsItem';

type LaneId = 'all' | 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'slack' | 'phone';

interface Lane {
  id: LaneId;
  label: string;
  icon: LucideIcon;
  match: (ch: string) => boolean;
}

const LANES: Lane[] = [
  { id: 'all',       label: 'Todo',      icon: Inbox,          match: () => true },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: MessageSquare,  match: (c) => c === 'whatsapp' || c === 'waha' },
  { id: 'messenger', label: 'Messenger', icon: MessageSquare,  match: (c) => c === 'messenger' || c === 'facebook' },
  { id: 'instagram', label: 'Instagram', icon: Camera,          match: (c) => c === 'instagram' || c === 'ig' },
  { id: 'email',     label: 'Email',     icon: Mail,           match: (c) => c === 'email' || c === 'gmail' },
  { id: 'slack',     label: 'Slack',     icon: Hash,           match: (c) => c === 'slack' },
  { id: 'phone',     label: 'Llamadas',  icon: Phone,          match: (c) => c === 'phone' || c === 'call' },
];

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<{ threads: CommsThread[] }>;
};

interface CommsTabsProps {
  initialThreads: CommsThread[];
}

/**
 * Unified inbox with per-channel lanes. Polls /api/os/comms/threads every 30s
 * via SWR — swap for Supabase Realtime once the smarttalk publication is
 * configured (see docs/os/realtime.md, TBD).
 */
export function CommsTabs({ initialThreads }: CommsTabsProps) {
  const [active, setActive] = useState<LaneId>('all');
  const { data } = useSWR('/api/os/comms/threads?limit=50', fetcher, {
    fallbackData: { threads: initialThreads },
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
  const threads = data?.threads ?? initialThreads;

  const unreadByLane = useMemo(() => {
    const m = new Map<LaneId, number>();
    for (const lane of LANES) {
      const count = threads
        .filter((t) => lane.match(t.channelType))
        .reduce((sum, t) => sum + (t.unread ?? 0), 0);
      m.set(lane.id, count);
    }
    return m;
  }, [threads]);

  const filtered = useMemo(() => {
    const lane = LANES.find((l) => l.id === active) ?? LANES[0];
    return threads.filter((t) => lane.match(t.channelType));
  }, [active, threads]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-os-border pb-3">
        {LANES.map((lane) => {
          const Icon = lane.icon;
          const isActive = active === lane.id;
          const unread = unreadByLane.get(lane.id) ?? 0;
          return (
            <button
              key={lane.id}
              type="button"
              onClick={() => setActive(lane.id)}
              className={`inline-flex items-center gap-2 rounded-sm-t px-3 py-1.5 font-mono text-[11.5px] font-semibold transition-colors ${
                isActive
                  ? 'bg-os-accent/10 text-os-accent'
                  : 'text-os-dim hover:text-os-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
              {lane.label}
              {unread > 0 && (
                <span
                  className={`rounded-full px-1.5 py-px font-mono text-[9.5px] ${
                    isActive ? 'bg-os-accent text-os-ink' : 'bg-os-surface2 text-os-muted'
                  }`}
                >
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md-t border border-dashed border-os-border bg-os-surface px-6 py-12">
          <Globe className="h-5 w-5 text-os-dim" strokeWidth={1.5} />
          <p className="font-mono text-[11px] text-os-dim">
            Sin conversaciones en este canal
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((t) => (
            <CommsItem key={t.id} thread={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
