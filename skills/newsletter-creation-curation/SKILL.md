---
name: newsletter-creation-curation
description: Industry-adaptive B2B newsletter creation with stage, role, and geography-aware workflows Absorbs email-sequence for lifecycle email sequences.
metadata:
  category: email
---

# Newsletter Creation & Curation Skill

Use this skill to create B2B newsletters that match business context, not generic content templates.

Deep strategic guidance is in `PLAYBOOK.md`.
Use this file as the executable operating manual.

---

## Mode

Detect from context or ask: *"Outline only, full edition, or full edition + calendar?"*

| Mode | What you get | Best for |
|------|-------------|----------|
| `quick` | Edition outline + 3 lead story angles, no writing | Planning, editorial direction |
| `standard` | Full newsletter edition, all sections written | Publishing this week |
| `deep` | Full edition + 4-week content calendar + audience segmentation recommendations | Launching or systematizing a newsletter |

**Default: `standard`** — use `quick` if they're still deciding what to write. Use `deep` if they're building a newsletter from scratch or scaling.

---

## Context Loading Gates

**Before generating any newsletter content, collect:**

- [ ] **Company context:** What product/service? Who is the ICP?
- [ ] **Newsletter goal:** Lead gen / thought leadership / personal brand / category ownership
- [ ] **Industry vertical:** Sales Tech / HR Tech / Fintech / Operations Tech
- [ ] **Company stage:** Series A / Series B / Series C+
- [ ] **Role:** Founder / VP-Director / PMM-Content / Enterprise employee
- [ ] **Geography:** US-first / India-first
- [ ] **Prior issues:** Any existing issues to maintain consistency and voice?
- [ ] **Approval constraints:** Does this need legal/brand/manager review?

**Structured intake — answer all 5 dimensions before proceeding:**

```
Goal: [lead_gen | thought_leadership | personal_brand | category_ownership]
Industry: [sales_tech | hr_tech | fintech | ops_tech]
Stage: [series_a | series_b | series_c_plus]
Role: [founder | vp_director | pmm_content | enterprise_employee]
Geography: [us_first | india_first]
```

---

## Phase 1: Context Analysis

Before drafting, reason through:

1. **Template match:** Which industry template best fits? (Sales Tech = data-heavy; HR Tech = research-led; Fintech = compliance-aware; Ops Tech = practical)
2. **Cadence match:** Series A = weekly/bi-weekly for simplicity; Series B = weekly with process; Series C+ = media-grade weekly with pillars
3. **Role constraints:** Founder = direct POV allowed; Employee = approval checkpoint required before final draft
4. **Geography adjustments:** India-first = IST timing + local examples; US-first = EST/PST + US benchmarks
5. **Goal-content alignment:** Lead gen needs a clear conversion CTA; thought leadership needs original insight, not general content

Output one-line strategy statement:
> `For [ICP], we publish [cadence] to achieve [goal] with [format].`

---

## Phase 2: Issue Blueprint

Before writing full draft, produce an issue blueprint:

```markdown
## Issue Blueprint

**Strategy:** For [ICP], [cadence] to achieve [goal].
**Industry tone:** [tactical/research-led/compliance-aware/practical]
**Approval required:** [yes/no — who]

**Sections:**
1. Subject lines (3 options) — [~words each]
2. Hook — [target ~75 words]
3. Core insight — [target ~200 words]
4. Actionable playbook — [target ~150 words, 3-5 steps]
5. CTA — [1 sentence, singular action]
```

Get confirmation or proceed to draft.

---

## Phase 3: Full Issue Draft

Generate complete publish-ready draft. Required structure — every issue:

### Subject Line Options (3 required)
Produce 3 distinct angles:
- A: Curiosity/open loop ("The metric most [ICP] ignore")
- B: Specific + benefit ("How [Company type] achieves [X] in [timeframe]")  
- C: Contrarian/bold ("Stop [common behavior]. Do this instead.")

### Hook
- First 2 sentences must earn the read
- Lead with the problem + stakes
- Target: busy reader can extract the point in 60 seconds

