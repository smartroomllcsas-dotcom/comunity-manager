// Sprint 26 · Agente P — Generación de insights IA para el reporte PDF.
//
// Le pasamos a Claude Sonnet un JSON compacto con los datos del período y
// pedimos 3-5 bullets accionables + recomendaciones en español.
//
// Cost estimado por report:
//   * input ~ 800-1200 tokens (payload comprimido de analytics)
//   * output ~ 250-400 tokens (5 bullets breves)
//   * ~ $0.005 - $0.012 con claude-sonnet-4-5 (o modelo actual del proyecto)

import Anthropic from "@anthropic-ai/sdk";
import type { ReportData } from "./pdf-builder";

const MODEL = process.env.ANTHROPIC_MODEL_INSIGHTS || "claude-sonnet-4-5";
const MAX_TOKENS = 700;

interface InsightsInput {
  client: ReportData["client"];
  period: ReportData["period"];
  summary: ReportData["summary"];
  byPlatform: ReportData["byPlatform"];
  topPosts: ReportData["topPosts"];
  timeseries: ReportData["timeseries"];
}

function buildPrompt(data: InsightsInput): string {
  const compact = {
    cliente: data.client.name,
    periodo: `${data.period.start} → ${data.period.end} (${data.period.type})`,
    resumen: data.summary,
    por_plataforma: data.byPlatform.map((p) => ({
      plataforma: p.platform,
      impresiones: p.impressions,
      engagement: p.engagement,
      tasa_engagement: Number((p.engagementRate * 100).toFixed(2)),
    })),
    top_posts: data.topPosts.slice(0, 5).map((p) => ({
      plataforma: p.platform,
      contenido_preview: p.content?.slice(0, 100),
      impresiones: p.impressions,
      engagement: p.engagement,
    })),
    tendencia: {
      dias: data.timeseries.length,
      primer_dia: data.timeseries[0],
      ultimo_dia: data.timeseries[data.timeseries.length - 1],
    },
  };

  return `Analiza estos datos de social media del cliente y produce 3-5 insights accionables + recomendaciones en español.

Formato de respuesta: SOLO una lista de bullets, cada uno de 1-3 frases. Sin encabezados, sin markdown, sin numeración. Cada bullet en su propia línea empezando con "- ".

Enfócate en:
- Qué plataforma está performando mejor y por qué.
- Qué tipo de contenido genera más engagement.
- Recomendaciones concretas para el próximo período (frecuencia, formato, mejor hora si aplica).
- Tendencias claras (crecimiento/decrecimiento) que la agencia debe accionar.

Datos:
${JSON.stringify(compact, null, 2)}`;
}

/**
 * Retorna 3-5 insights en formato de líneas ya limpias.
 * Fail-safe: si Claude devuelve algo raro, devuelve array vacío en vez de romper el PDF.
 */
export async function generateReportInsights(
  data: InsightsInput,
  client: Anthropic,
): Promise<string[]> {
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: buildPrompt(data) }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    const bullets = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- ") || l.startsWith("• "))
      .map((l) => l.replace(/^[-•]\s+/, "").trim())
      .filter((l) => l.length > 10 && l.length < 500)
      .slice(0, 5);

    return bullets;
  } catch (err) {
    console.warn("[insights-generator] fallo Anthropic:", err instanceof Error ? err.message : String(err));
    return [];
  }
}
