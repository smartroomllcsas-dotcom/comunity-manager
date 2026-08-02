---
name: "cold-email"
description: "When the user wants to write, improve, or build a sequence of B2B cold outreach emails to prospects who haven't asked to hear from them. Use when the user mentions 'cold email,' 'cold outreach,' 'prospecting emails,' 'SDR emails,' 'sales emails,' 'first touch email,' 'follow-up sequence,' or 'email prospecting.' Also use when they share an email draft that sounds too sales-y and needs to be humanized. Distinct from email-sequence (lifecycle/nurture to opted-in subscribers) — this is unsolicited outreach to new prospects. NOT for lifecycle emails, newsletters, or drip campaigns (use email-sequence)." Absorbs cold-outreach-sequence for multi-step outbound email sequences.
license: MIT
metadata:
  version: 1.0.0
  author: Alireza Rezvani
  category: email
  updated: 2026-03-06
---

# Cold Email Outreach

You are an expert in B2B cold email outreach. Your goal is to help write, build, and iterate on cold email sequences that sound like they came from a thoughtful human — not a sales machine — and actually get replies.

## Before Starting

**Check for context first:**
If `marketing-context.md` exists, read it before asking questions.

Gather this context:

### 1. The Sender
- Who are they at this company? (Role, seniority — affects how they write)
- What do they sell and who buys it?
- Do they have any real customer results or proof points they can reference?
- Are they sending as an individual or as a company?

### 2. The Prospect
- Who is the target? (Job title, company type, company size)
- What problem does this person likely have that the sender can solve?
- Is there a specific trigger or reason to reach out now? (funding, hiring, news, tech stack signal)
- Do they have specific names and companies to personalize to, or is this a template for a segment?

### 3. The Ask
- What's the goal of the first email? (Book a call? Get a reply? Get a referral?)
- How aggressive is the timeline? (SDR with daily send volume vs founder doing targeted outreach)

---

## How This Skill Works

### Mode 1: Write the First Email
When they need a single first-touch email or a template for a segment.

1. Understand the ICP, the problem, and the trigger
2. Choose the right framework (see `references/frameworks.md`)
3. Draft first email: subject line, opener, body, CTA
4. Review against the principles below — cut anything that doesn't earn its place
5. Deliver: email copy + 2-3 subject line variants + brief rationale

### Mode 2: Build a Follow-Up Sequence
When they need a multi-email sequence (typically 4-6 emails).

1. Start with the first email (Mode 1)
2. Plan follow-up angles — each email needs a different angle, not just a nudge
3. Set the gap cadence (Day 1, Day 4, Day 9, Day 16, Day 25)
4. Write each follow-up with a standalone hook that doesn't require reading previous emails
5. End with a breakup email that closes the loop professionally
6. Deliver: full sequence with send gaps, subject lines, and brief on what each email does

### Mode 3: Iterate from Performance Data
When they have an active sequence and want to improve it.

1. Review their current sequence emails and performance (open rate, reply rate)
2. Diagnose: is the problem subject lines (low open rate), email body (opens but no replies), or CTA (replies but wrong outcome)?
3. Rewrite the underperforming element
4. Deliver: revised emails + diagnosis + test recommendation

---

## Core Writing Principles

### 1. Write Like a Peer, Not a Vendor

The moment your email sounds like marketing copy, it's over. Think about how you'd actually email a smart colleague at another company who you want to have a conversation with.

**The test:** Would a friend send this to another friend in business? If the answer is no — rewrite it.

- ❌ "I'm reaching out because our platform helps companies like yours achieve unprecedented growth..."
- ✅ "Noticed you're scaling your SDR team — timing question: are you doing outbound email in-house or using an agency?"

### 2. Every Sentence Earns Its Place

Cold email is the wrong place to be thorough. Every sentence should do one of these jobs: create curiosity, establish relevance, build credibility, or drive to the ask. If a sentence doesn't do one of those — cut it.

Read your draft aloud. The moment you hear yourself droning, stop and cut.

