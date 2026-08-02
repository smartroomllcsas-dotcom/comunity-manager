// Sprint 26 · Agente P — PDF builder server-side.
//
// Usa @react-pdf/renderer para producir un PDF branded a partir de datos
// de analytics. Server-only (Node runtime), NO edge — depende de streams
// nativos y fonts embedded.
//
// Diseño (7 secciones — cada una una Page):
//   1. Cover           — logo grande, cliente, período, agency name
//   2. Summary         — 4 stat cards + intro branded
//   3. By platform     — tabla con barras coloreadas por brand
//   4. Top posts       — hasta 5 cards con thumbnail (opcional) + métricas
//   5. Timeseries      — line chart SVG dibujado con <Line>/<Path> nativos
//   6. Insights        — bullets de recomendaciones IA (si se pasaron)
//   7. Footer en todas — agency footer + página X/Y
//
// Colores:
//   Los pasa el caller vía `branding.primaryColor` / `secondaryColor`.
//   Fallback a un neutro corporativo si no vienen.

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Svg,
  Line,
  Path,
  Rect,
  Circle,
  pdf,
} from "@react-pdf/renderer";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ReportBranding {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  agencyName: string;
  agencyFooter: string;
}

export interface ReportData {
  branding: ReportBranding;
  client: { name: string; brand?: string };
  period: { type: string; start: string; end: string };
  summary: {
    impressions: number;
    engagement: number;
    followersGrowth: number;
    postsPublished: number;
  };
  byPlatform: Array<{
    platform: string;
    impressions: number;
    engagement: number;
    engagementRate: number;
  }>;
  topPosts: Array<{
    platform: string;
    content: string;
    thumbnail?: string;
    impressions: number;
    engagement: number;
    url?: string;
  }>;
  timeseries: Array<{ date: string; impressions: number; engagement: number }>;
  insights: string[];
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const DEFAULT_PRIMARY = "#1f2937";
const DEFAULT_SECONDARY = "#3b82f6";
const NEUTRAL_BG = "#f9fafb";
const NEUTRAL_TEXT = "#111827";
const MUTED_TEXT = "#6b7280";
const BORDER = "#e5e7eb";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.floor(n));
}

function safeColor(c: string | undefined, fallback: string): string {
  if (!c) return fallback;
  const trimmed = c.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return trimmed;
  return fallback;
}

function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
    return `${s.toLocaleDateString("es-ES", opts)} — ${e.toLocaleDateString("es-ES", opts)}`;
  } catch {
    return `${start} — ${end}`;
  }
}

// -----------------------------------------------------------------------------
// Styles factory (deps on branding colors)
// -----------------------------------------------------------------------------

