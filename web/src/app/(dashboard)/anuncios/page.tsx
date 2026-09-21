"use client";
/**
 * Anuncios — inversión y rendimiento de la pauta de UNA empresa.
 *
 * Los números mandan, así que la pantalla se lee de arriba abajo: primero lo
 * que costó y cuánto rindió, después el detalle campaña por campaña, y al final
 * la página de Facebook. Nada se inventa: si falta algo, se dice qué falta.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Megaphone, RefreshCw, AlertTriangle, ExternalLink, Plug, CalendarRange, Eye, X } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { BrandPicker } from "@/components/broadcasts/BrandPicker";
import { CampaignStatusButton } from "@/components/ads/CampaignStatusButton";

export const dynamic = "force-dynamic";

type Metric = { name: string; value: string | number };
type Campaign = { id: string; name: string; status?: string; objective?: string; updated_time?: string };
type PageMetric = { name: string; values?: Array<{ value: number }> };
type DetailInsight = {
  spend?: string | number | null;
  impressions?: string | number | null;
  reach?: string | number | null;
  clicks?: string | number | null;
  ctr?: string | number | null;
  cpc?: string | number | null;
  frequency?: string | number | null;
  dateStart?: string | null;
  dateStop?: string | null;
  actions?: Array<{ type: string | null; value: string | number | null }>;
} | null;
type Targeting = {
  ageMin?: number | null;
  ageMax?: number | null;
  genders?: string[];
  locations?: string[];
  interests?: string[];
  behaviors?: string[];
  demographics?: string[];
  exclusions?: string[];
  devicePlatforms?: string[];
  publisherPlatforms?: string[];
  facebookPositions?: string[];
  instagramPositions?: string[];
  locales?: string[];
} | null;
type Creative = {
  id?: string | null;
  name?: string | null;
  format?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  destinationUrl?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  videoId?: string | null;
  previewUrl?: string | null;
} | null;
type CampaignDetail = {
  adAccountId: string;
  range: string;
  campaign: {
    id?: string | null;
    name?: string | null;
    status?: string | null;
    effectiveStatus?: string | null;
    configuredStatus?: string | null;
    objective?: string | null;
    buyingType?: string | null;
    specialAdCategories?: string[];
    dailyBudget?: string | number | null;
    lifetimeBudget?: string | number | null;
    startTime?: string | null;
    stopTime?: string | null;
    createdTime?: string | null;
    updatedTime?: string | null;
  };
  insights: { campaign: DetailInsight };
  adsets: Array<{
    id?: string | null;
    name?: string | null;
    status?: string | null;
    effectiveStatus?: string | null;
    targeting: Targeting;
    dailyBudget?: string | number | null;
    lifetimeBudget?: string | number | null;
    startTime?: string | null;
    endTime?: string | null;
    insights: DetailInsight;
    ads: Array<{
      id?: string | null;
      name?: string | null;
      status?: string | null;
      effectiveStatus?: string | null;
      insights: DetailInsight;
      creative: Creative;
    }>;
  }>;
};

const MONEY = new Set(["Inversión", "Costo por clic"]);

/** Los objetivos llegan como OUTCOME_ENGAGEMENT: ilegibles y además se cortan. */
const OBJETIVO: Record<string, string> = {
  OUTCOME_ENGAGEMENT: "Interacción",
  OUTCOME_LEADS: "Clientes potenciales",
  OUTCOME_SALES: "Ventas",
  OUTCOME_TRAFFIC: "Tráfico",
  OUTCOME_AWARENESS: "Reconocimiento",
  OUTCOME_APP_PROMOTION: "Promoción de la app",
  ENGAGEMENT: "Interacción",
  LEAD_GENERATION: "Clientes potenciales",
  CONVERSIONS: "Conversiones",
  LINK_CLICKS: "Clics en el enlace",
  MESSAGES: "Mensajes",
};

function objetivo(raw?: string | null): string {
  if (!raw) return "—";
  return OBJETIVO[raw] || raw.replace(/^OUTCOME_/, "").replace(/_/g, " ").toLowerCase();
}

const COMPRA: Record<string, string> = {
  AUCTION: "Subasta",
  RESERVED: "Reserva",
};