### Core Insight
- One primary takeaway per issue — not three
- Support with: data, framework, or named pattern
- Include specific numbers or named examples wherever possible

### Actionable Playbook
- 3-5 steps or checklist items
- Each step must be implementable, not just conceptual
- Series A = simpler steps; Series C+ = more sophisticated process

### CTA
- ONE measurable action only
- Options: reply with [X], click [link], share [asset], book [demo]
- Never use vague CTAs ("Learn more")

---

## Phase 4: Refinement Checklist

Run before delivering:

- [ ] `Clarity`: Can a busy reader extract value in 60 seconds?
- [ ] `Specificity`: Does each section include concrete guidance or evidence?
- [ ] `Relevance`: Does tone match industry and role constraints?
- [ ] `Compliance`: For fintech/employee-led, is a legal/manager review step included?
- [ ] `Consistency`: Does voice align with prior issues (if any were provided)?
- [ ] `CTA`: Is there exactly ONE measurable CTA — not two, not zero?

---

## Phase 5: Self-Critique Pass (REQUIRED)

After completing the draft, evaluate:

- [ ] Does the subject line A option create genuine curiosity without being clickbait?
- [ ] Does the hook deliver a problem + stakes in the first 2 sentences?
- [ ] Is the core insight something subscribers couldn't get from a generic AI prompt?
- [ ] Does the playbook have steps that are specific to this audience, not generic "tips"?
- [ ] Is the CTA actually measurable — i.e., can they track whether it worked?
- [ ] For fintech/employee contexts: is there an explicit approval checkpoint?

Flag any issue: "The playbook steps are too generic for a Series B SaaS audience — they read as beginner content. Revised to assume existing process maturity."

---

## Iteration Protocol

After delivering the draft:
1. Ask: "Does the hook earn the read? Does the playbook feel actionable for your audience?"
2. If hook is weak → rewrite using a different angle (data-led, story-led, or contrarian)
3. If playbook is too generic → ask for a specific example from their own experience to ground it
4. For next issue: "Want me to save these content themes so the next issue builds on this one?"

---

## Output Structure

```markdown
## Newsletter Issue: [Name] — Issue #[X] — [Date]
**Strategy:** For [ICP], [cadence] to achieve [goal].

---

### Subject Line Options
A) [Curiosity/open loop]
B) [Specific + benefit]  
C) [Contrarian/bold]
**Recommended:** [A/B/C] — [reason]

---

### Hook
[2-3 sentences — problem + stakes]

---

### Core Insight
[200-300 words — data, framework, or named pattern]

---

### Actionable Playbook
1. [Step]
2. [Step]
3. [Step]

---

### CTA
[Single measurable action]

---

### Distribution Plan
- **Send time:** [Day, Time, Timezone]
- **LinkedIn amplification:** [Post angle / hook]
- **Secondary channel:** [Platform + angle]

### KPI Targets
- Open rate goal: [%]
- CTR goal: [%]
- Primary metric: [SQLs / subscribers / replies]

### Approval Required
[Yes — [who] | No]

### Self-Critique Notes
[Issues flagged + revisions made]
```

---

## Playbook Map (Deep Dives in `PLAYBOOK.md`)

- Sales Tech strategy: `SECTION A`
- HR Tech strategy: `SECTION B`
- Fintech strategy: `SECTION C`
- Operations Tech strategy: `SECTION D`
- Role approvals and geography tactics: `CROSS-CUTTING: UNIVERSAL FRAMEWORKS`

---

*Skill by Brian Wagner | AI Marketing Architect | brianrwagner.com*

## Absorbed from `email-sequence`

You are an expert in email marketing and automation. Your goal is to create email sequences that nurture relationships, drive action, and move people toward conversion.

### Initial Assessment

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

Before creating a sequence, understand:

1. **Sequence Type**
   - Welcome/onboarding sequence
   - Lead nurture sequence
   - Re-engagement sequence
   - Post-purchase sequence
   - Event-based sequence
   - Educational sequence
   - Sales sequence

2. **Audience Context**
   - Who are they?
   - What triggered them into this sequence?
   - What do they already know/believe?
   - What's their current relationship with you?

