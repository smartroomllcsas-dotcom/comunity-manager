/**
 * Gasto de Meta cruzado con los leads que entraron por cada anuncio.
 *
 * Es la pregunta que importa para decidir: no cuál anuncio tiene mejor CTR,
 * sino cuál trae leads que valen la pena y a qué precio. Un anuncio con CTR
 * altísimo y cero leads calificados está quemando plata.
 *
 * El cruce va por NOMBRE, no por id: los leads de formulario guardan el nombre
 * de la campaña y del anuncio (`lead_campaign`, `lead_ad`), no sus
 * identificadores. Verificado contra la cuenta real: Meta los devuelve iguales
 * ("ad1", "ad2", "Funnel form a meet - Software V1"). Los que no casan no se
 * esconden: se cuentan aparte para que el número cuadre.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdInsights, presetToDates, type AdInsightsRange } from "@/lib/meta";
import { resolveAdsSource } from "@/lib/meta/ads-source";

/** Etapas que cuentan como lead que valió la pena. */
export const ETAPAS_CALIFICADAS = ["Calificado", "Oportunidad", "Cliente"];

export type AdPerformance = {
  adId: string | null;
  adName: string;
  campaignName: string;
  adSetName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  reach: number;
  leads: number;
  calificados: number;
  perdidos: number;
  sinClasificar: number;
  /** Gasto entre leads. null si el anuncio no trajo ninguno. */
  costoPorLead: number | null;
  /** Gasto entre leads calificados. null si no hay ninguno todavía. */
  costoPorCalificado: number | null;
};

export type PerformanceReport = {
  ads: AdPerformance[];
  totals: {
    spend: number;
    leads: number;
    calificados: number;
    sinClasificar: number;
    costoPorLead: number | null;
    costoPorCalificado: number | null;
  };
  /** Leads del periodo que no se pudieron atribuir a ningún anuncio con gasto. */
  leadsSinAnuncio: number;
  /** Cuántos leads del periodo siguen sin etapa: sin esto el costo por calificado engaña. */
  avisoSinClasificar: string | null;
  range: { since: string; until: string };
};

/** "Funnel form a meet - Software V1" y "funnel form a meet  software v1" son lo mismo. */
function clave(campaign: string | null | undefined, ad: string | null | undefined): string {
  const limpia = (t: string | null | undefined) =>
    String(t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  return `${limpia(campaign)}|${limpia(ad)}`;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function buildPerformanceReport(
  brandId: string,
  range: AdInsightsRange
): Promise<PerformanceReport | { error: string; needsConnect: boolean }> {
  const source = await resolveAdsSource(brandId);
  if (!source.ok) return { error: source.reason, needsConnect: source.needsConnect };

  const fechas = "preset" in range ? presetToDates(range.preset) : range;

  // ── Gasto por anuncio ──────────────────────────────────────────────────────
  const insights = await getAdInsights(source.adAccountId, source.token, range, {
    level: "ad",
    extraFields: ["campaign_name", "adset_name", "ad_name", "ad_id"],
  });
  const filas = (Array.isArray(insights?.data) ? insights.data : []) as Array<Record<string, unknown>>;

  // ── Leads del mismo periodo ────────────────────────────────────────────────
  const admin = createAdminClient("smarttalk");
  const [{ data: stageRows }, { data: leadRows }] = await Promise.all([
    admin.from("lifecycle_stages").select("id, name"),
    admin
      .from("contacts")
      .select("custom_fields, lifecycle_stage_id, created_at")
      .eq("brand_id", brandId)
      .gte("created_at", `${fechas.since}T00:00:00Z`)
      .lte("created_at", `${fechas.until}T23:59:59Z`)
      .limit(5000),
  ]);

  const etapas = new Map<string, string>();
  for (const s of (stageRows || []) as Array<{ id: string; name: string }>) etapas.set(s.id, s.name);

  type Conteo = { leads: number; calificados: number; perdidos: number; sinClasificar: number };
  const porAnuncio = new Map<string, Conteo>();
  let totalLeads = 0;
  let totalSinClasificar = 0;

  for (const row of (leadRows || []) as Array<Record<string, unknown>>) {
    const cf = (row.custom_fields || {}) as Record<string, unknown>;
    if (cf.source !== "facebook_lead_form") continue;
    const etapa = etapas.get(String(row.lifecycle_stage_id || "")) || null;

    const k = clave(cf.lead_campaign as string, cf.lead_ad as string);
    const actual = porAnuncio.get(k) || { leads: 0, calificados: 0, perdidos: 0, sinClasificar: 0 };
    actual.leads += 1;
    if (etapa && ETAPAS_CALIFICADAS.includes(etapa)) actual.calificados += 1;
    else if (etapa === "Perdido") actual.perdidos += 1;
    else actual.sinClasificar += 1;
    porAnuncio.set(k, actual);

    totalLeads += 1;
    if (!etapa || (!ETAPAS_CALIFICADAS.includes(etapa) && etapa !== "Perdido")) totalSinClasificar += 1;
  }

  // ── Cruce ──────────────────────────────────────────────────────────────────
  const usados = new Set<string>();
  const ads: AdPerformance[] = filas.map((row) => {
    const campaignName = String(row.campaign_name || "");
    const adName = String(row.ad_name || "");
    const k = clave(campaignName, adName);
    usados.add(k);
    const c = porAnuncio.get(k) || { leads: 0, calificados: 0, perdidos: 0, sinClasificar: 0 };
    const spend = num(row.spend);
    return {
      adId: (row.ad_id as string) || null,
      adName: adName || "(sin nombre)",
      campaignName,
      adSetName: (row.adset_name as string) || null,
      spend,
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      ctr: num(row.ctr),
      cpc: num(row.cpc),
      reach: num(row.reach),
      leads: c.leads,
      calificados: c.calificados,
      perdidos: c.perdidos,
      sinClasificar: c.sinClasificar,
      costoPorLead: c.leads > 0 ? spend / c.leads : null,
      costoPorCalificado: c.calificados > 0 ? spend / c.calificados : null,
    };
  });

  let leadsSinAnuncio = 0;
  for (const [k, c] of porAnuncio) if (!usados.has(k)) leadsSinAnuncio += c.leads;

  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const leadsAtribuidos = ads.reduce((s, a) => s + a.leads, 0);
  const calificadosAtribuidos = ads.reduce((s, a) => s + a.calificados, 0);

  return {
    // Lo más barato por lead primero; los que no trajeron ninguno, al final.
    ads: ads.sort((a, b) => {
      if (a.costoPorLead === null && b.costoPorLead === null) return b.spend - a.spend;
      if (a.costoPorLead === null) return 1;
      if (b.costoPorLead === null) return -1;
      return a.costoPorLead - b.costoPorLead;
    }),
    totals: {
      spend: totalSpend,
      leads: leadsAtribuidos,
      calificados: calificadosAtribuidos,
      sinClasificar: totalSinClasificar,
      costoPorLead: leadsAtribuidos > 0 ? totalSpend / leadsAtribuidos : null,
      costoPorCalificado: calificadosAtribuidos > 0 ? totalSpend / calificadosAtribuidos : null,
    },
    leadsSinAnuncio,
    avisoSinClasificar:
      totalLeads > 0 && totalSinClasificar / totalLeads > 0.3
        ? `${totalSinClasificar} de ${totalLeads} leads todavía no tienen etapa. Mientras eso no se clasifique, el costo por lead calificado se queda corto.`
        : null,
    range: fechas,
  };
}
