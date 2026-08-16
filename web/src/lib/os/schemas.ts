// Minimal schema types for Community Manager OS (ported from FounderOS).
// Sprint 2 will use the real cm_posts table.

export type SocialPlatform = 'instagram' | 'tiktok' | 'twitter' | 'youtube' | 'linkedin';

export type SocialPost = {
  id: string;
  caption: string;
  platforms: SocialPlatform[];
  mediaUrl: string | null;
  scheduledFor: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  createdAt: string;
};
