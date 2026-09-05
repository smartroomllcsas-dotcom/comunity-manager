---
name: refactoring-ui
description: Design system fundamentals from Refactoring UI: spacing scale, color palette generation, hierarchy through size/weight/color, and shadow depth. Use when building or auditing UI components.
---

# Refactoring UI

Design systems built from Adam Wathan and Steve Schoger's Refactoring UI principles. Apply these when translating a Figma into code or when a UI feels amateur.

## Hierarchy through weight and color, not size
Don't crank every heading up. Instead:
- Primary text: darker gray (not pure black), heavier weight
- Secondary text: mid gray, normal weight
- Tertiary/meta: lighter gray, small size

## Spacing as a system
Never use round numbers picked at random. Adopt one scale — powers-of-two or a Tailwind-style 4/8/12/16/24/32/48/64/96 — and stick to it. Vertical rhythm > horizontal cleverness.

## Color palettes
- 8-10 shades per hue minimum (50 → 900)
- 2-3 grays with warmth (never pure #ccc)
- 1 primary, 1 accent, semantic (red/green/yellow) always in the same family

## Depth
Shadows are stacked, not single. A real shadow = ambient + directional. Use `box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.08)`. Never `0 0 20px black`.

## Emphasis
De-emphasize the surroundings instead of pushing the target harder. If the CTA doesn't stand out, tone down everything else first.

## Text
Line-height inversely proportional to font size. Big display type: 1.1-1.2. Body: 1.5-1.7. Long-form: 1.7+.
Never justify. Never center more than 3 lines. Measure ~65 characters per line.

## Buttons
Solid primary, outline secondary, ghost tertiary. Same height, same padding scale. Never three colors on one screen fighting.
