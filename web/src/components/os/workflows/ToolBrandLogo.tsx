/**
 * Zero-dep brand-mark renderer for workflow tools.
 *
 * Adapted from FounderOS-DEMO/lib/brand-logos.tsx (which used the
 * `simple-icons` npm package). CM does NOT ship simple-icons — instead
 * we render a hand-tuned tinted "lettermark" tile per known tool, and
 * fall back to an auto-hued initial for unknown ids.
 *
 * Pure, server-safe. Renders inline SVG so it works in both Server
 * and Client Components with zero bundle overhead.
 */

export type ToolBrand = { slug: string; name: string; color: string };

/**
 * Curated tool catalog. Includes common workflow builders and CM's own
 * connector universe (Meta, WhatsApp, Instagram, Slack, Notion, Stripe…).
 * Add entries here as new tools are used in workflows.
 */
export const TOOL_BRANDS: Record<string, ToolBrand> = {
  // Workflow builders
  zapier:       { slug: 'zapier',       name: 'Zapier',           color: '#FF4A00' },
  make:         { slug: 'make',         name: 'Make',             color: '#6D00CC' },
  n8n:          { slug: 'n8n',          name: 'n8n',              color: '#EA4B71' },
  workflow:     { slug: 'workflow',     name: 'Workflow',         color: '#4B5563' },
  custom:       { slug: 'custom',       name: 'Custom',           color: '#0EA5E9' },
  // Comms / CRM
  slack:        { slug: 'slack',        name: 'Slack',            color: '#4A154B' },
  gmail:        { slug: 'gmail',        name: 'Gmail',            color: '#EA4335' },
  notion:       { slug: 'notion',       name: 'Notion',           color: '#000000' },
  stripe:       { slug: 'stripe',       name: 'Stripe',           color: '#635BFF' },
  // CM-native channels
  meta:         { slug: 'meta',         name: 'Meta',             color: '#0866FF' },
  facebook:     { slug: 'facebook',     name: 'Facebook',         color: '#1877F2' },
  instagram:    { slug: 'instagram',    name: 'Instagram',        color: '#E4405F' },
  whatsapp:     { slug: 'whatsapp',     name: 'WhatsApp',         color: '#25D366' },
  waha:         { slug: 'waha',         name: 'WAHA',             color: '#128C7E' },
  webhook:      { slug: 'webhook',      name: 'Webhook',          color: '#8B5CF6' },
  cron:         { slug: 'cron',         name: 'Cron',             color: '#F59E0B' },
  'google-calendar': { slug: 'google-calendar', name: 'Google Calendar', color: '#4285F4' },
  'gmail-imap': { slug: 'gmail-imap',   name: 'Gmail IMAP',       color: '#EA4335' },
};

export function toolBrand(toolId: string): ToolBrand {
  const lower = toolId.toLowerCase();
  if (TOOL_BRANDS[lower]) return TOOL_BRANDS[lower];
  // Auto-hue: hash-derived pastel color from the tool id.
  let h = 0;
  for (let i = 0; i < lower.length; i++) h = (h * 31 + lower.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { slug: lower, name: toolId, color: `hsl(${hue}, 50%, 45%)` };
}

/** Perceived luminance of a hex color, 0..1. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ToolBrandLogo({
  slug,
  name,
  size = 14,
}: {
  slug: string;
  name?: string;
  size?: number;
}) {
  const brand = toolBrand(slug);
  const label = name ?? brand.name;
  const initial = (label[0] ?? '?').toUpperCase();
  const isHex = brand.color.startsWith('#');
  const dark = isHex ? luminance(brand.color) < 0.35 : false;
  const bg = dark
    ? brand.color
    : isHex
      ? `color-mix(in srgb, ${brand.color} 20%, transparent)`
      : brand.color;
  const fg = dark ? '#ffffff' : brand.color;
  const radius = Math.max(2, Math.round(size * 0.25));

  return (
    <span
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: radius,
        background: bg,
        color: fg,
        fontSize: Math.round(size * 0.62),
        fontWeight: 700,
        lineHeight: 1,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}
