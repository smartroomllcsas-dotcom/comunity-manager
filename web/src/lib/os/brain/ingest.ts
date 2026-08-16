/**
 * Brain ingest — populates os_knowledge_nodes + os_knowledge_edges
 * from CM / SmartTalk source tables for a given orgId.
 *
 * Sources:
 *   smarttalk.contacts  → nodes kind='contact'  (keyed by organization_id)
 *   smarttalk.conversations → nodes kind='topic' + edges contact→topic
 *   cm_clients          → nodes kind='brand'   (keyed by smarttalk_organization_id)
 *   cm_scheduled_posts  → nodes kind='topic'   (recent published posts, via client→org mapping)
 */

import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import type { OSRepository } from '@/lib/os/repository';

export interface IngestStats {
  contacts: number;
  conversations: number;
  brands: number;
  posts: number;
  edges: number;
}

async function tryInsertEdge(
  repo: OSRepository,
  orgId: string,
  fromNodeId: string,
  toNodeId: string,
  relation: string,
): Promise<boolean> {
  try {
    await repo.knowledge.edges.insert(orgId, {
      fromNodeId,
      toNodeId,
      relation,
      weight: 1.0,
      meta: {},
    });
    return true;
  } catch {
    // uniqueness collision is fine — node pair already linked
    return false;
  }
}

export async function ingestForOrg(
  repo: OSRepository,
  orgId: string,
): Promise<IngestStats> {
  const sb = getSupabaseServiceClient();
  const stats: IngestStats = {
    contacts: 0,
    conversations: 0,
    brands: 0,
    posts: 0,
    edges: 0,
  };

  // ── 1. smarttalk.contacts → nodes kind='contact' ────────────────────────────
  // smarttalk.contacts uses organization_id which maps to smarttalk.organizations.id
  // That org has cm_client_id → the orgId in our OS is the smarttalk org uuid.
  const { data: contacts, error: contactsErr } = await sb
    .schema('smarttalk')
    .from('contacts')
    .select('id, organization_id, wa_id, name, tags, brand_id, last_message_at')
    .eq('organization_id', orgId)
    .limit(500);

  if (contactsErr) {
    console.warn('[brain-ingest] contacts query error:', contactsErr.message);
  }

  for (const c of contacts ?? []) {
    await repo.knowledge.nodes.upsert(orgId, {
      id: `contact-${c.id}`,
      orgId,
      kind: 'contact',
      label: c.name || c.wa_id || 'Sin nombre',
      summary: c.wa_id ?? '',
      props: {
        waId: c.wa_id,
        tags: c.tags,
        brandId: c.brand_id,
        lastMessageAt: c.last_message_at,
      },
      source: 'smarttalk.contacts',
      sourceId: String(c.id),
      weight: 1.0,
    });
    stats.contacts++;
  }

  // ── 2. smarttalk.conversations → nodes kind='topic' + edges ─────────────────
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: convs, error: convsErr } = await sb
    .schema('smarttalk')
    .from('conversations')
    .select('id, organization_id, contact_id, status, priority, last_message_preview, opened_at, brand_id')
    .eq('organization_id', orgId)
    .gte('opened_at', since)
    .limit(300);

  if (convsErr) {
    console.warn('[brain-ingest] conversations query error:', convsErr.message);
  }

  for (const conv of convs ?? []) {
    const nodeId = `conv-${conv.id}`;
    const label = conv.last_message_preview
      ? conv.last_message_preview.slice(0, 80)
      : `Conversación ${conv.id.slice(0, 8)}`;

    await repo.knowledge.nodes.upsert(orgId, {
      id: nodeId,
      orgId,
      kind: 'topic',
      label,
      summary: conv.last_message_preview ?? '',
      props: {
        status: conv.status,
        priority: conv.priority,
        brandId: conv.brand_id,
        openedAt: conv.opened_at,
      },
      source: 'smarttalk.conversations',
      sourceId: String(conv.id),
      weight: 0.5,
    });
    stats.conversations++;

    // edge: contact --mentions--> conversation topic
    if (conv.contact_id) {
      const added = await tryInsertEdge(
        repo,
        orgId,
        `contact-${conv.contact_id}`,
        nodeId,
        'mentions',
      );
      if (added) stats.edges++;
    }
  }

  // ── 3. cm_clients → nodes kind='brand' ──────────────────────────────────────
  // cm_clients.smarttalk_organization_id links a brand to the smarttalk org (orgId)
  const { data: brands, error: brandsErr } = await sb
    .from('cm_clients')
    .select('id, name, industry, platforms, status, brand_voice, language, smarttalk_organization_id')
    .eq('smarttalk_organization_id', orgId)
    .limit(50);

  if (brandsErr) {
    console.warn('[brain-ingest] cm_clients query error:', brandsErr.message);
  }

  for (const b of brands ?? []) {
    await repo.knowledge.nodes.upsert(orgId, {
      id: `brand-${b.id}`,
      orgId,
      kind: 'brand' as any, // NodeKind union — 'brand' added here as extension
      label: b.name,
      summary: b.brand_voice ?? b.industry ?? '',
      props: {
        industry: b.industry,
        platforms: b.platforms,
        status: b.status,
        language: b.language,
      },
      source: 'cm_clients',
      sourceId: String(b.id),
      weight: 1.5,
    });
    stats.brands++;
  }

  // ── 4. cm_scheduled_posts (published, last 30d) → nodes kind='topic' ────────
  const brandIds = (brands ?? []).map((b) => b.id);

  if (brandIds.length > 0) {
    const { data: posts, error: postsErr } = await sb
      .from('cm_scheduled_posts')
      .select('id, client_id, platform, title, content, pillar, published_at, platform_post_url')
      .in('client_id', brandIds)
      .eq('status', 'published')
      .gte('published_at', since)
      .limit(200);

    if (postsErr) {
      console.warn('[brain-ingest] cm_scheduled_posts query error:', postsErr.message);
    }

    for (const p of posts ?? []) {
      const nodeId = `post-${p.id}`;
      await repo.knowledge.nodes.upsert(orgId, {
        id: nodeId,
        orgId,
        kind: 'topic',
        label: p.title,
        summary: p.content ? p.content.slice(0, 200) : '',
        props: {
          platform: p.platform,
          pillar: p.pillar,
          publishedAt: p.published_at,
          postUrl: p.platform_post_url,
          clientId: p.client_id,
        },
        source: 'cm_scheduled_posts',
        sourceId: String(p.id),
        weight: 0.8,
      });
      stats.posts++;

      // edge: brand --published--> post
      const added = await tryInsertEdge(
        repo,
        orgId,
        `brand-${p.client_id}`,
        nodeId,
        'published',
      );
      if (added) stats.edges++;
    }
  }

  return stats;
}
