import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import type { OSRepository } from '@/lib/os/repository';

export interface PublishResult {
  postId: string;
  ok: boolean;
  platform: string;
  error?: string;
}

export async function findDuePosts(orgId?: string, limit = 20) {
  const sb = getSupabaseServiceClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowTime = now.toISOString().slice(11, 19);
  let q = sb.from('cm_scheduled_posts')
    .select('id, client_id, content, platforms, scheduled_date, scheduled_time, status, title')
    .eq('status', 'scheduled')
    .or(`scheduled_date.lt.${today},and(scheduled_date.eq.${today},scheduled_time.lte.${nowTime})`)
    .order('scheduled_date', { ascending: true })
    .limit(limit);
  if (orgId) q = q.eq('client_id', orgId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function publishPost(post: any, repo: OSRepository): Promise<PublishResult> {
  // Sprint 4 stub: mark as published + log activity. Sprint 5 wires real dispatch to platform APIs.
  const sb = getSupabaseServiceClient();
  try {
    await sb.from('cm_scheduled_posts')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', post.id);
    await repo.activity.insert(post.client_id, {
      kind: 'broadcast.published',
      actorId: null,
      summary: `Post ${post.title || post.id.slice(0, 8)} published to ${(post.platforms ?? []).join(', ')}`,
      payload: { postId: post.id, platforms: post.platforms },
      ok: true,
    });
    return { postId: post.id, ok: true, platform: (post.platforms ?? []).join(',') };
  } catch (e: any) {
    await sb.from('cm_scheduled_posts')
      .update({ status: 'failed' })
      .eq('id', post.id);
    return { postId: post.id, ok: false, platform: (post.platforms ?? []).join(','), error: e.message };
  }
}