/** "2026-09-08T16:24:25-0500" no se lee. Esto sí. */
function fecha(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

type AdPerf = {
  adId: string | null;
  adName: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  leads: number;
  calificados: number;
  perdidos: number;
  sinClasificar: number;
  costoPorLead: number | null;
  costoPorCalificado: number | null;
};

type Performance = {
  ads: AdPerf[];
  totals: {
    spend: number;
    leads: number;
    calificados: number;
    sinClasificar: number;
    costoPorLead: number | null;
    costoPorCalificado: number | null;
  };
  leadsSinAnuncio: number;
  avisoSinClasificar: string | null;
};

const usd = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const PERIODOS = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last_7d", label: "Últimos 7 días" },
  { id: "last_14d", label: "Últimos 14 días" },
  { id: "last_30d", label: "Últimos 30 días" },
  { id: "last_90d", label: "Últimos 90 días" },
  { id: "this_month", label: "Este mes" },
  { id: "last_month", label: "Mes pasado" },
  { id: "maximum", label: "Todo el historial" },
] as const;

/** Formato colombiano: los miles con punto y la plata con su símbolo. */
function show(metric: Metric): string {
  const n = Number(metric.value);
  if (!Number.isFinite(n)) return String(metric.value);
  if (MONEY.has(metric.name)) {
    return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
  if (metric.name === "CTR") return `${n.toFixed(2)} %`;
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function CampaignDetailDialog({
  target,
  detail,
  loading,
  error,
  onClose,
  perf,
  clientId,
  onChanged,
}: {
  target: Campaign;
  detail: CampaignDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  /** Leads y costo por lead del periodo, para cruzarlos con cada anuncio. */
  perf: Performance | null;
  clientId: string | null;
  onChanged: () => void;
}) {
  const campaignInsight = detail?.insights.campaign;
  const campaign = detail?.campaign;
  const totalAds = detail?.adsets.reduce((total, adSet) => total + adSet.ads.length, 0) ?? 0;

  // Los leads se cruzan por nombre de anuncio dentro de ESTA campaña: es como
  // vienen guardados (lead_campaign + lead_ad), no por id.
  const nombreCampana = campaign?.name || target.name;
  const perfPorAnuncio = new Map<string, AdPerf>();
  for (const fila of perf?.ads || []) {
    if (fila.campaignName === nombreCampana) perfPorAnuncio.set(fila.adName, fila);
  }
  const leadsCampana = [...perfPorAnuncio.values()].reduce((n, a) => n + a.leads, 0);
  const gastoCampana = [...perfPorAnuncio.values()].reduce((n, a) => n + a.spend, 0);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4 sm:p-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-[#30363d] bg-[#0d1117] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-detail-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#30363d] bg-[#161b22] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-violet-300">Detalle de campaña</p>
            <h2 id="campaign-detail-title" className="mt-1 truncate text-lg font-semibold text-white">
              {campaign?.name || target.name}
            </h2>
            <p className="mt-1 text-xs text-[#8b949e]">
              Audiencia, segmentación, resultados y anuncios asociados
              {detail?.range ? ` · periodo ${detail.range}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-[#8b949e] transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar detalle de campaña"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {loading && (
          <div className="flex min-h-[280px] items-center justify-center px-6 py-10 text-sm text-[#8b949e]">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Cargando detalle desde Meta…
          </div>
        )}

        {!loading && error && (
          <div className="m-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && detail && campaign && (
          <div className="max-h-[calc(100vh-9rem)] space-y-6 overflow-y-auto p-5 sm:p-6">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <DetailStat label="Estado" value={displayStatus(campaign.effectiveStatus || campaign.status)} />
              <DetailStat label="Objetivo" value={objetivo(campaign.objective)} />
              <DetailStat label="Inversión" value={showDetailMoney(campaignInsight?.spend)} />
              <DetailStat label="Alcance" value={showDetailNumber(campaignInsight?.reach)} />
              <DetailStat label="Impresiones" value={showDetailNumber(campaignInsight?.impressions)} />
              <DetailStat label="Clics" value={showDetailNumber(campaignInsight?.clicks)} />
            </section>

            {/* Lo que de verdad decide: qué trajo esta campaña y a qué precio */}
            {perfPorAnuncio.size > 0 && (
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                  <p className="text-2xl font-semibold tabular-nums text-white">{leadsCampana}</p>
                  <p className="mt-1 text-xs text-[#8b949e]">Leads de esta campaña</p>
                </div>
                <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                  <p className="text-2xl font-semibold tabular-nums text-white">
                    {leadsCampana > 0 ? usd(gastoCampana / leadsCampana) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-[#8b949e]">Costo por lead</p>
                </div>
                <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                  <p className="text-2xl font-semibold tabular-nums text-white">
                    {[...perfPorAnuncio.values()].reduce((n, a) => n + a.calificados, 0)}
                  </p>
                  <p className="mt-1 text-xs text-[#8b949e]">Calificados</p>
                </div>
              </section>
            )}

            {/* La decisión, al lado de los números que la justifican */}
            {clientId && campaign?.id && (
              <section>
                <CampaignStatusButton
                  clientId={clientId}
                  campaignId={campaign.id}
                  campaignName={campaign.name || target.name}
                  status={campaign.effectiveStatus || campaign.status}
                  spend={gastoCampana || Number(campaignInsight?.spend) || 0}
                  leads={leadsCampana}
                  onDone={onChanged}
                />
              </section>
            )}

            <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Qué se configuró</h3>
                  <p className="mt-1 text-xs text-[#8b949e]">
                    Estado efectivo, presupuesto y fechas informadas por Meta.
                  </p>
                </div>
                <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-[11px] text-violet-200">
                  {detail.adsets.length} conjuntos · {totalAds} anuncios
                </span>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <InfoPair label="Estado configurado" value={displayStatus(campaign.configuredStatus)} />
                <InfoPair label="Tipo de compra" value={COMPRA[campaign.buyingType || ""] || campaign.buyingType || "—"} />
                <InfoPair label="Inicio" value={fecha(campaign.startTime) || "—"} />
                <InfoPair label="Fin" value={fecha(campaign.stopTime) || "Sin fecha de fin"} />
              </div>
              {campaign.specialAdCategories && campaign.specialAdCategories.length > 0 && (
                <p className="mt-3 text-xs text-[#8b949e]">
                  Categorías especiales: <span className="text-slate-200">{campaign.specialAdCategories.join(", ")}</span>
                </p>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Audiencia y segmentación</h3>
                  <p className="mt-1 text-xs text-[#8b949e]">
                    Meta guarda la segmentación por conjunto de anuncios, no como una sola audiencia global.
                  </p>
                </div>
              </div>
              {detail.adsets.length === 0 ? (
                <EmptyDetail text="Meta no devolvió conjuntos de anuncios para esta campaña." />
              ) : (
                <div className="space-y-4">
                  {detail.adsets.map((adSet, index) => (
                    <article key={adSet.id || `adset-${index}`} className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-white">{adSet.name || "Conjunto sin nombre"}</h4>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#8b949e]">
                            {displayStatus(adSet.effectiveStatus || adSet.status)}
                          </p>
                        </div>
                        <div className="text-right text-xs text-[#8b949e]">
                          <div>{showDetailNumber(adSet.insights?.reach)} alcanzadas</div>
                          <div>{showDetailNumber(adSet.insights?.impressions)} impresiones</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <AudienceField label="Edad" value={adSet.targeting ? `${adSet.targeting.ageMin ?? "—"} a ${adSet.targeting.ageMax ?? "—"} años` : "No disponible"} />
                        <AudienceField label="Género" value={showList(adSet.targeting?.genders)} />
                        <AudienceField label="Ubicación" value={showList(adSet.targeting?.locations)} />
                        <AudienceField label="Intereses" value={showList(adSet.targeting?.interests)} />
                        <AudienceField label="Comportamientos" value={showList(adSet.targeting?.behaviors)} />
                        <AudienceField label="Demografía" value={showList(adSet.targeting?.demographics)} />
                        <AudienceField label="Ubicaciones del anuncio" value={showList([...(adSet.targeting?.publisherPlatforms || []), ...(adSet.targeting?.facebookPositions || []), ...(adSet.targeting?.instagramPositions || [])])} />
                        <AudienceField label="Dispositivos" value={showList(adSet.targeting?.devicePlatforms)} />
                        <AudienceField label="Exclusiones" value={showList(adSet.targeting?.exclusions, "Sin exclusiones informadas")} />
                      </div>

                      <div className="mt-5 border-t border-[#30363d] pt-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h5 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8b949e]">Anuncios de este conjunto</h5>
                          <span className="text-xs text-[#6e7681]">{adSet.ads.length}</span>
                        </div>
                        {adSet.ads.length === 0 ? (
                          <p className="text-xs text-[#8b949e]">No hay anuncios devueltos por Meta.</p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            {adSet.ads.map((ad, adIndex) => (
                              <AdPreviewCard
                                key={ad.id || `ad-${adIndex}`}
                                ad={ad}
                                adAccountId={detail.adAccountId}
                                perf={ad.name ? perfPorAnuncio.get(ad.name) ?? null : null}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#6e7681]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white" title={value}>{value}</p>
    </div>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#6e7681]">{label}</p>
      <p className="mt-1 break-words text-xs text-slate-200">{value}</p>
    </div>
  );
}

function AudienceField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[#6e7681]">{label}</p>
      <p className="mt-1 break-words text-xs leading-relaxed text-slate-200">{value}</p>
    </div>
  );
}

function EmptyDetail({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#30363d] p-5 text-center text-xs text-[#8b949e]">{text}</div>;
}

function AdPreviewCard({
  ad,
  adAccountId,
  perf,
}: {
  ad: CampaignDetail["adsets"][number]["ads"][number];
  adAccountId: string;
  perf?: AdPerf | null;
}) {
  const creative = ad.creative;
  const imageCandidate = creative?.imageUrl || creative?.thumbnailUrl;
  const imageUrl = isMetaImageUrl(imageCandidate) ? imageCandidate : null;
  const normalizedAdAccountId = adAccountId.replace(/^act_/, "");
  const adManagerUrl = ad.id
    ? `https://www.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(normalizedAdAccountId)}&selected_ad_ids=${encodeURIComponent(ad.id)}`
    : "https://adsmanager.facebook.com/adsmanager";
  const previewUrl = creative?.previewUrl || adManagerUrl;

  return (
    <article className="overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117]">
      {imageUrl && (
        <div className="relative aspect-[16/8] border-b border-[#30363d] bg-black">
          <Image src={imageUrl} alt={creative?.name || ad.name || "Creativo del anuncio"} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" unoptimized />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h6 className="truncate text-sm font-medium text-white">{ad.name || "Anuncio sin nombre"}</h6>
            <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#8b949e]">
              {creative?.format || "CREATIVO"} · {displayStatus(ad.effectiveStatus || ad.status)}
            </p>
          </div>
          <span className="shrink-0 text-xs text-[#8b949e]">{showDetailNumber(ad.insights?.impressions)} imp.</span>
        </div>
        {/* Lo que este anuncio trajo, no sólo lo que se ve. Un creativo bonito
            con cero leads es una decisión que tomar, no una foto que mirar. */}
        {perf && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-[#30363d] bg-[#161b22] p-2.5">
            <div>
              <p className="text-sm font-semibold tabular-nums text-white">{usd(perf.spend)}</p>
              <p className="text-[10px] text-[#6e7681]">Gasto</p>
            </div>
            <div>
              <p className="text-sm font-semibold tabular-nums text-white">{perf.leads}</p>
              <p className="text-[10px] text-[#6e7681]">Leads</p>
            </div>
            <div>
              <p
                className={`text-sm font-semibold tabular-nums ${
                  perf.costoPorLead === null ? "text-[#6e7681]" : "text-green-300"
                }`}
              >
                {perf.costoPorLead === null ? "—" : usd(perf.costoPorLead)}
              </p>
              <p className="text-[10px] text-[#6e7681]">Por lead</p>
            </div>
          </div>
        )}
        {creative?.primaryText && <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-300">{creative.primaryText}</p>}
        {creative?.headline && <p className="mt-2 text-xs font-medium text-white">{creative.headline}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-100 transition hover:bg-violet-500/30">
            <ExternalLink className="h-3.5 w-3.5" /> Ver anuncio en Meta
          </a>
          {creative?.destinationUrl && (
            <a href={creative.destinationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#30363d] px-3 py-1.5 text-xs text-[#8b949e] transition hover:text-white">
              Abrir destino
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function showDetailNumber(value: string | number | null | undefined): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : "—";
}

function showDetailMoney(value: string | number | null | undefined): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "—";
}

function showList(values: string[] | undefined, empty = "No definido por Meta"): string {
  return values && values.length > 0 ? values.join(", ") : empty;
}

function displayStatus(status: string | null | undefined): string {
  if (!status) return "Sin estado";
  return STATUS_LABEL[status] || status.replaceAll("_", " ").toLowerCase();
}

function isMetaImageUrl(value: string | null | undefined): value is string {
  if (!value || !value.startsWith("https://")) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname.endsWith(".fbcdn.net") || hostname.endsWith(".cdninstagram.com") || hostname.endsWith(".respond.io");
  } catch {
    return false;
  }
}

const HINT: Record<string, string> = {
  "Inversión": "Lo gastado en el periodo",
  "Impresiones": "Veces que se mostró",
  "Clics": "Personas que hicieron clic",
  "CTR": "De cada 100 que lo vieron, cuántas hicieron clic",
  "Costo por clic": "Lo que costó cada clic",
  "Personas alcanzadas": "Personas distintas que lo vieron",
};

const PAGE_LABEL: Record<string, string> = {
  page_impressions: "Veces que se vio la página",
  page_engaged_users: "Personas que interactuaron",
  page_post_engagements: "Interacciones con publicaciones",
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-500/15 text-green-300",
  PAUSED: "bg-amber-500/15 text-amber-300",
  ARCHIVED: "bg-zinc-500/15 text-zinc-400",
  DELETED: "bg-red-500/15 text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activa",
  PAUSED: "En pausa",
  ARCHIVED: "Archivada",
  DELETED: "Eliminada",
};

export default function AnunciosPage() {
  const { activeClientId, activeClient } = useActiveBrand();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pageMetrics, setPageMetrics] = useState<PageMetric[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<string>("last_7d");
  const [perf, setPerf] = useState<Performance | null>(null);
  // Fechas propias: sólo se aplican cuando las dos están puestas.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const custom = Boolean(desde && hasta && desde <= hasta);
  const [detailTarget, setDetailTarget] = useState<Campaign | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const rango = custom
        ? `since=${desde}&until=${hasta}`
        : `range=${periodo}`;
      const [insightRes, campaignRes, perfRes] = await Promise.all([
        fetch(`/api/meta/insights?clientId=${activeClientId}&${rango}`, { cache: "no-store" }),
        fetch(`/api/meta/campaigns?clientId=${activeClientId}`, { cache: "no-store" }),
        fetch(`/api/meta/performance?clientId=${activeClientId}&${rango}`, { cache: "no-store" }),
      ]);
      const insight = await insightRes.json().catch(() => null);
      const campaign = await campaignRes.json().catch(() => null);
      const rendimiento = await perfRes.json().catch(() => null);
      setPerf(rendimiento && Array.isArray(rendimiento.ads) ? rendimiento : null);
      setMetrics(Array.isArray(insight?.insights) ? insight.insights : []);
      setPageMetrics(Array.isArray(insight?.page) ? insight.page : []);
      setCampaigns(Array.isArray(campaign?.campaigns) ? campaign.campaigns : []);
      setAccount(insight?.adAccountId ?? null);
      setReason(insight?.reason || campaign?.reason || null);
      setNeedsConnect(Boolean(insight?.needsConnect));
    } finally {
      setLoading(false);
    }
  }, [activeClientId, periodo, desde, hasta, custom]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detailTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailTarget(null);
        setDetail(null);
        setDetailError(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detailTarget]);

  useEffect(() => {
    // Cambiar de marca no debe dejar abierto un detalle perteneciente a la
    // marca anterior, aunque ambas marcas estén dentro de la misma agencia.
    setDetailTarget(null);
    setDetail(null);
    setDetailError(null);
  }, [activeClientId]);

  const openCampaignDetail = useCallback(async (campaign: Campaign) => {
    if (!activeClientId) return;
    setDetailTarget(campaign);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ clientId: activeClientId });
      if (custom) {
        params.set("since", desde);
        params.set("until", hasta);
      } else {
        params.set("range", periodo);
      }
      const response = await fetch(
        `/api/meta/campaigns/${encodeURIComponent(campaign.id)}?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "No se pudo cargar el detalle de la campaña");
      setDetail(data as CampaignDetail);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "No se pudo cargar el detalle de la campaña");
    } finally {
      setDetailLoading(false);
    }
  }, [activeClientId, custom, desde, hasta, periodo]);

  const closeCampaignDetail = () => {
    setDetailTarget(null);
    setDetail(null);
    setDetailError(null);
  };

  return (
    <div className="min-h-full bg-[#0d1117]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#2d333b] bg-[#161b22] px-6 py-4">
        <div className="min-w-[220px] flex-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Megaphone className="h-5 w-5 text-violet-300" /> Anuncios
          </h1>
          <p className="text-xs text-[#8b949e]">
            Inversión y rendimiento de la pauta de <span className="text-white">{activeClient?.name ?? "—"}</span>
            {account && <span className="text-[#6e7681]"> · act_{account}</span>}
          </p>
        </div>
        <BrandPicker />
        <button
          onClick={() => void load()}
          className="rounded-md border border-[#2d333b] p-2 text-[#8b949e] transition hover:text-white"
          title="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <div className="space-y-6 p-6">
        {/* Periodo: preajustes para el día a día, fechas propias para un informe */}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-[#6e7681]" />
          <div className="flex flex-wrap gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPeriodo(p.id);
                  setDesde("");
                  setHasta("");
                }}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  !custom && periodo === p.id
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-[#8b949e] hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-[#6e7681]">
            <span>o entre</span>
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-md border border-[#2d333b] bg-[#0d1117] px-2 py-1 text-xs text-white"
            />
            <span>y</span>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-md border border-[#2d333b] bg-[#0d1117] px-2 py-1 text-xs text-white"
            />
            {(desde || hasta) && (
              <button
                type="button"
                onClick={() => {
                  setDesde("");
                  setHasta("");
                }}
                className="text-[#8b949e] underline-offset-2 hover:text-white hover:underline"
              >
                Quitar
              </button>
            )}
          </div>
        </div>

        {reason && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{reason}</span>
            {needsConnect && (
              <Link
                href="/clients"
                className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-100 transition hover:bg-violet-500/25"
              >
                <Plug className="h-3.5 w-3.5" /> Conectar
              </Link>
            )}
          </div>
        )}

        {/* Últimos 7 días */}
        <section>
          <h2 className="mb-3 text-xs uppercase tracking-[0.14em] text-[#6e7681]">
            {custom
              ? `Del ${desde} al ${hasta}`
              : PERIODOS.find((p) => p.id === periodo)?.label || "Periodo"}
          </h2>
          {metrics.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2d333b] p-10 text-center">
              <Megaphone className="mx-auto h-7 w-7 text-[#2d333b]" />
              <p className="mt-3 text-sm font-medium text-white">
                {loading ? "Cargando…" : "Sin datos de inversión"}
              </p>
              {!loading && !reason && (
                <p className="text-xs text-[#8b949e]">Esta cuenta no registró actividad en el periodo elegido.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {metrics.map((m) => (
                <div key={m.name} className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
                  <p className="text-2xl font-semibold tabular-nums text-white">{show(m)}</p>
                  <p className="mt-1 text-xs font-medium text-[#8b949e]">{m.name}</p>
                  {HINT[m.name] && <p className="mt-0.5 text-[10px] leading-snug text-[#6e7681]">{HINT[m.name]}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Qué anuncio conviene: gasto cruzado con los leads que trajo */}
        {perf && perf.ads.length > 0 && (
          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xs uppercase tracking-[0.14em] text-[#6e7681]">Qué anuncio conviene</h2>
              <p className="text-xs text-[#6e7681]">
                {usd(perf.totals.costoPorLead)} por lead
                {perf.totals.calificados > 0 && <> · {usd(perf.totals.costoPorCalificado)} por lead calificado</>}
              </p>
            </div>

            {perf.avisoSinClasificar && (
              <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {perf.avisoSinClasificar}
              </p>
            )}

            <div className="overflow-x-auto rounded-xl border border-[#2d333b] bg-[#161b22]">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-[#2d333b] text-left text-[11px] uppercase tracking-wider text-[#6e7681]">
                    <th className="px-4 py-2.5 font-medium">Anuncio</th>
                    <th className="px-4 py-2.5 text-right font-medium">Gasto</th>
                    <th className="px-4 py-2.5 text-right font-medium">Leads</th>
                    <th className="px-4 py-2.5 text-right font-medium">Por lead</th>
                    <th className="px-4 py-2.5 text-right font-medium">Calificados</th>
                    <th className="px-4 py-2.5 text-right font-medium">Por calificado</th>
                    <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                    <th className="px-4 py-2.5 text-right font-medium">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.ads.map((a, i) => (
                    <tr
                      key={`${a.campaignName}-${a.adName}-${i}`}
                      className="border-b border-[#2d333b] last:border-0"
                    >
                      <td className="px-4 py-3">
                        <span className="text-white">{a.adName}</span>
                        <span className="block text-[11px] text-[#6e7681]">{a.campaignName}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#8b949e]">{usd(a.spend)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-white">{a.leads}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {a.costoPorLead === null ? (
                          <span className="text-[#6e7681]">sin leads</span>
                        ) : (
                          <span className={i === 0 ? "font-semibold text-green-300" : "text-white"}>
                            {usd(a.costoPorLead)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#8b949e]">
                        {a.calificados}
                        {a.sinClasificar > 0 && (
                          <span className="block text-[10px] text-[#6e7681]">{a.sinClasificar} sin clasificar</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#8b949e]">
                        {usd(a.costoPorCalificado)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#8b949e]">{a.ctr.toFixed(2)} %</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#8b949e]">{usd(a.cpc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[11px] text-[#6e7681]">
              Ordenado por lo que cuesta cada lead, de más barato a más caro. El CTR dice quién llama la atención;
              el costo por lead calificado dice quién trae clientes.
              {perf.leadsSinAnuncio > 0 && (
                <> {perf.leadsSinAnuncio} lead{perf.leadsSinAnuncio === 1 ? "" : "s"} del periodo no se pudo atribuir a
                  ningún anuncio con gasto.</>
              )}
            </p>
          </section>
        )}

        {/* Campañas */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xs uppercase tracking-[0.14em] text-[#6e7681]">Campañas</h2>
            {campaigns.length > 0 && (
              <span className="text-xs text-[#6e7681]">
                {campaigns.length} {campaigns.length === 1 ? "campaña" : "campañas"}
              </span>
            )}
          </div>
          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2d333b] p-10 text-center text-xs text-[#8b949e]">
              {loading ? "Cargando…" : "Esta cuenta publicitaria no tiene campañas."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#2d333b] bg-[#161b22]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d333b] text-left text-[11px] uppercase tracking-wider text-[#6e7681]">
                    <th className="px-4 py-2.5 font-medium">Campaña</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Objetivo</th>
                    <th className="px-4 py-2.5 text-right font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-[#2d333b] last:border-0">
                      <td className="px-4 py-3 text-white">{c.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_STYLE[c.status ?? ""] || "bg-zinc-500/15 text-zinc-400"
                          }`}
                        >
                          {STATUS_LABEL[c.status ?? ""] || c.status || "—"}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-[#8b949e] sm:table-cell">
                        {objetivo(c.objective)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void openCampaignDetail(c)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-100 transition hover:bg-violet-500/25"
                        >
                          <Eye className="h-3.5 w-3.5" /> Ver más
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Página de Facebook */}
        {pageMetrics.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs uppercase tracking-[0.14em] text-[#6e7681]">Página de Facebook</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {pageMetrics.map((p) => {
                const total = (p.values || []).reduce((sum, v) => sum + (Number(v.value) || 0), 0);
                return (
                  <div key={p.name} className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
                    <p className="text-2xl font-semibold tabular-nums text-white">
                      {total.toLocaleString("es-CO")}
                    </p>
                    <p className="mt-1 text-xs text-[#8b949e]">{PAGE_LABEL[p.name] || p.name}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <p className="flex flex-wrap items-center gap-2 text-[11px] text-[#6e7681]">
          Los datos vienen de Meta, sin retoques.
          <a
            href="https://adsmanager.facebook.com/adsmanager"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#8b949e] transition hover:text-white"
          >
            <ExternalLink className="h-3 w-3" /> Abrir el Administrador de anuncios
          </a>
        </p>
      </div>

      {detailTarget && (
        <CampaignDetailDialog
          target={detailTarget}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={closeCampaignDetail}
          perf={perf}
          clientId={activeClientId}
          onChanged={() => {
            void load();
            void openCampaignDetail(detailTarget);
          }}
        />
      )}
    </div>
  );
}