function makeStyles(primary: string, secondary: string) {
  return StyleSheet.create({
    page: {
      backgroundColor: "#ffffff",
      padding: 40,
      paddingBottom: 60,
      fontFamily: "Helvetica",
      color: NEUTRAL_TEXT,
      fontSize: 10,
    },
    coverPage: {
      backgroundColor: primary,
      padding: 60,
      color: "#ffffff",
      fontFamily: "Helvetica",
      justifyContent: "center",
    },
    coverLogoWrap: { marginBottom: 40, alignItems: "flex-start" },
    coverLogo: { width: 140, height: 60, objectFit: "contain" },
    coverTitle: { fontSize: 36, fontWeight: "bold", marginBottom: 8, color: "#ffffff" },
    coverClient: { fontSize: 22, marginBottom: 20, color: "#ffffff", opacity: 0.9 },
    coverPeriod: { fontSize: 14, marginTop: 8, color: "#ffffff", opacity: 0.8 },
    coverAgency: { fontSize: 11, marginTop: 40, color: "#ffffff", opacity: 0.7 },

    sectionTitle: {
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 16,
      color: primary,
      borderBottomWidth: 2,
      borderBottomColor: secondary,
      paddingBottom: 6,
    },
    sectionSubtitle: {
      fontSize: 11,
      color: MUTED_TEXT,
      marginBottom: 20,
    },

    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
    statCard: {
      width: "47%",
      backgroundColor: NEUTRAL_BG,
      padding: 16,
      borderRadius: 6,
      borderLeftWidth: 4,
      borderLeftColor: secondary,
    },
    statLabel: { fontSize: 9, color: MUTED_TEXT, marginBottom: 4, textTransform: "uppercase" },
    statValue: { fontSize: 22, fontWeight: "bold", color: primary },

    table: { marginTop: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 4 },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    tableRowHeader: {
      flexDirection: "row",
      backgroundColor: primary,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    tableCellHeader: { fontSize: 10, color: "#ffffff", fontWeight: "bold" },
    tableCell: { fontSize: 10, color: NEUTRAL_TEXT },
    colPlatform: { width: "30%" },
    colImpr: { width: "25%", textAlign: "right" },
    colEng: { width: "25%", textAlign: "right" },
    colRate: { width: "20%", textAlign: "right" },

    postCard: {
      flexDirection: "row",
      backgroundColor: NEUTRAL_BG,
      padding: 12,
      borderRadius: 6,
      marginBottom: 10,
      gap: 12,
    },
    postThumb: { width: 60, height: 60, borderRadius: 4, backgroundColor: BORDER },
    postBody: { flex: 1 },
    postPlatform: { fontSize: 9, color: secondary, fontWeight: "bold", textTransform: "uppercase" },
    postContent: { fontSize: 10, marginTop: 4, color: NEUTRAL_TEXT, lineHeight: 1.4 },
    postMetrics: { fontSize: 9, color: MUTED_TEXT, marginTop: 6 },

    chartWrap: { marginTop: 12, marginBottom: 12 },

    insightItem: {
      flexDirection: "row",
      marginBottom: 10,
      paddingLeft: 4,
    },
    insightBullet: {
      fontSize: 12,
      color: secondary,
      marginRight: 8,
      fontWeight: "bold",
    },
    insightText: { fontSize: 10, lineHeight: 1.5, flex: 1, color: NEUTRAL_TEXT },

    footer: {
      position: "absolute",
      bottom: 24,
      left: 40,
      right: 40,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8,
      color: MUTED_TEXT,
      borderTopWidth: 1,
      borderTopColor: BORDER,
      paddingTop: 8,
    },
  });
}

// -----------------------------------------------------------------------------
// Cover page
// -----------------------------------------------------------------------------

function CoverPage({ data, styles, primary }: { data: ReportData; styles: ReturnType<typeof makeStyles>; primary: string }) {
  return (
    <Page size="A4" style={styles.coverPage}>
      {data.branding.logoUrl ? (
        <View style={styles.coverLogoWrap}>
          {/* Image tolerará URLs remotas si react-pdf las puede resolver */}
          <Image src={data.branding.logoUrl} style={styles.coverLogo} />
        </View>
      ) : null}
      <Text style={styles.coverTitle}>Reporte de resultados</Text>
      <Text style={styles.coverClient}>{data.client.name}</Text>
      <Text style={styles.coverPeriod}>{formatPeriod(data.period.start, data.period.end)}</Text>
      <Text style={styles.coverPeriod}>Tipo: {data.period.type}</Text>
      <Text style={styles.coverAgency}>Preparado por {data.branding.agencyName}</Text>
    </Page>
  );
}

// -----------------------------------------------------------------------------
// Summary page (4 stat cards)
// -----------------------------------------------------------------------------

function SummaryPage({ data, styles, footer }: { data: ReportData; styles: ReturnType<typeof makeStyles>; footer: React.ReactNode }) {
  const cards = [
    { label: "Impresiones", value: formatNumber(data.summary.impressions) },
    { label: "Engagement", value: formatNumber(data.summary.engagement) },
    { label: "Crecimiento seguidores", value: formatNumber(data.summary.followersGrowth) },
    { label: "Posts publicados", value: String(data.summary.postsPublished) },
  ];
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Resumen del período</Text>
      <Text style={styles.sectionSubtitle}>
        Métricas agregadas de todas las plataformas conectadas para {data.client.name} durante el período seleccionado.
      </Text>
      <View style={styles.statGrid}>
        {cards.map((c) => (
          <View key={c.label} style={styles.statCard} wrap={false}>
            <Text style={styles.statLabel}>{c.label}</Text>
            <Text style={styles.statValue}>{c.value}</Text>
          </View>
        ))}
      </View>
      {footer}
    </Page>
  );
}

