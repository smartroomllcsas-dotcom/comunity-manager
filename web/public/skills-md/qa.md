---
name: qa
description: Systematic quality assurance pass — cross-browser, cross-device, accessibility, performance, edge cases, error states, empty states, and copy proofread. Use before shipping any user-facing change.
---

# QA (Ship Gate)

Systematic pass before any user-facing ship. Skip = future regret.

## 1. Copy proofread
- Every visible string, including buttons, tooltips, empty states, errors
- Placeholder text ("Lorem", "asdf", "test") in production = fireable offense
- Names of real people, real numbers, real dates
- Grammarly + read aloud

## 2. States (every component)
- Default
- Hover
- Focus (visible ring, WCAG contrast)
- Active/pressed
- Disabled
- Loading (skeleton or spinner)
- Empty (illustration + one clear CTA)
- Error (plain language + recovery path)
- Success (confirmation, next action)

Screenshot each. If a state isn't designed, you're shipping a bug.

## 3. Cross-browser
Minimum: latest Chrome, Safari, Firefox. Priority: Safari (breaks the most). Mobile: iOS Safari + Android Chrome.

Tools: BrowserStack for real devices, Playwright for automated smoke.

## 4. Cross-device
- Mobile (375px — iPhone SE)
- Tablet (768px)
- Laptop (1280px)
- Wide (1920px)
- Ultra-wide (2560px if premium audience)

Rotate device: does landscape work?

## 5. Accessibility
- Keyboard-only navigation completes every task
- Screen reader reads every interactive element meaningfully (VoiceOver on macOS/iOS)
- Color contrast ≥ 4.5:1 body, ≥ 3:1 large text (axe DevTools)
- Focus order is logical
- `prefers-reduced-motion` respected
- Alt text on every content image
- Form labels on every input

## 6. Performance
- Lighthouse ≥ 90 all four categories on mobile
- LCP < 2.5s
- CLS < 0.1
- INP < 200ms
- First real interaction under 3s on 4G

## 7. Edge cases
- Very long user name (30+ chars) — does it break the header?
- Empty list — is there an empty state?
- 1000-item list — does it scroll performant?
- No network — does the app crash or degrade?
- Slow network (Slow 3G) — is there a loading state?
- Timezone edge — does the date show right for Tokyo/LA?
- RTL languages — is the layout mirrored?

## 8. Auth states
- Logged out (public view)
- Logged in (personal view)
- Logged in but session expired mid-action
- Two accounts in two tabs

## 9. Analytics + monitoring
- Events firing correctly (Segment/PostHog debugger)
- Sentry catching errors
- Analytics not double-firing on route change

## 10. Final gates
- No console errors
- No console warnings (or documented ones)
- No 404s in network tab
- No mixed content warnings
- HTTPS everywhere
- All secrets in env, not committed
- Backup/rollback plan exists

Ship checklist: `qa.md` in the repo. Every ship, run through it. Sign off with initials + date.
