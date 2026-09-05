---
name: ux-heuristics
description: Audit a UI against Nielsen's 10 usability heuristics plus Krug and Norman principles. Use for structured UX reviews, PR sign-offs, or before shipping user-facing features.
---

# UX Heuristics Audit

Structured audit based on Jakob Nielsen's 10 heuristics + Steve Krug + Don Norman.

## Nielsen's 10 (use as a checklist)

1. **Visibility of system status**: does the user always know what's happening? (loading, saved, offline)
2. **Match the real world**: uses the user's language, not developer jargon
3. **User control and freedom**: undo, back, cancel — always visible
4. **Consistency and standards**: cmd+K opens search everywhere, not just here
5. **Error prevention**: confirm destructive actions, disable invalid states
6. **Recognition over recall**: show, don't make them remember
7. **Flexibility and efficiency**: shortcuts for pros, discoverable for novices
8. **Aesthetic and minimalist design**: every element must earn its space
9. **Help users recover from errors**: plain language, next step, no error codes alone
10. **Help and documentation**: contextual, searchable, task-oriented

## Krug's 3 rules
- Don't make me think
- It doesn't matter how many clicks, as long as each is mindless
- Get rid of half the words on every page, then get rid of half of what's left

## Norman's signifiers
- Affordances: does it *look* clickable?
- Feedback: did anything happen when I clicked?
- Mapping: does layout match mental model? (volume up = up)
- Constraints: prevent invalid input structurally

## Audit output format
For each issue found:
- **Severity**: 1 cosmetic, 2 minor, 3 major, 4 catastrophic
- **Heuristic violated**
- **Location** (page/component)
- **Recommendation** (specific fix, not "improve UX")
- **Effort estimate** (S/M/L)

Deliver as a table sorted by severity desc, then effort asc.
