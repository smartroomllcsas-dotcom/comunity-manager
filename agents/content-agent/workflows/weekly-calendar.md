# Weekly Calendar Workflow

**Default Mode:** B (Approval)
**Estimated Duration:** 45-60 minutes
**Agent:** content-agent

This workflow generates a full week of content across all active platforms, respecting pillar distribution, format variety, and platform-native rules.

---

## Step 1: Review Last Week Performance

Pull performance data from the previous week:

- Which posts performed above/below average
- Top-performing pillar, format, and platform
- Engagement rate trends
- Any content gaps or missed slots

Use this data to inform the upcoming week's calendar — lean into what works, adjust what doesn't.

## Step 2: Generate Calendar Structure

Build the weekly calendar as a structured table:

| Day | Platform | Pillar | Format | Topic | Time |
|-----|----------|--------|--------|-------|------|
| Mon | Instagram | Education | Carousel | ... | 10:00 |
| Mon | Twitter/X | Authority | Thread | ... | 12:00 |
| Tue | LinkedIn | Case Study | Post | ... | 08:00 |
| ... | ... | ... | ... | ... | ... |

### Calendar Rules

1. **Respect pillar percentages** — distribute content pillars according to the ratios defined in the client's content strategy (e.g., 40% education, 25% authority, 20% engagement, 15% promotion)
2. **Vary formats** — do not repeat the same format on the same platform two days in a row (e.g., no carousel Monday + carousel Tuesday on Instagram)
3. **No identical content same day** — if posting to multiple platforms on the same day, each post must have a distinct angle or topic. Same core message is fine, but execution must differ.
4. **2-hour spacing** — maintain a minimum 2-hour gap between posts on the same platform to avoid audience fatigue and algorithm penalties

## Step 3: Generate Content Per Slot

For each slot in the calendar:

1. Run `content-idea-generator` to refine the topic into a specific angle and hook
2. Run `social-content` to draft the platform-native post
3. Run `social-card-gen` to generate visual variants (image prompts, card layouts)
4. **Twitter/X only:** Run `tweet-draft-reviewer` to score the draft
   - Must score **7 or higher** out of 10
   - If score < 7, auto-rewrite and re-score (max 2 attempts)
   - If still < 7 after 2 rewrites, flag for manual review

## Step 4: Quality Pass

Run all generated content through the quality gates defined in `quality-gates.md`.

- Use **batch processing mode** for calendars with 7+ posts
- All 7 gates must pass before content moves to approval
- Auto-fix is attempted once per failure; persistent failures are flagged

See `quality-gates.md` for full gate definitions and batch processing flow.

## Step 5: Present for Approval

Present the complete calendar to the user with three options:

- **Approve All** — all posts move to scheduling
- **Approve Some** — user selects which posts to approve; rejected posts return to Step 3 for revision
- **Reject** — entire calendar returns to Step 2 with user feedback for restructuring

Each post in the approval view shows:
- Platform, day, and time
- Full post text
- Visual asset preview or image prompt
- Quality gate scores (brand voice %, AI detection %, content score)

## Step 6: Schedule Output

For all approved posts, generate schedule-ready output compatible with Buffer/Later:

- Post text (platform-native)
- Image/asset references
- Scheduled date and time
- Platform target
- Any platform-specific metadata (hashtags, first comment, alt text)

Output format should be structured JSON or CSV ready for import into the scheduling tool.
