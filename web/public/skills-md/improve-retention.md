---
name: improve-retention
description: Diagnose and fix retention drop-off — D1/D7/D30 curves, aha-moment definition, activation events, reactivation campaigns, and churn cohort analysis. Use when growth stalls despite steady acquisition.
---

# Improve Retention

Retention is the only metric that matters. Growth without it is a bucket with a hole.

## The retention curve
Plot % of new users still active on day N. Three outcomes:
- **Smiling curve** (drops, then rises): product-market fit exists somewhere
- **Flat curve** (levels off > 20% by D30): you have a business
- **Decaying curve** (goes to 0): you don't yet — fix before spending on acquisition

## Diagnose in this order

### 1. Define the aha moment
The single event that, once done, retention shoots up. Facebook: 7 friends in 10 days. Slack: 2,000 messages sent. Dropbox: 1 file in 1 folder on 1 device.
Look at the retention curve for users who did X in the first week vs those who didn't. Find X.

### 2. Measure time-to-aha
Median time from signup to the aha event. Every hour matters. Every extra step drops retention 5-20%.

### 3. Rebuild onboarding around aha
Onboarding's only job is to deliver the aha moment as fast as possible. Not a product tour. Not a video. The event.

### 4. Reactivation loops
- Day 1: transactional (welcome, next step)
- Day 3: value reminder (what they haven't tried)
- Day 7: social (someone did X)
- Day 14: winback (miss you, here's what's new)
- Day 30: last touch, then drop from list

### 5. Cohort analysis
Compare cohorts by:
- Signup source (paid vs organic vs referral)
- Feature adoption (used X in week 1 vs didn't)
- First device (mobile vs desktop)
- Sign-up path (Google auth vs email)

Best cohort = double down on that acquisition channel + replicate that onboarding.

## Habit loops (once retention exists)
Trigger → action → variable reward → investment. Add these to increase D30:
- Streaks that break if user disappears
- Content that gets better with usage (feed, recs)
- Social investment (followers, saved lists, notes)

## Red flags
- Retention curve doesn't asymptote — you have no PMF
- D1 > 50% but D7 < 10% — onboarding delivers, product doesn't
- D30 = D90 = D180 — stable but small user base, ceiling reached, expand ICP
