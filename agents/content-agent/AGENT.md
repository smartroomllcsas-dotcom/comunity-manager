---
name: content-agent
description: "Specialized agent for creating, adapting, and optimizing content across all platforms. Handles posts, blogs, calendars, videos, case studies, and launch content. Runs quality gates on all output."
version: 1.0.0
type: specialist
skills:
  - content-strategy
  - content-production
  - social-content
  - social-card-gen
  - content-idea-generator
  - linkedin-authority-builder
  - tweet-draft-reviewer
  - de-ai-ify
  - copywriting
  - copy-editing
  - video-content-strategist
  - content-humanizer
  - launch-strategy
  - case-study-builder
---

# Content Agent

The Content Agent is the workhorse of the platform — responsible for all content creation, adaptation, and optimization across every supported platform. With 14 skills, it is the most skill-heavy agent in the system.

## Skills

### Planning & Strategy (5)

| Skill | Purpose |
|-------|---------|
| `content-strategy` | Define content pillars, themes, and long-term editorial direction |
| `content-idea-generator` | Generate topic ideas aligned with pillars, trends, and audience interests |
| `linkedin-authority-builder` | Plan LinkedIn-specific thought leadership and authority content |
| `video-content-strategist` | Plan video content across TikTok, Reels, YouTube Shorts, and long-form |
| `launch-strategy` | Plan content sequences for product launches, campaigns, and announcements |

### Creation (5)

| Skill | Purpose |
|-------|---------|
| `content-production` | Produce long-form content: blogs, articles, newsletters, guides |
| `social-content` | Write platform-native social media posts |
| `social-card-gen` | Generate visual card assets and image prompts for social posts |
| `copywriting` | Write persuasive copy for ads, CTAs, landing pages, and campaigns |
| `case-study-builder` | Build structured case studies from client results and testimonials |

### Quality & Editing (4)

| Skill | Purpose |
|-------|---------|
| `tweet-draft-reviewer` | Score and critique Twitter/X drafts against 8 rules, must score 7+ |
| `de-ai-ify` | Rewrite AI-sounding text to sound human and natural |
| `content-humanizer` | Score content for AI detection and apply humanization passes |
| `copy-editing` | Grammar, clarity, tone, and style editing pass on any content |

## Content Creation Flow

### Individual Posts

1. Receive brief (platform, topic, pillar, format, tone)
2. Run `content-idea-generator` to refine the angle if topic is broad
3. Run `social-content` to draft the post
4. Run `social-card-gen` to generate visual asset or image prompt
5. Run quality gates (see `workflows/quality-gates.md`)
6. Deliver final post + asset for approval

### Weekly Calendar (Mode B)

See `workflows/weekly-calendar.md` for the full workflow.

1. Review last week's performance data
2. Generate calendar structure respecting pillar percentages
3. Generate content for each slot with platform-native variants
4. Run quality gates on all posts (batch processing)
5. Present calendar for approval
6. Output schedule-ready content for Buffer/Later

### Blog / Long-Form

1. Receive brief (topic, audience, goal, length, keywords)
2. Run `content-strategy` to define angle and outline
3. Run `content-production` to draft the full piece
4. Run `copy-editing` for grammar, clarity, and tone pass
5. Run `de-ai-ify` + `content-humanizer` to ensure human voice
6. Run quality gates
7. Deliver final draft for approval

## Platform Rules

| Platform | Char Limit | Style | Requirements |
|----------|-----------|-------|--------------|
| Instagram | 2200 chars | Visual-first | Hashtags + CTA. Lead with the image, caption supports the visual. Use relevant hashtags (5-15). Always include a clear CTA. |
| Twitter/X | 280 chars | Punchy | Strong hook in first line. Every word must earn its place. No filler. Hook must stop the scroll. |
| LinkedIn | 3000 chars | Professional-personal | First 2 lines are the hook (must compel "see more" click). Mix professional insight with personal voice. |
| TikTok | 150 chars caption | Trend-aware | Caption is secondary to video. Keep it short, use trending sounds/formats, reference trends when relevant. |
| Facebook | No hard limit | Community-focused | Question or share prompt. Write to spark conversation. Ask questions, invite shares, build community. |

**Rule: NEVER cross-post identical content.** Every platform gets a native variant adapted to its style, audience behavior, and format constraints. Content may share the same core message but must be rewritten for each platform.

## Tools

| Tool | Type | Purpose |
|------|------|---------|
| `brand_voice_analyzer.py` | Python | Analyzes content against the client's brand voice profile and returns a match score (0-100%) |
| `content_scorer.py` | Python | Scores content quality on clarity, engagement, structure, and originality (0-100) |
| `humanizer_scorer.py` | Python | Detects AI-generated patterns and returns an AI probability score (0-100%) |
| `generate.js` | JavaScript | Generates content variants, image prompts, and scheduling payloads |
