/**
 * GET /api/os/comms/threads — last N conversations across all channels for the
 * requesting org's brands. Feeds the unified inbox on the OS Comms page.
 *
 * Data model:
 *   smarttalk.conversations (id, contact_id, channel_id, last_message_at,
 *     unread_count, status, priority, subject/preview)
 *   smarttalk.messages (conversation_id, body, direction, created_at)
 *   smarttalk.channels (id, brand_id, type)
 *
 * Scope: uses requireOrgIdFromRequest() + resolveBrandIds() so operator only
 * sees threads belonging to brands owned by the current cm_user.
 */
import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { createAdminClient } from '@/lib/supabase/admin';

export interface CommsThread {
  id: string;
  channelId: string | null;
  channelType: string; // whatsapp | messenger | instagram | email | slack | phone | web
  brandId: string | null;
  contactId: string | null;
  contactName: string;
  preview: string;
  lastMessageAt: string;
  unread: number;
  priority: 'urgent' | 'normal' | 'low';
  status: string;
  lastDirection: 'inbound' | 'outbound' | 'unknown';
}

interface RawConversation {
  id: string;
  contact_id: string | null;
  channel_id: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  status: string | null;
  priority: string | null;
  subject: string | null;
  preview: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
  created_at: string | null;
}

interface RawChannel {
  id: string;
  brand_id: string | null;
  type: string | null;
  name: string | null;
}

interface RawContact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

interface RawMessage {
  conversation_id: string;
  body: string | null;
  direction: string | null;
  created_at: string | null;
}

function normalisePriority(raw: string | null, unread: number): 'urgent' | 'normal' | 'low' {
  const p = (raw ?? '').toLowerCase();
  if (p === 'urgent' || p === 'high') return 'urgent';
  if (p === 'low') return 'low';
  // Escalation heuristic: many unread messages bumps priority to urgent.
  if (unread >= 5) return 'urgent';
  return 'normal';
}

export async function GET(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  try {
    const orgId = await requireOrgIdFromRequest();
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') ?? '50')));

    const brandIds = await resolveBrandIds(orgId);
    if (brandIds.length === 0) {
      return NextResponse.json({ threads: [] });
    }

    const admin = createAdminClient('smarttalk');

    // Fetch channels for these brands so we can filter conversations and
    // annotate each thread with its channel type in one pass.
    const { data: channels, error: channelsErr } = await admin
      .from('channels')
      .select('id, brand_id, type, name')
      .in('brand_id', brandIds);

    if (channelsErr) {
      return NextResponse.json({ error: channelsErr.message }, { status: 500 });
    }
    const chanRows = (channels ?? []) as RawChannel[];
    if (chanRows.length === 0) {
      return NextResponse.json({ threads: [] });
    }
    const channelIds = chanRows.map((c) => c.id);
    const channelById = new Map(chanRows.map((c) => [c.id, c]));

    // Pull recent conversations across those channels.
    const { data: conversations, error: convErr } = await admin
      .from('conversations')
      .select(
        'id, contact_id, channel_id, last_message_at, unread_count, status, priority, subject, preview, metadata, updated_at, created_at'
      )
      .in('channel_id', channelIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (convErr) {
      return NextResponse.json({ error: convErr.message }, { status: 500 });
    }
    const convRows = (conversations ?? []) as RawConversation[];
    if (convRows.length === 0) {
      return NextResponse.json({ threads: [] });
    }

    // Contact lookup for display names.
    const contactIds = Array.from(new Set(convRows.map((c) => c.contact_id).filter((v): v is string => !!v)));
    const contactById = new Map<string, RawContact>();
    if (contactIds.length > 0) {
      const { data: contacts } = await admin
        .from('contacts')
        .select('id, name, phone, email')
        .in('id', contactIds);
      for (const c of (contacts ?? []) as RawContact[]) contactById.set(c.id, c);
    }

    // Latest message per conversation for preview + direction.
    const convIds = convRows.map((c) => c.id);
    const previewByConv = new Map<string, RawMessage>();
    // Cap to avoid huge query; last 5 msgs per conv is more than enough for preview.
    const { data: messages } = await admin
      .from('messages')
      .select('conversation_id, body, direction, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(limit * 5);
    for (const m of (messages ?? []) as RawMessage[]) {
      if (!previewByConv.has(m.conversation_id)) previewByConv.set(m.conversation_id, m);
    }

    const threads: CommsThread[] = convRows.map((c) => {
      const channel = c.channel_id ? channelById.get(c.channel_id) ?? null : null;
      const contact = c.contact_id ? contactById.get(c.contact_id) ?? null : null;
      const msg = previewByConv.get(c.id) ?? null;
      const unread = c.unread_count ?? 0;
      const priority = normalisePriority(c.priority, unread);
      const contactName =
        contact?.name?.trim() ||
        contact?.phone ||
        contact?.email ||
        c.subject ||
        'Sin nombre';
      const preview =
        (msg?.body ?? '').trim().slice(0, 200) ||
        (c.preview ?? '').slice(0, 200) ||
        '';
      const lastMessageAt = c.last_message_at ?? c.updated_at ?? c.created_at ?? new Date(0).toISOString();
      const rawDir = (msg?.direction ?? '').toLowerCase();
      const lastDirection =
        rawDir === 'inbound' || rawDir === 'in' ? 'inbound' :
        rawDir === 'outbound' || rawDir === 'out' ? 'outbound' :
        'unknown';

      return {
        id: c.id,
        channelId: c.channel_id,
        channelType: (channel?.type ?? 'unknown').toLowerCase(),
        brandId: channel?.brand_id ?? null,
        contactId: c.contact_id,
        contactName,
        preview,
        lastMessageAt,
        unread,
        priority,
        status: c.status ?? 'open',
        lastDirection,
      };
    });

    return NextResponse.json({ threads });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
