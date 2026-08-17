import { MessageSquare, Mail, Hash, Camera, Phone, Inbox } from 'lucide-react';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { CommsTabs } from '@/components/os/comms/CommsTabs';
import type { CommsThread } from '@/app/api/os/comms/threads/route';

export const dynamic = 'force-dynamic';

interface SourceStatus {
  id: string;
  name: string;
  icon: typeof MessageSquare;
  connected: boolean;
  count: number;
}

/**
 * Load initial threads on the server so the page renders with data on first
 * paint. The CommsTabs client component then keeps them fresh via SWR polling
 * against /api/os/comms/threads.
 * Never throws — auth errors return an empty inbox with a hint banner.
 */
async function loadInitial(
  orgId: string
): Promise<{
  threads: CommsThread[];
  channelStats: Map<string, { connected: boolean; count: number }>;
}> {
  const stats = new Map<string, { connected: boolean; count: number }>();
  try {
    const brandIds = await resolveBrandIds(orgId);
    if (brandIds.length === 0) return { threads: [], channelStats: stats };

    const admin = createAdminClient('smarttalk');
    const { data: channels } = await admin
      .from('channels')
      .select('id, brand_id, type, status')
      .in('brand_id', brandIds);

    const chanRows = channels ?? [];
    for (const c of chanRows) {
      const key = String(c.type ?? '').toLowerCase();
      const cur = stats.get(key) ?? { connected: false, count: 0 };
      cur.count += 1;
      const rawStatus = String(c.status ?? '').toLowerCase();
      if (rawStatus === 'active' || rawStatus === 'connected' || rawStatus === 'live') {
        cur.connected = true;
      }
      stats.set(key, cur);
    }

    const channelIds = chanRows.map((c) => c.id as string);
    if (channelIds.length === 0) return { threads: [], channelStats: stats };

    const { data: conversations } = await admin
      .from('conversations')
      .select(
        'id, contact_id, channel_id, last_message_at, unread_count, status, priority, subject, preview, updated_at, created_at'
      )
      .in('channel_id', channelIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50);

    const convRows = conversations ?? [];
    if (convRows.length === 0) return { threads: [], channelStats: stats };

    const contactIds = Array.from(
      new Set(convRows.map((c) => c.contact_id).filter((v): v is string => !!v))
    );
    const contactById = new Map<
      string,
      { name: string | null; phone: string | null; email: string | null }
    >();
    if (contactIds.length > 0) {
      const { data: contacts } = await admin
        .from('contacts')
        .select('id, name, phone, email')
        .in('id', contactIds);
      for (const c of contacts ?? []) {
        contactById.set(c.id as string, c as { name: string | null; phone: string | null; email: string | null });
      }
    }

    const channelById = new Map(chanRows.map((c) => [c.id as string, c]));
    const threads: CommsThread[] = convRows.map((c) => {
      const channel = c.channel_id ? channelById.get(c.channel_id) : undefined;
      const contact = c.contact_id ? contactById.get(c.contact_id) : undefined;
      const unread = (c.unread_count as number | null) ?? 0;
      const rawPriority = String(c.priority ?? '').toLowerCase();
      const priority: CommsThread['priority'] =
        rawPriority === 'urgent' || rawPriority === 'high'
          ? 'urgent'
          : rawPriority === 'low'
            ? 'low'
            : unread >= 5
              ? 'urgent'
              : 'normal';
      const contactName =
        contact?.name?.trim() ||
        contact?.phone ||
        contact?.email ||
        (c.subject as string | null) ||
        'Sin nombre';
      return {
        id: c.id as string,
        channelId: c.channel_id as string | null,
        channelType: String(channel?.type ?? 'unknown').toLowerCase(),
        brandId: (channel?.brand_id as string | null) ?? null,
        contactId: c.contact_id as string | null,
        contactName,
        preview: ((c.preview as string | null) ?? '').slice(0, 200),
        lastMessageAt:
          (c.last_message_at as string | null) ??
          (c.updated_at as string | null) ??
          (c.created_at as string | null) ??
          new Date(0).toISOString(),
        unread,
        priority,
        status: (c.status as string | null) ?? 'open',
        lastDirection: 'unknown',
      };
    });

    return { threads, channelStats: stats };
  } catch {
    return { threads: [], channelStats: stats };
  }
}

export default async function OsCommsPage() {
  let threads: CommsThread[] = [];
  let channelStats = new Map<string, { connected: boolean; count: number }>();
  let authed = false;

  try {
    const orgId = await requireOrgIdFromRequest();
    authed = true;
    ({ threads, channelStats } = await loadInitial(orgId));
  } catch {
    // dev / unauthenticated — render empty state with hint banner
  }

  const totalUnread = threads.reduce((s, t) => s + (t.unread ?? 0), 0);

  const sources: SourceStatus[] = [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: MessageSquare,
      connected:
        !!channelStats.get('whatsapp')?.connected || !!channelStats.get('waha')?.connected,
      count:
        (channelStats.get('whatsapp')?.count ?? 0) + (channelStats.get('waha')?.count ?? 0),
    },
    {
      id: 'messenger',
      name: 'Messenger',
      icon: MessageSquare,
      connected: !!channelStats.get('messenger')?.connected,
      count: channelStats.get('messenger')?.count ?? 0,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: Camera,
      connected: !!channelStats.get('instagram')?.connected,
      count: channelStats.get('instagram')?.count ?? 0,
    },
    {
      id: 'email',
      name: 'Email',
      icon: Mail,
      connected: !!channelStats.get('email')?.connected,
      count: channelStats.get('email')?.count ?? 0,
    },
    {
      id: 'slack',
      name: 'Slack',
      icon: Hash,
      connected: !!channelStats.get('slack')?.connected,
      count: channelStats.get('slack')?.count ?? 0,
    },
    {
      id: 'phone',
      name: 'Llamadas',
      icon: Phone,
      connected: !!channelStats.get('phone')?.connected,
      count: channelStats.get('phone')?.count ?? 0,
    },
  ];
  const connectedSources = sources.filter((s) => s.connected).length;

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Comms unificado</h1>
          <div className="page-sub">
            Un solo inbox para WhatsApp, Messenger, Instagram, Slack, Email y llamadas — con priorización IA.
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-md border border-os-border bg-os-surface px-3 py-1.5 font-mono text-[11.5px] font-semibold text-os-accent">
          <Inbox className="h-3.5 w-3.5" strokeWidth={1.7} />
          {totalUnread} sin leer
        </span>
      </div>

      {!authed && (
        <div className="mt-4 rounded-md border border-dashed border-os-border bg-os-surface px-4 py-3 font-mono text-[11px] text-os-dim">
          Sin sesión activa — inicia sesión para ver las conversaciones reales.
        </div>
      )}

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-os-dim">Fuentes</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
            {connectedSources}/{sources.length} conectadas
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {sources.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                className={`rounded-md-t border px-3 py-2.5 ${
                  s.connected
                    ? 'border-os-border bg-os-surface'
                    : 'border-os-border/60 bg-os-surface/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${s.connected ? 'text-os-accent' : 'text-os-dim'}`}
                    strokeWidth={1.7}
                  />
                  <span className="text-[12.5px] font-semibold text-os-muted">{s.name}</span>
                  {s.connected && (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-os-accent" />
                  )}
                </div>
                <p className="mt-1 font-mono text-[10px] text-os-dim">
                  {s.connected ? `${s.count} canal${s.count === 1 ? '' : 'es'}` : 'Sin configurar'}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <CommsTabs initialThreads={threads} />
      </section>
    </main>
  );
}
