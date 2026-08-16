'use client';

import { PostComposer } from '@/components/os/PostComposer';
import type { SocialPost } from '@/lib/os/schemas';

/**
 * Thin client shell: injects the onSubmit handler into PostComposer.
 * Sprint 2: wired to /api/os/posts (cm_scheduled_posts via service role).
 * The route resolves client_id from the session so we only need to send
 * the post shape — no client_id required from the client.
 */
export function PostComposerShell({ initialPosts }: { initialPosts: SocialPost[] }) {
  async function handleSubmit(draft: {
    caption: string;
    platforms: string[];
    mediaUrl: string | null;
    scheduledFor: string | null;
  }): Promise<SocialPost> {
    const res = await fetch('/api/os/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const body = (await res.json()) as { post: SocialPost };
    return body.post;
  }

  return <PostComposer initialPosts={initialPosts} onSubmit={handleSubmit} />;
}
