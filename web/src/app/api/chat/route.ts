import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { clientIp, rateLimitWithWhitelist } from "@/lib/rate-limit";
import { skillsSummary } from "@/lib/skills/registry";
import { selectRelevantSkills } from "@/lib/skills/selector";
import type { SkillEntry } from "@/lib/skills/registry";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Sprint 22 hardening: 30 req/min por IP (endpoint costoso, sin auth de sesión).
const CHAT_RATE_LIMIT = 30;
const CHAT_RATE_WINDOW_MS = 60 * 1000;

// Sprint 23: skills registry — counts are dynamic so the prompt never lies.
const SKILLS_STATS = skillsSummary();
const c = (k: string): number => SKILLS_STATS.byCategory[k] || 0;

// Map registry categories → agent buckets used in the system prompt.
const AGENT_COUNTS = {
  content: c("content"),
  brand: c("brand"),
  community: c("community"),
  analytics: c("analytics"),
  email: c("email"),
  ads: c("ads"),
  seo: c("seo"),
  cro: c("cro"),
  growth: c("growth"),
  productivity: c("productivity"),
};

function buildSystemPrompt(): string {
  return `You are ComunityAgent, a multi-agent community management platform orchestrator. You coordinate 10 specialized agents to serve multiple brand clients across a registry of ${SKILLS_STATS.total} skills.

## Your Agents

1. **Content Agent** (${AGENT_COUNTS.content} skills) — Creates posts, blogs, calendars, videos, case studies across all platforms
2. **Brand Agent** (${AGENT_COUNTS.brand} skills) — Brand identity, voice extraction, positioning, client onboarding
3. **Community Agent** (${AGENT_COUNTS.community} skills) — Engagement, moderation, response frameworks, Reddit insights
4. **Analytics Agent** (${AGENT_COUNTS.analytics} skills) — Metrics, reports, competitive intelligence, trend research
5. **Email Agent** (${AGENT_COUNTS.email} skills) — Newsletters, sequences, cold email, churn prevention
6. **Ads Agent** (${AGENT_COUNTS.ads} skills) — Meta/Google/LinkedIn ads, creative, A/B testing
7. **SEO Agent** (${AGENT_COUNTS.seo} skills) — Technical SEO, AI search optimization, schema markup
8. **CRO Agent** (${AGENT_COUNTS.cro} skills) — Conversion optimization across all touchpoints
9. **Growth & Sales Agent** (${AGENT_COUNTS.growth} skills) — Launches, lead gen, RevOps, sales enablement
10. **Productivity Agent** (${AGENT_COUNTS.productivity} skills) — Daily planning, deep work, meeting prep

## Operation Modes

When the user asks for something, offer them a mode choice:
- **(A) Conversational** — You ask questions, they guide each step
- **(B) Approval** — You prepare everything, they review and approve
- **(C) Autonomous** — You handle it and report back

## Client Context

When the user mentions a client/brand, use that context throughout the conversation. If no client is specified and you need one, ask.

## Rules

- You are multilingual — respond in the language the user uses
- Always identify which agent handles the request
- Be direct and professional
- Use markdown formatting for structured outputs
- For content creation: NEVER cross-post identical content across platforms
- For content: always consider content pillars, brand voice, and platform-specific rules
- Quality gates: all content should sound human (not AI), match brand voice, fit platform rules`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

/**
 * Format the picked skills into a block appended to the system prompt.
 * Empty list → empty string so the prompt shape stays stable.
 */
function formatSkillsContext(skills: SkillEntry[]): string {
  if (!skills.length) return "";
  const blocks = skills
    .map(
      (s) =>
        `## Skill activated: ${s.name}\n${s.content}\n\n---`
    )
    .join("\n\n");
  return `\n\n# Activated Skills (RAG-selected for this turn)\nUse the following skill playbooks as authoritative guidance for this response. If they conflict with the user's request, follow the user.\n\n${blocks}`;
}

interface ChatMessage {
  role: string;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    const rl = await rateLimitWithWhitelist(
      ip,
      `chat:${ip}`,
      CHAT_RATE_LIMIT,
      CHAT_RATE_WINDOW_MS
    );
    if (!rl.ok) {
      return Response.json(
        { error: "Demasiadas solicitudes. Intenta más tarde." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const { messages, mode, client } = await req.json();
    const msgList: ChatMessage[] = Array.isArray(messages) ? messages : [];

    const userContext = client
      ? `\n\nActive client: ${client}. Mode: ${mode || "B"}.`
      : `\nNo client selected. Mode: ${mode || "B"}.`;

    // Sprint 23: RAG-lite skill selection via Haiku.
    const lastUserMessage =
      [...msgList].reverse().find((m) => m.role === "user")?.content || "";
    const history = msgList.slice(0, -1);
    let relevantSkills: SkillEntry[] = [];
    try {
      relevantSkills = await selectRelevantSkills(lastUserMessage, history, {
        maxSkills: 3,
      });
    } catch (err) {
      // Never let selector failure break the chat.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[chat] Skill selection failed (soft): ${msg}`);
      relevantSkills = [];
    }

    const skillsContext = formatSkillsContext(relevantSkills);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT + userContext + skillsContext,
      messages: msgList.map((m: ChatMessage) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return Response.json({
      response: text,
      _skills_used: relevantSkills.map((s) => s.slug),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return Response.json({ error: message }, { status: 500 });
  }
}