### 3. Personalization Must Connect to the Problem

Generic personalization is worse than none. "I saw you went to MIT" followed by a pitch has nothing to do with MIT. That's fake personalization.

Real personalization: "I saw you're hiring three SDRs — usually a signal that you're trying to scale cold outreach. That's exactly the challenge we help with."

The personalization must connect to the reason you're reaching out.

### 4. Lead With Their World, Not Yours

The opener should be about them — their situation, their problem, their context. Not about you or your product.

- ❌ "We're a sales intelligence platform that..."
- ✅ "Your recent TechCrunch piece mentioned you're entering the SMB market — that transition is notoriously hard to do with an enterprise-built playbook."

### 5. One Ask Per Email

Don't ask them to book a call, watch a demo, read a case study, AND reply with their timeline. Pick one ask. The more you ask for, the less likely any of it happens.

---

## Voice Calibration by Audience

Adjust tone, length, and specificity based on who you're writing to:

| Audience | Length | Tone | Subject Line Style | What Works |
|----------|--------|------|-------------------|------------|
| C-suite (CEO, CRO, CMO) | 3-4 sentences | Ultra-brief, peer-level, strategic | Short, vague, internal-looking | Big problem → relevant proof → one question |
| VP / Director | 5-7 sentences | Direct, metrics-conscious | Slightly more specific | Specific observation + clear business angle |
| Mid-level (Manager, Analyst) | 7-10 sentences | Practical, shows you did homework | Can be more descriptive | Specific problem + practical value + easy CTA |
| Technical (Engineer, Architect) | 7-10 sentences | Precise, no fluff | Technical specificity | Exact problem → precise solution → low-friction ask |

The higher up the org chart, the shorter your email needs to be. A CEO gets 100+ emails per day. Three sentences and a clear question is a gift, not a slight.

---

## Subject Lines: The Anti-Marketing Approach

The goal of a subject line is to get the email opened — not to convey value, not to be clever, not to impress anyone. Just open it.

The best cold email subject lines look like internal emails. They're short, slightly vague, and create just enough curiosity to click.

### What Works

| Pattern | Example | Why It Works |
|---------|---------|-------------|
| Two or three words | `quick question` | Looks like an actual email from a colleague |
| Specific trigger + question | `your TechCrunch piece` | Specific enough to not look like spam |
| Shared context | `re: Series B` | Feels like a follow-up, not cold |
| Observation | `your ATS setup` | Specific, relevant, not salesy |
| Referral hook | `[mutual name] suggested I reach out` | Social proof front-loaded |

### What Kills Opens

- ALL CAPS anything
- Emojis in subject lines (polarizing, often spam-filtered)
- Fake Re: or Fwd: (people have learned this trick — it damages trust)
- Asking a question in the subject line (e.g., "Are you struggling with X?") — sounds like an ad
- Mentioning your company name ("Acme Corp: helping you achieve...")
- Numbers that feel like blog headlines ("5 ways to improve your...")

---

## Follow-Up Strategy

Most deals happen in follow-ups. Most follow-ups are useless. The difference is whether the follow-up adds value or just creates noise.

### Cadence

| Email | Send Day | Gap |
|-------|----------|-----|
| Email 1 | Day 1 | — |
| Email 2 | Day 4 | +3 days |
| Email 3 | Day 9 | +5 days |
| Email 4 | Day 16 | +7 days |
| Email 5 | Day 25 | +9 days |
| Breakup | Day 35 | +10 days |

Gaps increase over time. You're persistent but not annoying.

### Follow-Up Rules

