---
name: taste-skill
description: Frontend output that doesn't look like AI generated it. Removes the tells: identical padding everywhere, gradient buttons, hero + 3 feature cards, purple-to-pink gradients, emoji-in-headings.
---

# Taste

AI-generated UIs have tells. Remove them.

## The tells (never ship these)
- Purple → pink gradient anywhere
- Emoji in H1s (🚀 Launch faster)
- "Powered by AI" copy
- Hero + exactly 3 feature cards in a row
- All buttons rounded-lg with a subtle shadow
- Dark mode toggle in the header nobody asked for
- Fake testimonials with initials avatars in soft pastels
- "Get started in seconds" as the CTA
- Symmetric everything

## The taste moves
- **Asymmetric grids**: 5-7 columns, span unevenly. Not 3-3-3-3.
- **Real photos or real illustrations**: no stock, no gradient blobs, no Meshy.
- **Weird ratios**: 21:9 hero, 4:5 cards, one image bleeds edge.
- **One serif somewhere**: even a techy product benefits from a serif in a pullquote or number.
- **Small type is fine**: dense sidebars, footnotes, meta rows. AI defaults to giant everything.
- **Muted palettes with one saturated accent**: not five colors competing.
- **Break the grid once per page**: rotated card, offset image, negative-margin overlap.

## Copy tells
- Nobody says "Elevate your workflow"
- Nobody says "Seamlessly integrate"
- Nobody says "Empower your team"
- Real copy is specific: "Turn 40 hours of research into a 6-page brief"

## Interaction tells
- Hover states that only change opacity are lazy
- Every card lifting on hover = amateur
- Buttons with `scale(1.05)` on hover = amateur
- Instead: color shift + subtle underline + arrow icon translate

Ship taste, not defaults.
