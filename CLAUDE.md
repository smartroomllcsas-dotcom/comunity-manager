# Community Manager Platform

Multi-agent platform for community management across multiple brands and clients.

## Architecture

- **Orchestrator** (`orchestrator/AGENT.md`) — Routes requests, manages modes (A/B/C), loads client context
- **Agents** (`agents/*/AGENT.md`) — Specialized micro-agents (Brand, Content, + future agents)
- **Skills** (`skills/*/SKILL.md`) — 76 fusioned skills from 3 source repositories
- **Tools** (`tools/`) — Python and Node.js CLI scripts
- **Client Profiles** (`.clients/*/context.md`) — Per-client brand context

## How It Works

1. User sends a request
2. Orchestrator identifies the client (from context or asks)
3. Orchestrator loads `.clients/{slug}/context.md`
4. Orchestrator classifies intent and selects the right agent
5. User chooses mode: (A) Conversational, (B) Approval, (C) Autonomous
6. Agent executes using its assigned skills
7. Quality gates verify output before delivery

## Client Context

Every client has a profile at `.clients/{client-slug}/context.md`.
All agents load this file before executing any task.

To add a new client: ask the orchestrator to onboard a new client, or run the Brand Agent directly.

## Conventions

- Skills use YAML frontmatter with: name, description, version, agent, sources
- Agents are defined in AGENT.md files
- Python tools use stdlib only (no pip dependencies)
- Node.js tools are zero-dependency
- All content respects the client's language setting
- Quality gates run on all content before delivery

## Available Agents (Phase 1)

| Agent | Purpose | Skills |
|---|---|---|
| Orchestrator | Routing, modes, client context | marketing-ops, marketing-principles, prompt-engineer-toolkit |
| Brand Agent | Identity, voice, positioning | brand-guidelines, marketing-context, product-marketing-context, voice-extractor, positioning-basics, marketing-strategy-pmm, linkedin-profile-optimizer, marketing-principles |
| Content Agent | Create and optimize content | content-strategy, content-production, social-content, social-card-gen, content-idea-generator, linkedin-authority-builder, tweet-draft-reviewer, de-ai-ify, copywriting, copy-editing, video-content-strategist, content-humanizer, launch-strategy, case-study-builder |

## Future Phases

- Phase 2: Community Agent, Analytics Agent, Email Agent
- Phase 3: Ads Agent, SEO Agent, CRO Agent
- Phase 4: Growth & Sales Agent, Productivity Agent