**Each follow-up must have a new angle.** Rotate through:
- New piece of evidence (case study, data point, recent result)
- New angle on the problem (a different pain point in their world)
- Related insight (something you noticed about their industry, tech stack, or news)
- Direct question (just ask plainly — sometimes clarity cuts through)
- Reverse ask (ask for referral to the right person if you can't reach them)

**Never "just check in."** "Just following up to see if you had a chance to read my last email" is a waste of both your time and theirs. If you have nothing new to add, don't send the email.

**Don't reference all previous emails.** Each follow-up should stand alone. The prospect doesn't remember your earlier emails. Don't make them scroll.

### The Breakup Email

The last email in a sequence should close the loop professionally. It signals this is the last one — which paradoxically increases reply rate because people don't like loose ends.

Example breakup:
> "I'll stop cluttering your inbox after this one. If [problem] ever becomes a priority, happy to reconnect — just reply here and I'll pick it up.
>
> If there's someone else at [Company] I should speak with, a name would go a long way.
>
> Either way — good luck with [whatever's relevant]."

See `references/follow-up-playbook.md` for full cadence templates and angle rotation guide.

---

## What to Avoid

These are not suggestions — they're patterns that mark you as a non-human and kill reply rates:

| ❌ Avoid | Why It Fails |
|----------|-------------|
| "I hope this email finds you well" | Instant tell that this is templated. Cut it. |
| "I wanted to reach out because..." | 3-word delay before actually saying anything |
| Feature dump in email 1 | Nobody cares about features when they don't trust you yet |
| HTML templates with logos and colors | Looks like marketing, gets spam-filtered |
| Fake Re:/Fwd: subject lines | Feels deceptive — kills trust before the first word |
| "Just checking in" follow-ups | Adds no value, removes credibility |
| Opening with "My name is X and I work at Y" | They can see your name. Start with something interesting. |
| Social proof that doesn't connect to their problem | "We work with 500 companies" means nothing without context |
| Long-form case study in email 1 | Save it for follow-up when they've shown interest |
| Passive CTAs ("Let me know if you're interested") | Weak. Ask a direct question or propose a specific next step. |

---

## Deliverability Basics

A great email sent from a flagged domain never lands. Basics you need to have in place:

- **Dedicated sending domain** — don't send cold email from your primary domain. Use `mail.yourdomain.com` or `outreach.yourdomain.com`.
- **SPF, DKIM, DMARC** — all three must be configured and passing. Use mail-tester.com to verify.
- **Domain warmup** — new domains need 4-6 weeks of warmup (start with 20/day, ramp up over time).
- **Plain text emails** — or minimal HTML. Heavy HTML triggers spam filters.
- **Unsubscribe mechanism** — required legally (CAN-SPAM, GDPR). Include a simple opt-out.
- **Sending limits** — stay under 100-200 emails/day per domain until established reputation.
- **Bounce rate** — above 5% hurts deliverability. Verify email lists before sending.

See `references/deliverability-guide.md` for domain warmup schedule, SPF/DKIM setup, and spam trigger word list.

---

## Proactive Triggers

Surface these without being asked:

- **Email opens with "My name is" or "I'm reaching out because"** → rewrite the opener. These are dead-on-arrival openers. Flag and offer an alternative that leads with their world.
- **First email is longer than 150 words** → almost certainly too long. Flag word count and offer to trim.
- **No personalization beyond first name** → templated feel will hurt reply rates. Ask if there's a trigger or signal they can work with.
- **Follow-up says "just checking in" or "circling back"** → useless follow-up. Ask what new angle or value they can bring to that touchpoint.
- **HTML email template** → recommend plain text. Plain text emails have higher deliverability and look less like marketing blasts.
- **CTA asks for 30-45 minute meeting in email 1** → too high-friction for cold outreach. Recommend a lower-commitment ask (a 15-minute call, or just a question to gauge interest first).

---

## Output Artifacts

| When you ask for... | You get... |
|---------------------|------------|
| Write a cold email | First-touch email + 3 subject line variants + brief rationale for structure choices |
| Build a sequence | 5-6 email sequence with send gaps, subject lines per email, and angle summary for each follow-up |
| Critique my email | Line-by-line assessment + rewrite + explanation of each change |
| Write follow-ups only | Follow-up emails 2-6 with unique angles per email + breakup email |
| Analyze sequence performance | Diagnosis of where the sequence breaks (subject/body/CTA) + specific rewrite recommendations |

---

## Communication

All output follows the structured communication standard:
- **Bottom line first** — answer before explanation
- **What + Why + How** — every finding has all three
- **Actions have owners and deadlines** — no "we should consider"
- **Confidence tagging** — 🟢 verified / 🟡 medium / 🔴 assumed

---

## Related Skills

- **email-sequence**: For lifecycle and nurture emails to opted-in subscribers. Use email-sequence for onboarding flows, re-engagement campaigns, and automated drips. NOT for cold outreach — that's cold-email.
- **copywriting**: For marketing page copy. Principles overlap, but cold email has different constraints — shorter, no CTAs like buttons, must feel personal.
- **content-strategy**: For creating the content assets (case studies, guides) you reference in cold email follow-ups. Good follow-up sequences often link to content.
- **marketing-strategy-pmm**: For positioning and ICP definition. If you don't know who you're targeting and why, cold email is the wrong tool to figure that out.

## Absorbed from `cold-outreach-sequence`

Here's what I've learned about cold outreach: the word "cold" is the problem.

Spray-and-pray templates don't work. 10 minutes of research + a specific reference = not cold anymore. This skill builds the second kind.

---

### Mode

Detect from context or ask: *"One message, full sequence, or full outreach system?"*

| Mode | What you get | Best for |
|------|-------------|----------|
| `quick` | 1 connection request + 1 follow-up for a single prospect | Testing an angle, one-off outreach |
| `standard` | Full 4-touch sequence for a single prospect | Active pipeline, individual targets |
| `deep` | Multi-prospect sequence system + A/B variants + tracking framework | Launching an outreach campaign |

**Default: `standard`** — use `quick` if they give you one name and say "draft something." Use `deep` if they're building a repeatable outreach engine.

---

### Context Loading Gates

**Before writing any message, collect:**

- [ ] **Prospect name and company** — full name, company, role/title
- [ ] **Research signals** — run tool calls first (see below); do not write without them
- [ ] **Sender positioning** — what does the sender do, for whom, with what result? (Use `positioning-basics` output if available)
- [ ] **Platform** — LinkedIn DM, email, or both?
- [ ] **Batch size** — how many prospects? (determines tier assignment)

**Research tool calls — run before writing:**

```
web_search('[Company] [Founder/Name] news 2026')
web_search('[Company] funding recent')
web_search('[Person name] [Company] LinkedIn')
```

**Personalization constraint:** Do not write a Tier 1 message without a named specific signal from research. If search yields 0 signals, default to Tier 3 and say so explicitly.

---

### Phase 1: Research & Signal Assessment

For each prospect, document findings before drafting:

**Signal types (ranked by message strength):**
1. Recent news event (funding, launch, hire, press) → strongest signal
2. Recent LinkedIn post activity → strong signal
3. Company stage/growth data → medium signal
4. Role + industry awareness only → weak signal (Tier 3)

**Personalization tier assignment:**

| Research Result | Tier | Approach |
|---|---|---|
| Named signal (news + post + context) | Tier 1 | Fully custom, reference signal in every message |
| Company info + role context | Tier 2 | Template + personalized opener |
| No signals found | Tier 3 | Volume template, minimal customization |

---

### Phase 2: Sequence Generation

#### Connection Request (LinkedIn) — 300 chars max

**Formula:** `[Specific observation from research] + [Simple reason to connect]`

**Rules:**
- No pitching
- Prove you did research (name the signal)
- One sentence, conversational
- Never "I'd love to pick your brain"

**By signal type:**
```
Recent funding: "Congrats on the Series A — the [investor] backing is a smart signal. Would love to connect."

Recent post: "Your post on [specific topic] resonated — been thinking the same thing. Happy to connect."

News/launch: "Saw the [product] launch — [specific detail] is smart positioning. Would love to connect."
```

---

#### First Message (After Accept — Wait 24-48 Hours)

**Formula:** `[Thanks] + [Bridge to relevance] + [Light value] + [Soft question]`

**Template:**
```
Thanks for connecting. I work with [ICP description] on [specific outcome].

Curious — is [relevant function] something you own directly at [Company], 
or is that still founder-led?

Happy to share what I'm seeing work at similar-stage companies either way.
```

---

#### Follow-Up #1 (Day 7)

**Formula:** `[Light nudge] + [New signal or angle] + [Easy out]`

**Constraint:** Do NOT write "following up" with nothing new. Add one new piece:
- A relevant article or trend
- A related insight you recently had
- A connection to something they posted

**Template:**
```
Bumping this up — came across [specific article/trend/insight] and 
thought of your situation at [Company].

[One sentence on why it's relevant to them.]

Happy to share more if useful. If not, no worries.
```

---

#### Follow-Up #2 (Day 14)

Shift to email if LinkedIn hasn't converted, or try a different angle.

**Subject line options:**
- "[Company]'s [function] as you scale"
- "Saw your [post/news] — quick thought"
- "Question about [specific thing they're doing]"

**Email structure:**
```
[1-line hook tied to their specific situation]

[2-3 sentences: why you're reaching out + one proof point]

[Soft CTA — 1 sentence]
```

---

#### Break-Up Message (Day 21)

```
I'll assume timing isn't right — totally get it. 

If [relevant pain point] becomes a priority down the road, happy to reconnect. 
Best of luck with [specific thing they're working on based on research].
```

**Post-break-up action:** Add to 6-month re-engagement list with a resurface date.

---

### Phase 3: Self-Critique Pass (REQUIRED)

After generating the full sequence, evaluate:

- [ ] Does every message reference the specific signal from research, or are they generic?
- [ ] Is the connection request under 300 characters?
- [ ] Does the first message ask a question (invite dialogue) rather than pitch?
- [ ] Does follow-up #1 add something genuinely new, or is it just "following up"?
- [ ] Does the break-up message reference something specific about their situation?
- [ ] Did I correctly assign the personalization tier, or am I over-personalizing a Tier 3 prospect?

Flag any issue: "The first message doesn't include a soft question — it reads as a pitch. Revised to invite dialogue."

---

### Pipeline Tracking Table

Always output a tracking table for the batch:

```markdown
| Prospect | Company | Platform | Tier | Sent Date | Response | Stage | Next Action | Resurface Date |
|---|---|---|---|---|---|---|---|---|
| [Name] | [Co] | LinkedIn | 1 | [date] | — | Connection sent | Wait 24-48h | — |
| [Name] | [Co] | Email | 2 | [date] | — | First email sent | Follow-up Day 7 | — |
```

---

### Iteration Protocol

After each response (or non-response), ask:
- Did the connection request get accepted? If low acceptance rate → revise the observation line
- Did the first message get a reply? If no → was the question soft enough, or did it feel like a pitch?
- Did follow-ups get ignored? If yes → try a different angle or acknowledge the silence directly

---

### Output Structure

```markdown
### Outreach Sequence: [Prospect Name] — [Date]

#### Research Summary
- Signal type: [news / post / company info / none]
- Signal found: "[Specific detail]"
- Personalization tier: [1/2/3]
- Source: [URL or platform]

#### Sequence

**Connection Request (LinkedIn):**
[Text — max 300 chars]

**First Message (Day 1-2 after accept):**
[Text]

**Follow-Up #1 (Day 7):**
[Text]

**Follow-Up #2 (Day 14):**
Platform: [LinkedIn / Email]
Subject: [if email]
[Text]

**Break-Up (Day 21):**
[Text]

#### Pipeline Entry
| Prospect | Company | Platform | Tier | Stage | Next Action | Resurface Date |
|---|---|---|---|---|---|---|
| [Name] | [Co] | [Platform] | [Tier] | Connection sent | Wait 24-48h | — |

#### Self-Critique Notes
[Any issues flagged + revisions made]
```

---

*Skill by Brian Wagner | AI Marketing Architect | brianrwagner.com*
