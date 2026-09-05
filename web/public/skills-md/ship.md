---
name: ship
description: Final publication pass — merge, deploy, monitor, announce. Use to close out a feature branch and put changes in front of real users. Includes rollback plan and post-deploy verification.
---

# Ship

The last mile. Merging is not shipping. Shipping is when real users are using it, safely.

## Pre-ship (branch is green, PR approved)

1. **Rebase on main** to catch drift
2. **Full test suite passes locally** (not just CI — some tests only fail on your machine)
3. **Manual smoke** on the actual feature, in a browser
4. **Changelog entry** written (user-facing language, not commit messages)
5. **Rollback plan** documented — one command to revert, tested if risky

## The ship

### For static/frontend (Vercel, Netlify, Cloudflare Pages)
1. Merge PR to main → auto-deploy triggers
2. Watch deploy log until green
3. Preview URL smoke test before promoting to production if platform supports it
4. Promote to production
5. Hit the production URL yourself in a fresh browser (incognito, cleared cache)

### For backend (containers, functions, servers)
1. Deploy to staging first — never straight to prod
2. Run integration tests against staging
3. Canary to 5% of prod traffic, watch error rate for 15 min
4. Promote to 100% if error rate baseline
5. Watch metrics for 30 min: latency P50/P99, error rate, throughput

### For DB migrations
1. Always backwards-compatible (old code + new schema must work)
2. Deploy migration first, code second, cleanup migration third
3. Never `DROP` in the same deploy as the code that stops using the column — wait a week

## Post-ship (within 1 hour)

### Verify in production
- Feature works for a real user (you, in incognito)
- Analytics events firing
- No spike in error rate (Sentry, Datadog, whatever you use)
- Performance not regressed (Web Vitals dashboard)

### Announce
- Internal: Slack/Discord team channel with 3-line summary + link
- External (if user-facing): changelog / in-app notification / email if material
- Customer support briefed if it changes any workflow

### Monitor for 24 hours
- Error rate on the affected endpoints
- Support tickets mentioning the feature
- Analytics on the new flow (usage vs. expectation)

## Rollback triggers
Roll back immediately if any of:
- Error rate > 2x baseline for > 5 min
- P99 latency > 2x baseline for > 5 min
- Any data corruption
- Any user reports of broken workflow
- Any security concern

Rollback is not failure. Not rolling back when you should is failure.

## Post-mortem trigger
If ship caused any incident:
- 24 hours: write incident report (what happened, timeline, root cause, action items)
- 1 week: implement top action item
- Blameless: focus on system, not person

## The Friday rule
Never ship on Friday afternoon unless: (a) hotfix, (b) you're on-call all weekend.

## Ship checklist artifact
Keep `ship.md` in every repo:
```
[ ] Rebased on main
[ ] Tests pass locally
[ ] Manual smoke done
[ ] Changelog entry
[ ] Rollback plan
[ ] Announcement drafted
[ ] Monitoring dashboards open
```
