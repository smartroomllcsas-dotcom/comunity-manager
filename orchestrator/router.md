# Routing Matrix

The orchestrator uses intent detection to route each user request to the correct specialized agent. Routing is based on keyword matching, context analysis, and client detection.

---

## Agent Routing Keywords

### Brand Agent
**Phase:** 1 (Active)
**Keywords:** brand, identity, voice, tone, positioning, logo, colors, manual de marca, brief de marca, onboard, new client, nuevo cliente, voz de marca, brand guidelines, style guide
**Triggers on:** Any request related to defining, refining, or consulting a brand's identity, voice, or visual guidelines.

### Content Agent
**Phase:** 1 (Active)
**Keywords:** post, content, publish, calendar, calendario, write, blog, article, social media, instagram, facebook, twitter, linkedin, tiktok, reel, carousel, thread, story, video, copy, landing page, case study, launch, ideas, brainstorm
**Triggers on:** Any request to create, plan, schedule, or ideate content across any platform or format.

### Analytics Agent
**Phase:** 2
**Keywords:** metrics, analytics, report, reporte, performance, engagement rate, followers, growth, ROI, competitors, trends, data
**Triggers on:** Any request for performance data, reporting, competitive analysis, or trend identification.

### Community Agent
**Phase:** 2
**Keywords:** comments, DMs, respond, engage, community, moderate, troll, sentiment, feedback, reviews, testimonials
**Triggers on:** Any request related to audience interaction, moderation, sentiment tracking, or reputation management.

### Ads Agent
**Phase:** 3
**Keywords:** ad, campaign, ads, budget, CPC, CPM, ROAS, Meta Ads, Google Ads, creative, targeting, audience
**Triggers on:** Any request to plan, create, optimize, or report on paid advertising campaigns.

### SEO Agent
**Phase:** 3
**Keywords:** SEO, search, ranking, keywords, backlinks, schema, sitemap, indexing, Google, organic
**Triggers on:** Any request related to search engine optimization, organic visibility, or technical SEO.

### Email Agent
**Phase:** 2
**Keywords:** email, newsletter, sequence, drip, nurture, subscribe, open rate, click rate, mailchimp, automation
**Triggers on:** Any request to create, manage, or analyze email marketing campaigns and automations.

### CRO Agent
**Phase:** 3
**Keywords:** conversion, CRO, landing page optimize, signup flow, form, popup, paywall, A/B test, funnel
**Triggers on:** Any request to improve conversion rates, optimize user flows, or run experiments.

### Growth & Sales Agent
**Phase:** 4
**Keywords:** launch, growth, referral, lead magnet, sales, revenue, pricing, funnel, pipeline
**Triggers on:** Any request related to growth strategy, sales enablement, pricing, or revenue optimization.

### Productivity Agent
**Phase:** 4
**Keywords:** plan my day, schedule, meeting, briefing, focus, deep work, productivity
**Triggers on:** Any request to organize work, manage time, or optimize the user's workflow.

---

## Routing Priority

When multiple agents match, the orchestrator uses these rules to resolve conflicts:

1. **Exact phrase match wins over partial keyword match.** Example: "manual de marca" routes to Brand Agent even if the message also contains "content".
2. **Primary intent takes priority.** The first verb or action in the request determines the primary agent. Example: "Write a post following the brand voice" routes to Content Agent (primary: write/post), with Brand Agent loaded as context.
3. **Phase availability.** If the matched agent is not yet active (Phase 2+), the orchestrator informs the user and suggests an alternative or handles it with a general response.
4. **Ambiguity resolution.** If intent is truly ambiguous, the orchestrator asks: "I can help with that in a few ways. Did you mean: (1) [Agent A interpretation], (2) [Agent B interpretation]?"

---

## Multi-Agent Dispatch

Some requests require coordination between multiple agents. The orchestrator handles this by:

1. **Identifying the primary agent** based on the main intent.
2. **Loading supporting context** from secondary agents without fully dispatching to them.
3. **Sequential dispatch** when the workflow requires output from one agent as input to another.

### Common Multi-Agent Patterns

| Request Pattern                          | Primary Agent | Supporting Agents       |
|------------------------------------------|---------------|-------------------------|
| "Create a content calendar for [client]" | Content       | Brand (voice/context)   |
| "Write a post and schedule ads for it"   | Content       | Ads (campaign setup)    |
| "Onboard new client and plan content"    | Brand         | Content (initial plan)  |
| "Analyze performance and adjust content" | Analytics     | Content (revisions)     |
| "Launch campaign with email sequence"    | Ads           | Email (drip sequence)   |
| "Optimize landing page copy and SEO"     | CRO           | SEO (technical), Content (copy) |

---

## Client Detection Logic

Every request is checked for client context before routing to an agent.

### Detection Rules

1. **Explicit name match.** If the user mentions a client name that exists in the `clients/` directory, load that client's context. Example: "Write a post for Acme Corp" matches `clients/acme-corp/`.

2. **Default client.** If the user has only one active client configured, that client is loaded automatically without asking.

3. **Ambiguous or missing.** If the user has multiple clients and none is mentioned, the orchestrator asks:
   > "Which client is this for? Your active clients are: [list]"

4. **New client.** If the user mentions a name that does not match any existing client, the orchestrator asks:
   > "I don't have a profile for [name] yet. Would you like to start onboarding them? (This will use Mode A: Conversational)"

### Client Context Loading

Once a client is identified, the orchestrator loads:
- `clients/{client}/brand-brief.md` -- brand identity, voice, values
- `clients/{client}/content-strategy.md` -- content pillars, formats, frequency
- `clients/{client}/audience.md` -- target audience profiles
- `clients/{client}/history/` -- previous content and performance data (if available)

This context is injected into the agent's system prompt before the agent processes the request.

---

## Language Detection

The orchestrator detects the user's language from the input message and instructs the routed agent to respond in the same language. Supported languages: English, Spanish. Keywords in both languages are included in the routing table above (e.g., "calendario", "reporte", "nuevo cliente").
