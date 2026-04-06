# Client Onboarding Workflow

**Mode:** A (Conversational)
**Duration:** 30-60 minutes
**Output:** Complete `.clients/{slug}/context.md`
**Agent:** brand-agent
**Required Skills:** positioning-basics, voice-extractor, brand-guidelines, product-marketing-context, marketing-context

---

## Pre-Flight

Before starting the onboarding conversation, gather the following:

| Item | Required | Notes |
|------|----------|-------|
| Client name | Yes | Used to generate the slug (e.g., "Acme Corp" -> `acme-corp`) |
| Industry / vertical | Yes | Needed for competitor research and positioning |
| Website URL | Recommended | Primary source for initial brand analysis |
| Existing brand materials | Optional | Logos, style guides, brand books, pitch decks |
| Content samples | Recommended | 3+ pieces of existing content (posts, emails, articles) for voice extraction |
| Language | Yes | All outputs will be written in this language |

**Action:** Create the directory `.clients/{slug}/` and initialize the onboarding session.

---

## Step 1: Positioning

**Skill:** positioning-basics
**Duration:** 10-15 minutes
**Goal:** Define market positioning with a clear one-liner

### 5 Core Questions

Ask these questions one at a time, conversationally. Do not dump all questions at once.

1. **What do you do?** -- Describe your product or service in simple terms. What does a customer get?
2. **Who is it for?** -- Who is your ideal customer? Be as specific as possible (role, company size, industry, pain level).
3. **What problem do you solve?** -- What situation exists before they find you? What pain or frustration drives them to look for a solution?
4. **How are you different?** -- What makes you the better choice compared to alternatives? Why would someone pick you over a competitor?
5. **What proof do you have?** -- Case studies, numbers, testimonials, awards, partnerships -- anything that proves your claims.

### Output

- **One-liner:** A single sentence under 20 words that captures what the client does and for whom
- **Differentiators:** 3+ specific, defensible reasons the client is different
- **Competitors:** 3+ named competitors with a one-line positioning note for each
- **Proof points:** Concrete evidence supporting the client's claims

### Example One-liner Format

> "[Product/Service] helps [audience] [achieve outcome] by [key differentiator]."

If the one-liner exceeds 20 words, iterate until it's tight. If it's generic (could apply to any company in the industry), push for specificity.

---

## Step 2: Voice Extraction

**Skill:** voice-extractor
**Duration:** 10-15 minutes
**Goal:** Define the brand's written voice with actionable do/don't rules

### Path A: Client Has Content Samples (Preferred)

1. Request 3+ content samples (blog posts, social media posts, emails, website copy)
2. Run voice-extractor analysis on the samples
3. Extract:
   - **Tone descriptors** (3-5 adjectives, e.g., "direct, warm, technically confident")
   - **Vocabulary patterns** (preferred terms, avoided terms, jargon level)
   - **Sentence structure** (average length, complexity, use of questions/exclamations)
   - **Do list** (5+ concrete things the brand voice does)
   - **Don't list** (5+ concrete things the brand voice avoids)

### Path B: No Content Exists (Voice Discovery)

If the client has no existing content, run a voice discovery session with these 4 questions:

1. **If your brand were a person, how would they talk at a dinner party?** -- Formal or casual? Technical or simple? Serious or playful?
2. **What 3 brands do you admire for their communication style?** -- And what specifically do you like about how they communicate?
3. **What words or phrases should your brand NEVER use?** -- Cliches, jargon, competitor language, anything off-brand?
4. **Show me a piece of content from another brand that feels like "you."** -- Why does it resonate?

