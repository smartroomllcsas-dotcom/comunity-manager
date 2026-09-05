'use client';

import type { DmThread } from '@/lib/os/social';

// Stub for InstagramDmInbox — Sprint 2 wires to real DM threads from WAHA/Meta API.
export function InstagramDmInbox({ threads, onClose }: { threads: DmThread[]; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-os-border px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-os-dim">DM Inbox</span>
        <button onClick={onClose} className="text-os-dim hover:text-os-text" aria-label="Close">✕</button>
      </div>
      {threads.length === 0 ? (
        <p className="flex-1 py-8 text-center font-mono text-[11px] text-os-dim">
          {/* TODO Sprint 2: connect to WAHA / Meta Inbox API */}
          No threads yet — connect Instagram to see DMs.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-os-border">
          {threads.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-medium text-os-text">{t.participantName}</span>
                {t.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-os-accent px-1.5 py-0.5 font-mono text-[9px] text-os-ink">{t.unread}</span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-[10.5px] text-os-dim">{t.lastMessage}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
