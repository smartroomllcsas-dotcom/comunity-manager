// Sprint 24 · Contrato compartido entre PostEditor y PlatformPreview.
// Los IDs son los mismos que se guardan en `cm_scheduled_posts.platforms[]`
// y los que valida la API en /api/posts (ALLOWED_PLATFORMS).

export type Platform =
  | "fb"
  | "ig-feed"
  | "ig-reel"
  | "ig-story"
  | "tiktok"
  | "linkedin-personal"
  | "linkedin-company"
  | "x"
  | "threads";

export const PLATFORMS: Platform[] = [
  "fb",
  "ig-feed",
  "ig-reel",
  "ig-story",
  "tiktok",
  "linkedin-personal",
  "linkedin-company",
  "x",
  "threads",
];

export const PLATFORM_META: Record<
  Platform,
  { label: string; limit: number; short: string }
> = {
  fb: { label: "Facebook", limit: 63206, short: "FB" },
  "ig-feed": { label: "Instagram Feed", limit: 2200, short: "IG" },
  "ig-reel": { label: "Instagram Reel", limit: 2200, short: "Reel" },
  "ig-story": { label: "Instagram Story", limit: 0, short: "Story" }, // sin caption real
  tiktok: { label: "TikTok", limit: 2200, short: "TT" },
  "linkedin-personal": { label: "LinkedIn (Personal)", limit: 3000, short: "in" },
  "linkedin-company": { label: "LinkedIn (Empresa)", limit: 3000, short: "in Co" },
  x: { label: "X (Twitter)", limit: 280, short: "X" },
  threads: { label: "Threads", limit: 500, short: "Th" },
};

/**
 * Devuelve el límite más restrictivo entre las plataformas seleccionadas
 * (ignora Story que no tiene caption). Se usa para el warning en el editor.
 */
export function tightestLimit(selected: Platform[]): number {
  const withCaption = selected.filter((p) => PLATFORM_META[p].limit > 0);
  if (withCaption.length === 0) return Infinity;
  return Math.min(...withCaption.map((p) => PLATFORM_META[p].limit));
}