From the answers, synthesize the same outputs as Path A (tone, vocabulary, do/don't lists).

### Output

```
Voice Profile:
  Tone: [3-5 descriptors]
  Do:
    - [Specific behavior with example]
    - [Specific behavior with example]
    - [Specific behavior with example]
    - [Specific behavior with example]
    - [Specific behavior with example]
  Don't:
    - [Specific behavior with example]
    - [Specific behavior with example]
    - [Specific behavior with example]
    - [Specific behavior with example]
    - [Specific behavior with example]
  Vocabulary:
    Preferred: [terms the brand uses]
    Avoided: [terms the brand never uses]
    Jargon level: [none / light / moderate / heavy]
```

---

## Step 3: Brand Identity

**Skill:** brand-guidelines
**Duration:** 5-10 minutes
**Goal:** Define visual identity, content pillars, platform strategy, and hashtags

### Visual Identity

Document the client's visual brand elements:
- Primary and secondary colors (hex codes if available)
- Typography preferences
- Logo usage notes
- Image style (photography, illustration, abstract, etc.)

### Content Pillars

Define 3-6 content pillars with percentage distribution. Percentages must total 100%.

| Pillar | Description | % |
|--------|-------------|---|
| Example: Thought Leadership | Industry insights, trends, original takes | 30% |
| Example: Product Education | How-tos, feature spotlights, use cases | 25% |
| Example: Social Proof | Testimonials, case studies, results | 20% |
| Example: Culture & Team | Behind the scenes, team highlights, values | 15% |
| Example: Engagement | Questions, polls, community interaction | 10% |

### Platform Strategy

For each platform the client will be active on, define:

| Platform | Frequency | Content Types | Primary Goal |
|----------|-----------|---------------|--------------|
| e.g., LinkedIn | 4x/week | Articles, carousels, polls | Thought leadership + lead gen |
| e.g., Instagram | 5x/week | Reels, stories, carousels | Brand awareness + engagement |

### Hashtag Strategy

- **Branded hashtags:** 1-2 unique to the client
- **Industry hashtags:** 5-10 relevant to the vertical
- **Community hashtags:** 3-5 used by the target audience

---

## Step 4: Product/Marketing Context

**Skills:** product-marketing-context, marketing-context
**Duration:** 5-10 minutes
**Goal:** Document products, market landscape, audiences, and KPIs

### Product Marketing Context

For each major product or service:
- Name and description
- Target audience segment
- Key value proposition
- Pricing tier / model (if public)
- Go-to-market channels

### Marketing Context

- **Target audience segments:** Demographics, psychographics, pain points for each segment
- **Market landscape:** Industry trends, market size, growth direction
- **Competitive environment:** How the client's competitors position themselves
- **Current KPIs:** Metrics being tracked with current baselines and targets
- **Budget/resource context:** What resources are available for content production

---

## Step 5: Generate Client Profile

**Duration:** 5 minutes
**Goal:** Compile all gathered information into `.clients/{slug}/context.md`

### Template

```markdown
# {Client Name}

## Overview
- **Industry:** {industry}
- **Website:** {url}
- **Language:** {language}
- **Onboarding Date:** {date}

## Positioning
- **One-liner:** {one-liner under 20 words}
- **Differentiators:**
  - {differentiator 1}
  - {differentiator 2}
  - {differentiator 3}
- **Competitors:**
  - {competitor 1} -- {their positioning}
  - {competitor 2} -- {their positioning}
  - {competitor 3} -- {their positioning}
- **Proof Points:**
  - {proof 1}
  - {proof 2}

## Voice
- **Tone:** {3-5 descriptors}
- **Do:**
  - {do 1 with example}
  - {do 2 with example}
  - {do 3 with example}
  - {do 4 with example}
  - {do 5 with example}
- **Don't:**
  - {don't 1 with example}
  - {don't 2 with example}
  - {don't 3 with example}
  - {don't 4 with example}
  - {don't 5 with example}
- **Vocabulary:**
  - Preferred: {terms}
  - Avoided: {terms}
  - Jargon level: {level}

## Brand Identity
- **Colors:** {primary and secondary hex codes}
- **Typography:** {font preferences}
- **Image Style:** {description}

## Content Pillars
| Pillar | Description | % |
|--------|-------------|---|
| {pillar 1} | {description} | {%} |
| {pillar 2} | {description} | {%} |
| {pillar 3} | {description} | {%} |

## Platform Strategy
| Platform | Frequency | Content Types | Goal |
|----------|-----------|---------------|------|
| {platform 1} | {freq} | {types} | {goal} |

## Hashtags
- **Branded:** {hashtags}
- **Industry:** {hashtags}
- **Community:** {hashtags}

## Products / Services
### {Product 1}
- **Description:** {desc}
- **Audience:** {segment}
- **Value Prop:** {value prop}
- **Pricing:** {pricing}
- **Channels:** {channels}

## Audience Segments
### {Segment 1}
- **Demographics:** {details}
- **Psychographics:** {details}
- **Pain Points:** {details}

## KPIs
| Metric | Current Baseline | Target | Timeframe |
|--------|-----------------|--------|-----------|
| {metric 1} | {baseline} | {target} | {timeframe} |

## Market Context
- **Trends:** {industry trends}
- **Market Size:** {size/growth}
- **Competitive Landscape:** {summary}
```

---

## Step 6: Confirmation

**Duration:** 5 minutes
**Goal:** Validate and save the complete profile

1. Present the complete `.clients/{slug}/context.md` to the user
2. Walk through each section briefly -- ask if anything needs adjustment
3. Pay special attention to:
   - Is the one-liner accurate and specific?
   - Does the voice profile feel right?
   - Are competitors correctly identified?
   - Are content pillar percentages aligned with the client's goals?
4. Apply any corrections
5. Save the final file to `.clients/{slug}/context.md`
6. Confirm save and summarize what was created

---

## Validation Checklist

Before marking onboarding as complete, all 10 items must pass:

- [ ] All sections in `context.md` are filled (no empty fields, no placeholders, no "TBD")
- [ ] Client language is explicitly set in the Overview section
- [ ] One-liner is specific to this client (not generic industry language) and under 20 words
- [ ] Voice profile has 5+ do's and 5+ don'ts, each with a concrete example
- [ ] 3+ content pillars are defined with percentages summing to 100%
- [ ] At least 1 platform is defined with posting frequency, content types, and goal
- [ ] 3+ competitors are named with their positioning noted
- [ ] KPIs have numeric targets and defined timeframes
- [ ] Product/service context is documented with value propositions
- [ ] User has reviewed and approved the complete profile