// -----------------------------------------------------------------------------
// By platform page
// -----------------------------------------------------------------------------

function ByPlatformPage({
  data, styles, footer,
}: { data: ReportData; styles: ReturnType<typeof makeStyles>; footer: React.ReactNode }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Rendimiento por plataforma</Text>
      <View style={styles.table}>
        <View style={styles.tableRowHeader}>
          <Text style={[styles.tableCellHeader, styles.colPlatform]}>Plataforma</Text>
          <Text style={[styles.tableCellHeader, styles.colImpr]}>Impresiones</Text>
          <Text style={[styles.tableCellHeader, styles.colEng]}>Engagement</Text>
          <Text style={[styles.tableCellHeader, styles.colRate]}>Rate</Text>
        </View>
        {data.byPlatform.map((row, i) => (
          <View key={row.platform + i} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCell, styles.colPlatform]}>{row.platform}</Text>
            <Text style={[styles.tableCell, styles.colImpr]}>{formatNumber(row.impressions)}</Text>
            <Text style={[styles.tableCell, styles.colEng]}>{formatNumber(row.engagement)}</Text>
            <Text style={[styles.tableCell, styles.colRate]}>
              {(row.engagementRate * 100).toFixed(2)}%
            </Text>
          </View>
        ))}
      </View>
      {footer}
    </Page>
  );
}

// -----------------------------------------------------------------------------
// Top posts page
// -----------------------------------------------------------------------------

function TopPostsPage({
  data, styles, footer,
}: { data: ReportData; styles: ReturnType<typeof makeStyles>; footer: React.ReactNode }) {
  const top = data.topPosts.slice(0, 5);
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Top posts del período</Text>
      <Text style={styles.sectionSubtitle}>Los 5 posts con mayor engagement.</Text>
      {top.map((p, i) => {
        const excerpt = p.content?.length > 180 ? p.content.slice(0, 177) + "..." : p.content;
        return (
          <View key={i} style={styles.postCard} wrap={false}>
            {p.thumbnail ? (
              <Image src={p.thumbnail} style={styles.postThumb} />
            ) : (
              <View style={styles.postThumb} />
            )}
            <View style={styles.postBody}>
              <Text style={styles.postPlatform}>{p.platform}</Text>
              <Text style={styles.postContent}>{excerpt || "(sin texto)"}</Text>
              <Text style={styles.postMetrics}>
                {formatNumber(p.impressions)} impresiones · {formatNumber(p.engagement)} engagement
              </Text>
            </View>
          </View>
        );
      })}
      {footer}
    </Page>
  );
}

// -----------------------------------------------------------------------------
// Timeseries page (line chart via SVG)
// -----------------------------------------------------------------------------

