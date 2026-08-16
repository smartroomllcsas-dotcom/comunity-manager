// Minimal social types for Community Manager OS (ported from FounderOS).
// Sprint 2 wires these to real cm_social_stats + cm_dms tables.

export type SocialGrowth = {
  d7: number | null;
  d30: number | null;
  d60: number | null;
  allTime: number | null;
};

export type SeriesPoint = { date: string; value: number };
export type LabelledSeries = { key: string; label: string; color: string; points: SeriesPoint[] };

export type DmThread = {
  id: string;
  platform: string;
  participantName: string;
  participantHandle: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
};
