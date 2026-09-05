'use client';
import { useEffect, useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export interface PresenceUser {
  userId: string;
  email: string;
  name: string;
  avatar: string | null;
  route: string;
  since: number;
}

export function useOsPresence(orgId: string, me: Omit<PresenceUser, 'since'>) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!orgId || !me?.userId) return;
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = sb.channel(`os-presence-${orgId}`, { config: { presence: { key: me.userId } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, PresenceUser[]>;
      const flat: PresenceUser[] = [];
      for (const meta of Object.values(state)) if (Array.isArray(meta)) flat.push(...meta);
      // Dedupe by userId
      const seen = new Set<string>();
      const dedup = flat.filter(u => { if (seen.has(u.userId)) return false; seen.add(u.userId); return true; });
      setUsers(dedup);
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ ...me, since: Date.now() });
      }
    });
    channelRef.current = channel;
    return () => { try { sb.removeChannel(channel); } catch {} };
  }, [orgId, me?.userId, me?.route]);

  return { users };
}
