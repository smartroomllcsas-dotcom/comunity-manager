---
name: web-typography
description: Choose and combine web fonts with intent — pairings, scale, weight, tracking, and fallbacks. Use when selecting typography for a landing page, brand, or product.
---

# Web Typography

Type carries 80% of a site's personality. Pick with intent.

## Pairing (max 2 families, sometimes 3)
- **Contrast, not similarity**: sans + serif, geometric + humanist, condensed + wide.
- **Anchor with one distinctive face** (display) and one workhorse (body).
- **Never pair two neutrals** (Inter + Helvetica = wasted opportunity).

## Suggested pairings that always work
- Display serif + geometric sans: Fraunces + Inter
- Editorial: Instrument Serif + Söhne / GT America
- Techy: JetBrains Mono display + Inter body
- Premium: PP Editorial Old + Neue Haas Grotesk
- Playful: Redaction + Söhne
- Free winners: Fraunces, Instrument Serif, Bricolage Grotesque, Geist, Space Grotesk

## Scale
Use a modular scale (1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618). Pick one ratio and derive every size from it. Never freehand.

## Weight
Body: 400-450. Emphasis: 500-600. Headings: 500-700 (rarely 800/900 — they scream).
Variable fonts unlock in-between weights — use 460 for "slightly bold body" instead of jumping to 500.

## Tracking
- Body 16-18px: 0 to -0.01em
- Display 48px+: -0.02em to -0.04em (tightens as it grows)
- Uppercase labels: +0.05em to +0.15em (all caps needs air)

## Line-height
Inversely proportional to size. Display 1.05-1.15, body 1.5-1.65, long reading 1.7+.

## Fallbacks matter
Always specify a system fallback with matching metrics to prevent CLS. Use `size-adjust`, `ascent-override`, `descent-override` in @font-face when Google Font metrics differ.

## Load
- Subset to the characters you use (Latin only saves 60%)
- WOFF2 only
- `font-display: swap` for headings, `optional` for body if you can accept FOIT
- Preload only the critical face
