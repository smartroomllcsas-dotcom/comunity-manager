'use client';

import { useState } from 'react';
import { ChevronRight, MessageSquare, Mail, Hash, Camera, Phone, Globe, type LucideIcon } from 'lucide-react';
import type { CommsThread } from '@/app/api/os/comms/threads/route';
import { PriorityBadge } from './PriorityBadge';

const CHANNEL_ICON: Record<string, LucideIcon> = {
  whatsapp: MessageSquare,
  waha: MessageSquare,
  messenger: MessageSquare,
  instagram: Camera,
  email: Mail,
  gmail: Mail,
  slack: Hash,
  phone: Phone,
  call: Phone,
  web: Globe,
  unknown: Globe,
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'ahora';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface CommsItemProps {
  thread: CommsThread;
}

/**
 * Single row of the unified inbox. Collapsed shows: channel icon, sender,
 * preview, unread badge, priority, timestamp. Expanded reveals thread metadata
 * (full ID map for handoff, status, direction). Sprint N will wire per-thread
 * message history via /api/inbox/conversations/[id]/messages.
 */
export function CommsItem({ thread }: CommsItemProps) {
  const [open, setOpen] = useState(false);
  const Icon = CHANNEL_ICON[thread.channelType] ?? Globe;
  const hasUnread = thread.unread > 0;

  return (
    <li
      className={`rounded-md-t border transition-colors ${
        hasUnread
          ? 'border-os-border bg-os-surface'
          : 'border-os-border/60 bg-os-surface/40'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-os-surface2/60"
        aria-expanded={open}
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-os-border bg-os-surface2">
          <Icon className={`h-4 w-4 ${hasUnread ? 'text-os-accent' : 'text-os-dim'}`} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate text-[13px] ${hasUnread ? 'font-semibold text-os-text' : 'text-os-muted'}`}>
              {thread.contactName}
            </span>
            <PriorityBadge priority={thread.priority} />
            {hasUnread && (
              <span className="shrink-0 rounded-full bg-os-accent px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-os-ink">
                {thread.unread}
              </span>
            )}
            <span className="ml-auto shrink-0 font-mono text-[10.5px] text-os-dim">
              {relativeTime(thread.lastMessageAt)}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 font-mono text-[11.5px] leading-relaxed text-os-dim">
            {thread.lastDirection === 'outbound' ? '↖ ' : ''}
            {thread.preview || '(sin mensajes)'}
          </p>
        </div>
        <ChevronRight
          className={`mt-2 h-3.5 w-3.5 shrink-0 text-os-dim transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-os-border bg-os-surface2/40 px-4 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[10.5px] text-os-dim">
            <div className="flex gap-2">
              <dt className="uppercase tracking-wider">Canal</dt>
              <dd className="text-os-muted">{thread.channelType || 'unknown'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="uppercase tracking-wider">Estado</dt>
              <dd className="text-os-muted">{thread.status}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="uppercase tracking-wider">Dir.</dt>
              <dd className="text-os-muted">{thread.lastDirection}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="uppercase tracking-wider">Brand</dt>
              <dd className="truncate text-os-muted">{thread.brandId?.slice(0, 8) ?? '—'}</dd>
            </div>
            <div className="col-span-2 flex gap-2">
              <dt className="uppercase tracking-wider">ID</dt>
              <dd className="truncate text-os-muted">{thread.id}</dd>
            </div>
          </dl>
          <div className="mt-3 flex justify-end gap-2">
            <a
              href={`/es/inbox?conversationId=${thread.id}`}
              className="rounded-sm-t border border-os-border bg-os-surface px-3 py-1 font-mono text-[10.5px] font-semibold text-os-muted hover:text-os-accent"
            >
              Abrir en inbox →
            </a>
          </div>
        </div>
      )}
    </li>
  );
}
