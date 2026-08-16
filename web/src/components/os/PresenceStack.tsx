'use client';
import { useOsPresence, type PresenceUser } from '@/hooks/useOsPresence';

export function PresenceStack({ orgId, me }: { orgId: string; me: Omit<PresenceUser, 'since'> }) {
  const { users } = useOsPresence(orgId, me);
  const others = users.filter(u => u.userId !== me.userId);
  if (others.length === 0) return null;
  return (
    <div className="flex -space-x-2" title={`${others.length} online`}>
      {others.slice(0, 5).map(u => (
        <div
          key={u.userId}
          className="w-6 h-6 rounded-full border border-zinc-800 bg-zinc-700 flex items-center justify-center text-[10px]"
          title={`${u.name} en ${u.route}`}
        >
          {(u.name || u.email || '?').slice(0, 2).toUpperCase()}
        </div>
      ))}
      {others.length > 5 && (
        <div className="w-6 h-6 rounded-full border border-zinc-800 bg-zinc-800 text-[10px] flex items-center justify-center">
          +{others.length - 5}
        </div>
      )}
    </div>
  );
}