function TimeseriesPage({
  data, styles, primary, secondary, footer,
}: {
  data: ReportData;
  styles: ReturnType<typeof makeStyles>;
  primary: string;
  secondary: string;
  footer: React.ReactNode;
}) {
  const series = data.timeseries.length > 0
    ? data.timeseries
    : [{ date: "", impressions: 0, engagement: 0 }];

  const width = 500;
  const height = 200;
  const padL = 30;
  const padR = 10;
  const padT = 20;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxImpr = Math.max(1, ...series.map((s) => s.impressions));
  const maxEng = Math.max(1, ...series.map((s) => s.engagement));

  const pointsImpr = series.map((s, i) => {
    const x = padL + (i / Math.max(1, series.length - 1)) * innerW;
    const y = padT + innerH - (s.impressions / maxImpr) * innerH;
    return { x, y };
  });
  const pointsEng = series.map((s, i) => {
    const x = padL + (i / Math.max(1, series.length - 1)) * innerW;
    const y = padT + innerH - (s.engagement / maxEng) * innerH;
    return { x, y };
  });

  const pathImpr = pointsImpr
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const pathEng = pointsEng
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Evolución en el tiempo</Text>
      <Text style={styles.sectionSubtitle}>
        Impresiones (azul) y engagement (color secundario) durante el período.
      </Text>
      <View style={styles.chartWrap}>
        <Svg width={width} height={height}>
          {/* Axis */}
          <Line
            x1={padL} y1={padT + innerH}
            x2={padL + innerW} y2={padT + innerH}
            strokeWidth={0.5}
            stroke={BORDER}
          />
          <Line
            x1={padL} y1={padT}
            x2={padL} y2={padT + innerH}
            strokeWidth={0.5}
            stroke={BORDER}
          />
          {/* Impressions line */}
          <Path d={pathImpr} stroke={primary} strokeWidth={1.5} fill="none" />
          {/* Engagement line */}
          <Path d={pathEng} stroke={secondary} strokeWidth={1.5} fill="none" />
          {/* Endpoints */}
          {pointsImpr.length > 0 && (
            <Circle
              cx={pointsImpr[pointsImpr.length - 1].x}
              cy={pointsImpr[pointsImpr.length - 1].y}
              r={2}
              fill={primary}
            />
          )}
          {pointsEng.length > 0 && (
            <Circle
              cx={pointsEng[pointsEng.length - 1].x}
              cy={pointsEng[pointsEng.length - 1].y}
              r={2}
              fill={secondary}
            />
          )}
        </Svg>
      </View>
      <View style={{ flexDirection: "row", gap: 20, marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 12, height: 3, backgroundColor: primary }} />
          <Text style={{ fontSize: 9, color: MUTED_TEXT }}>Impresiones (max {formatNumber(maxImpr)})</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 12, height: 3, backgroundColor: secondary }} />
          <Text style={{ fontSize: 9, color: MUTED_TEXT }}>Engagement (max {formatNumber(maxEng)})</Text>
        </View>
      </View>
      {footer}
    </Page>
  );
}

// -----------------------------------------------------------------------------
// Insights page
// -----------------------------------------------------------------------------

function InsightsPage({
  data, styles, footer,
}: { data: ReportData; styles: ReturnType<typeof makeStyles>; footer: React.ReactNode }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Insights y recomendaciones</Text>
      <Text style={styles.sectionSubtitle}>
        Puntos clave y próximas acciones sugeridas.
      </Text>
      {data.insights.map((it, i) => (
        <View key={i} style={styles.insightItem} wrap={false}>
          <Text style={styles.insightBullet}>{i + 1}.</Text>
          <Text style={styles.insightText}>{it}</Text>
        </View>
      ))}
      {footer}
    </Page>
  );
}

// -----------------------------------------------------------------------------
// Footer factory (con paginación X/Y via render prop)
// -----------------------------------------------------------------------------

function makeFooter(agencyFooter: string, styles: ReturnType<typeof makeStyles>) {
  return (
    <View style={styles.footer} fixed>
      <Text>{agencyFooter}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

// -----------------------------------------------------------------------------
// Document
// -----------------------------------------------------------------------------

function ReportDoc({ data }: { data: ReportData }) {
  const primary = safeColor(data.branding.primaryColor, DEFAULT_PRIMARY);
  const secondary = safeColor(data.branding.secondaryColor, DEFAULT_SECONDARY);
  const styles = makeStyles(primary, secondary);
  const footer = makeFooter(data.branding.agencyFooter || data.branding.agencyName, styles);

  return (
    <Document
      title={`Reporte ${data.client.name} — ${data.period.start} → ${data.period.end}`}
      author={data.branding.agencyName}
      creator="community-manager-platform"
      producer="community-manager-platform"
    >
      <CoverPage data={data} styles={styles} primary={primary} />
      <SummaryPage data={data} styles={styles} footer={footer} />
      <ByPlatformPage data={data} styles={styles} footer={footer} />
      <TopPostsPage data={data} styles={styles} footer={footer} />
      <TimeseriesPage data={data} styles={styles} primary={primary} secondary={secondary} footer={footer} />
      {data.insights.length > 0 && (
        <InsightsPage data={data} styles={styles} footer={footer} />
      )}
    </Document>
  );
}

// -----------------------------------------------------------------------------
// Public entry
// -----------------------------------------------------------------------------

/**
 * Renderiza el PDF a Buffer. Server-only (Node runtime).
 * Consumo de memoria típico: 20-80MB durante la generación.
 */
export async function buildReportPdf(data: ReportData): Promise<Buffer> {
  const instance = pdf(<ReportDoc data={data} />);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
