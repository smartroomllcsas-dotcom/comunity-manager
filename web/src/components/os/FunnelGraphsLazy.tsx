'use client';

/**
 * Ported from FounderOS-DEMO/components/FunnelGraphsLazy.tsx
 * Lazy client shells — same aspect ratios as originals (radial 1100/680, space 1100/460).
 */
import dynamic from 'next/dynamic';

export const FunnelRadialLazy = dynamic(
  () => import('@/components/os/FunnelRadial').then((m) => m.FunnelRadial),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse overflow-hidden rounded-lg border border-os-border bg-os-surface"
        style={{ aspectRatio: '1100 / 680' }}
      />
    ),
  },
);

export const FunnelSpaceLazy = dynamic(
  () => import('@/components/os/FunnelSpace').then((m) => m.FunnelSpace),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse overflow-hidden rounded-lg border border-os-border bg-os-surface"
        style={{ aspectRatio: '1100 / 460' }}
      />
    ),
  },
);
