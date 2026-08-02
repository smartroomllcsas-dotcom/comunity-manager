/**
 * Sprint 25 · IA aplicada v2 — Response Drafting con voz del cliente.
 *
 * Genera 3 drafts (empathetic / direct / playful) para responder a un mensaje
 * entrante (DM, comentario, review). Usa Sonnet con few-shot desde
 * brandVoiceSample. Detecta crisis/escalation por keywords.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { selectRelevantSkills } from "@/lib/skills/selector";
import type { SkillEntry } from "@/lib/skills/registry";

export const SONNET_MODEL = "claude-sonnet-4-20250514";

const PRICE_INPUT_PER_1K = 0.003;
const PRICE_OUTPUT_PER_1K = 0.015;

// Recorta la muestra de voz para no explotar tokens.
const MAX_BRAND_VOICE_CHARS = 6000;

export interface ConversationTurn {
  role: "user" | "brand";
  content: string;
}

export interface ResponseDraftInput {
  clientId: string;
  incomingMessage: string;
  platform: string;
  conversationHistory?: ConversationTurn[];
  brandVoiceSample?: string;
}

export interface Draft {
  text: string;
  tone: string;
  confidence: number;
}

export interface ResponseDraftResult {
  drafts: Draft[];
  recommended: number;
  should_escalate: boolean;
  reasoning: string;
  cost_estimate_usd: number;
  skills_used: string[];
}

// Palabras que disparan escalation. Case insensitive, matching por límite de
// palabra para evitar falsos positivos (ej. "boycott" en "boycotting").
const ESCALATION_TRIGGERS = [
  "lawyer",
  "abogado",
  "sue",
  "demandar",
  "denuncia",
  "refund",
  "reembolso",
  "worst",
  "peor",
  "boycott",
  "boicot",
  "delete my account",
  "eliminar mi cuenta",
  "cancelar cuenta",
  "fraud",
  "fraude",
  "estafa",
  "scam",
  "class action",
  "acción colectiva",
];

function computeCostUsd(inputTokens: number, outputTokens: number): number {
  const c = (inputTokens / 1000) * PRICE_INPUT_PER_1K + (outputTokens / 1000) * PRICE_OUTPUT_PER_1K;
  return Math.round(c * 10000) / 10000;
}

function detectEscalation(text: string): { escalate: boolean; matched: string[] } {
  const lower = text.toLowerCase();
  const matched = ESCALATION_TRIGGERS.filter((kw) => {
    if (kw.includes(" ")) return lower.includes(kw);
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(lower);
  });
  return { escalate: matched.length > 0, matched };
}

function buildHistoryBlock(history: ConversationTurn[] | undefined): string {
  if (!history || history.length === 0) return "(sin historial previo)";
  return history
    .slice(-8)
    .map((t) => `${t.role.toUpperCase()}: ${t.content.slice(0, 400)}`)
    .join("\n");
}

function buildSystemPrompt(skills: SkillEntry[], input: ResponseDraftInput): string {
  const skillsBlock = skills.length
    ? "\n\n## Skills activas\n" +
      skills.map((s) => `### ${s.name}\n${(s.description || "").trim()}`).join("\n\n")
    : "";
  const voiceRef = input.brandVoiceSample
    ? `\n\n## Referencia de voz de marca (mensajes históricos aprobados)\n"""\n${input.brandVoiceSample.slice(0, MAX_BRAND_VOICE_CHARS)}\n"""\nUsa estos ejemplos como few-shot: extrae tono, ritmo, vocabulario y patrones. NO copies literal.`
    : "";
  return `Eres un community manager senior redactando respuestas a mensajes en ${input.platform}. Generas 3 drafts diferentes con tonos distintos para que el humano elija el mejor.

Formato de output (JSON estricto, sin fences, sin prosa):
{
  "drafts": [
    { "text": "...", "tone": "empathetic", "confidence": 0.0-1.0 },
    { "text": "...", "tone": "direct", "confidence": 0.0-1.0 },
    { "text": "...", "tone": "playful", "confidence": 0.0-1.0 }
  ],
  "recommended": 0,
  "reasoning": "Breve explicación de por qué recomendaste ese draft (2-3 frases)."
}

Reglas:
- Tres tonos DISTINTOS: empathetic (valida emoción primero), direct (resuelve rápido), playful (ligero, humor apropiado — evita si el mensaje es serio/crisis).
- Longitud adaptada a la plataforma. DMs: 1-3 líneas. Comentarios públicos: 1-2 líneas. Reviews: 2-4 líneas.
- Si el mensaje entrante es crítico/negativo: NUNCA uses playful. En ese caso, marca playful con confidence baja (< 0.3).
- "recommended" es el index (0, 1, o 2) del draft con mayor confidence que aplique al contexto.
- confidence refleja qué tan bien encaja ese tono con este mensaje específico (no cuán bueno es el texto).
- NO uses clichés ("Lamentamos escuchar eso", "Agradecemos tu feedback").
- Idioma: responde en el mismo idioma que el mensaje entrante.${voiceRef}${skillsBlock}`;
}

function buildUserPrompt(input: ResponseDraftInput): string {
  return `Cliente: ${input.clientId}
Plataforma: ${input.platform}

Historial conversacional:
${buildHistoryBlock(input.conversationHistory)}

Mensaje entrante a responder:
"""
${input.incomingMessage}
"""

Genera los 3 drafts.`;
}

function parseResponse(raw: string): {
  drafts: Draft[];
  recommended: number;
  reasoning: string;
} {
  const empty = {
    drafts: [] as Draft[],
    recommended: 0,
    reasoning: "",
  };
  const tryParse = (txt: string): typeof empty | null => {
    try {
      const parsed = JSON.parse(txt);
      if (!parsed || typeof parsed !== "object") return null;
      const p = parsed as Record<string, unknown>;
      const drafts = Array.isArray(p.drafts)
        ? p.drafts
            .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
            .map((d) => ({
              text: typeof d.text === "string" ? d.text : "",
              tone: typeof d.tone === "string" ? d.tone : "unknown",
              confidence:
                typeof d.confidence === "number"
                  ? Math.max(0, Math.min(1, d.confidence))
                  : 0.5,
            }))
        : [];
      const rec = typeof p.recommended === "number" ? p.recommended : 0;
      const reasoning = typeof p.reasoning === "string" ? p.reasoning : "";
      return { drafts, recommended: rec, reasoning };
    } catch {
      return null;
    }
  };
  const cleaned = raw.trim();
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const via = tryParse(fence[1].trim());
    if (via) return via;
  }
  const brace = cleaned.match(/\{[\s\S]*\}/);
  if (brace) {
    const via = tryParse(brace[0]);
    if (via) return via;
  }
  return empty;
}

export async function draftResponse(
  input: ResponseDraftInput,
  client: Anthropic
): Promise<ResponseDraftResult> {
  if (!input || !input.incomingMessage || !input.platform) {
    throw new Error("draftResponse: incomingMessage y platform requeridos");
  }

  // Escalation detection PREVIA a Sonnet — barata y determinista.
  const escalation = detectEscalation(input.incomingMessage);

  // Skills selector.
  const summary = `Responder a mensaje entrante en ${input.platform}: "${input.incomingMessage.slice(0, 200)}"`;
  let skills: SkillEntry[] = [];
  try {
    skills = await selectRelevantSkills(summary, [], { maxSkills: 2, client });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[response-drafting] Skill selection soft-failed: ${msg}`);
  }

  const resp = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1200,
    system: buildSystemPrompt(skills, input),
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  const first = resp.content[0];
  const rawText = first && first.type === "text" ? first.text : "";
  const inputTokens = resp.usage?.input_tokens ?? 0;
  const outputTokens = resp.usage?.output_tokens ?? 0;

  const parsed = parseResponse(rawText);
  const safeRecommended = Math.max(
    0,
    Math.min(Math.max(parsed.drafts.length - 1, 0), parsed.recommended)
  );

  const reasoning = escalation.escalate
    ? `Escalation triggered by keywords: ${escalation.matched.join(", ")}. ${parsed.reasoning}`.trim()
    : parsed.reasoning;

  return {
    drafts: parsed.drafts,
    recommended: safeRecommended,
    should_escalate: escalation.escalate,
    reasoning,
    cost_estimate_usd: computeCostUsd(inputTokens, outputTokens),
    skills_used: skills.map((s) => s.slug),
  };
}