3. **Goals**
   - Primary conversion goal
   - Relationship-building goals
   - Segmentation goals
   - What defines success?

---

### Core Principles
→ See references/email-sequence-playbook.md for details

### Output Format

#### Sequence Overview
```
Sequence Name: [Name]
Trigger: [What starts the sequence]
Goal: [Primary conversion goal]
Length: [Number of emails]
Timing: [Delay between emails]
Exit Conditions: [When they leave the sequence]
```

#### For Each Email
```
Email [#]: [Name/Purpose]
Send: [Timing]
Subject: [Subject line]
Preview: [Preview text]
Body: [Full copy]
CTA: [Button text] → [Link destination]
Segment/Conditions: [If applicable]
```

#### Metrics Plan
What to measure and benchmarks

---

### Task-Specific Questions

1. What triggers entry to this sequence?
2. What's the primary goal/conversion action?
3. What do they already know about you?
4. What other emails are they receiving?
5. What's your current email performance?

---

### Tool Integrations

For implementation, see the [tools registry](../../tools/REGISTRY.md). Key email tools:

| Tool | Best For | MCP | Guide |
|------|----------|:---:|-------|
| **Customer.io** | Behavior-based automation | - | [customer-io.md](../../tools/integrations/customer-io.md) |
| **Mailchimp** | SMB email marketing | ✓ | [mailchimp.md](../../tools/integrations/mailchimp.md) |
| **Resend** | Developer-friendly transactional | ✓ | [resend.md](../../tools/integrations/resend.md) |
| **SendGrid** | Transactional email at scale | - | [sendgrid.md](../../tools/integrations/sendgrid.md) |
| **Kit** | Creator/newsletter focused | - | [kit.md](../../tools/integrations/kit.md) |

---

### Related Skills

- **cold-email** — WHEN the sequence targets people who have NOT opted in (outbound prospecting). NOT for warm leads or subscribers who have expressed interest.
- **copywriting** — WHEN landing pages linked from emails need copy optimization that matches the email's message and audience. NOT for the email copy itself.
- **launch-strategy** — WHEN coordinating email sequences around a specific product launch, announcement, or release window. NOT for evergreen nurture or onboarding sequences.
- **analytics-tracking** — WHEN setting up email click tracking, UTM parameters, and attribution to connect email engagement to downstream conversions. NOT for writing or designing the sequence.
- **onboarding-cro** — WHEN email sequences are supporting a parallel in-app onboarding flow and need to be coordinated to avoid duplication. NOT as a replacement for in-app onboarding experience.

---

### Communication

Deliver email sequences as complete, ready-to-send drafts — include subject line, preview text, full body, and CTA for every email in the sequence. Always specify the trigger condition and send timing. When the sequence is long (5+ emails), lead with a sequence overview table before individual emails. Flag if any email could conflict with other sequences the audience receives. Load `marketing-context` for brand voice, ICP, and product context before writing.

---

### Proactive Triggers

- User mentions low trial-to-paid conversion → ask if there's a trial expiration email sequence before recommending in-app or pricing changes.
- User reports high open rates but low clicks → diagnose email body copy and CTA specificity before blaming subject lines.
- User wants to "do email marketing" → clarify sequence type (welcome, nurture, re-engagement, etc.) before writing anything.
- User has a product launch coming → recommend coordinating launch email sequence with in-app messaging and landing page copy for consistent messaging.
- User mentions list is going cold → suggest re-engagement sequence with progressive offers before recommending acquisition spend.

---

### Output Artifacts

| Artifact | Description |
|----------|-------------|
| Sequence Architecture Doc | Trigger, goal, length, timing, exit conditions, and branching logic for the full sequence |
| Complete Email Drafts | Subject line, preview text, full body, and CTA for every email in the sequence |
| Metrics Benchmarks | Open rate, click rate, and conversion rate targets per email type and sequence goal |
| Segmentation Rules | Audience entry/exit conditions, behavioral branching, and suppression lists |
| Subject Line Variations | 3 subject line alternatives per email for A/B testing |
