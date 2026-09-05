---
name: microinteractions
description: Design and implement microinteractions — button feedback, form validation, toggle states, loading transitions, hover reveals. Use when a UI feels dead or unresponsive.
---

# Microinteractions

The tiny details that separate a $10 template from a $10k product.

## The four parts (Dan Saffer)
1. **Trigger**: what starts it (click, hover, scroll, time)
2. **Rules**: what happens
3. **Feedback**: what the user sees/feels/hears
4. **Loops & modes**: how it changes over time or on repeat

## Rules of thumb
- Duration: 150-400ms for most UI. 200ms is the safe default.
- Easing: never linear. Use `cubic-bezier(.2,.8,.2,1)` for enter, `cubic-bezier(.4,0,1,1)` for exit.
- Feedback is instant (<100ms), completion is animated (200-400ms).
- Group animations stagger by 30-50ms.

## Where microinteractions earn their keep
- **Buttons**: pressed state (translate 1px + darken), loading spinner replaces label, success morph to checkmark
- **Forms**: field validation on blur not on every keystroke, error shakes once, success ticks
- **Toggles**: physical feel — thumb glides with slight overshoot
- **Toasts**: slide + fade, auto-dismiss with visible progress bar
- **Empty states**: illustration + one clear CTA, never just "No data"
- **Loading**: skeleton screens, not spinners, for content > 500ms
- **Refresh/sync**: pull-to-refresh with rubber-band, spinner morphs into checkmark
- **Optimistic UI**: apply the change immediately, revert on error with animation

## Sound
Rarely used, but: send confirmation, error, message-received — 3 subtle sounds max. Never on hover.

## Reduced motion
`@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`

## What to skip
- Splash screens
- Loading animations on cached content
- Hover effects on touch devices
- Anything that delays the user's next action
