---
name: lean-ux
description: Design through hypothesis, MVP, measure, learn — instead of upfront specs. Use when the team has no time for a full design phase and needs to ship-and-learn.
---

# Lean UX

Design as a hypothesis, not a deliverable. Ship, measure, iterate — instead of specifying, building, launching.

## The Lean UX loop
Assumptions → Hypotheses → MVP → Experiment → Insight → Adjust

## Hypothesis template
> We believe [target user] will [take this action] to achieve [outcome].
> We'll know we're right when we see [measurable signal].

Example: "We believe SaaS founders will connect their Stripe account within 5 minutes of signup to unlock revenue insights. We'll know we're right when Stripe connect rate > 40% in week 1."

## Assumption mapping
Before hypothesizing, list every assumption. Rank by:
- **Risk** (if wrong, how bad?)
- **Certainty** (how sure are we?)

Test the highest-risk, lowest-certainty ones first. That's where learning is cheapest and most valuable.

## MVP != crappy version 1
MVP = smallest experiment that tests the hypothesis. Options:
- Landing page + waitlist (test demand)
- Wizard of Oz (test workflow with human backend)
- Concierge (do it manually for first 10 users)
- Feature flag (test with 5% of existing users)
- Fake door (button that leads to "coming soon" — measure clicks)

## Metrics that matter
- Behavior over opinion (analytics > survey)
- Cohort over average (D7 for users signed up this week)
- Actionable > vanity (activation rate > pageviews)

## Cadence
- 2-week cycles, one hypothesis at a time
- Daily standup: what did we learn yesterday?
- End of cycle: pivot, persevere, or kill

## Anti-patterns
- Full Figma prototype before validating demand
- Feature roadmap based on "customers asked for it" (they don't know)
- A/B testing tiny UI changes when you haven't validated the core proposition
- Confusing "we shipped it" with "we validated it"

## When Lean UX is wrong
- Regulated industries (medical, finance) where wrong = harm
- High switching cost products (must be right first time)
- Brand launches (one shot at first impression)

Otherwise, default to ship-and-learn.
