'use client';

import { PostComposer } from '@/components/os/PostComposer';
import type { SocialPost } from '@/lib/os/schemas';

/**
 * Thin client shell: injects the onSubmit handler into PostComposer.
 * TODO Sprint 2: wire to /api/os/posts (cm_posts table).
 */
export function PostComposerShell({ initialPosts }: { initialPosts: SocialPost[] }) {
  async function handleSubmit(draft: {
    caption: string;
    platforms: string[];
    mediaUrl: string | null;
    scheduledFor: string | null;
  }): Promise<SocialPost> {
    // TODO Sprint 2: POST to /api/os/posts
    const res = await fetch('/api/os/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { post: SocialPost };
    return body.post;
  }

  return <PostComposer initialPosts={initialPosts} onSubmit={handleSubmit} />;
}
