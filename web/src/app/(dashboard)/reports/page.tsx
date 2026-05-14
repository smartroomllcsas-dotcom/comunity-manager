"use client";

import { useState, useMemo } from "react";
import {
  MessageSquare,
  CheckCircle2,
  Clock,
  UserPlus,
  TrendingUp,
  TrendingDown,
  Send,
  Mail,
  Eye,
  AlertCircle,
  Users,
  BarChart3,
  Radio,
} from "lucide-react";
import { useReports, type ReportFilters } from "@/hooks/useReports";

/* ------------------------------------------------------------------ */
/*  Date presets                                                       */
/* ------------------------------------------------------------------ */
type PresetKey =
  | "today"
  | "yesterday"
  | "last7"
  | "last14"
  | "last30"
  | "thisMonth"
  | "lastMonth";

const presets: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "last7", label: "Ultimos 7 dias" },
  { key: "last14", label: "Ultimos 14 dias" },
  { key: "last30", label: "Ultimos 30 dias" },
  { key: "thisMonth", label: "Este mes" },
  { key: "lastMonth", label: "Mes anterior" },
];

function getPresetRange(key: PresetKey): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (key) {
    case "today":
      return { dateFrom: iso(today), dateTo: iso(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { dateFrom: iso(y), dateTo: iso(y) };
    }
    case "last7": {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { dateFrom: iso(s), dateTo: iso(today) };
    }
    case "last14": {
      const s = new Date(today);
      s.setDate(s.getDate() - 13);
      return { dateFrom: iso(s), dateTo: iso(today) };
    }
    case "last30": {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      return { dateFrom: iso(s), dateTo: iso(today) };
    }
    case "thisMonth": {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dateFrom: iso(s), dateTo: iso(today) };
    }
    case "lastMonth": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { dateFrom: iso(s), dateTo: iso(e) };
    }
  }
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Formatters                                                         */
/* ------------------------------------------------------------------ */
function fmtMs(ms: number): string {
  if (ms === 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const rm = min % 60;
  return `${hr}h ${rm}m`;
}

function fmtDate(d: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/*  Reusable Components                                                */
/* ------------------------------------------------------------------ */

/* KPI Card */
function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex-1 min-w-[200px] rounded-xl bg-[#1a1f2e] border border-[#2d333b] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[#8b949e] text-sm font-medium">{label}</span>
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + "20" }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
      <div>
        <span className="text-3xl font-bold text-white">{value}</span>
        {sub && (
          <p className="text-xs text-[#8b949e] mt-1">{sub}</p>
        )}
      </div>
    </div>
  );
}

/* Bar chart — single series */
function BarChart({
  data,
  color = "bg-blue-500",
  hoverColor = "hover:bg-blue-400",
}: {
  data: { label: string; value: number }[];
  color?: string;
  hoverColor?: string;
}) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center group">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white bg-[#2d333b] px-1.5 py-0.5 rounded mb-1 whitespace-nowrap">
            {item.value}
          </div>
          <div className="w-full flex justify-center" style={{ height: "120px" }}>
            <div
              className={`w-full max-w-[28px] rounded-t ${color} ${hoverColor} transition-all cursor-pointer`}
              style={{
                height: `${Math.max((item.value / maxVal) * 100, 2)}%`,
                minHeight: item.value > 0 ? "6px" : "2px",
                alignSelf: "flex-end",
              }}
            />
          </div>
          <span className="text-[10px] text-[#8b949e] mt-1 truncate w-full text-center">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* Dual bar chart (two series side by side) */
function DualBarChart({
  data,
  legend,
}: {
  data: { label: string; a: number; b: number }[];
  legend: [string, string];
}) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.a, d.b)), 1);
  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-xs text-[#8b949e]">
          <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
          {legend[0]}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[#8b949e]">
          <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
          {legend[1]}
        </span>
      </div>
      <div className="flex items-end gap-1 h-40">
        {data.map((item, i) => (
          <div key={i} className="flex-1 flex flex-col items-center group">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white bg-[#2d333b] px-1.5 py-0.5 rounded mb-1 whitespace-nowrap">
              {item.a} / {item.b}
            </div>
            <div className="w-full flex items-end justify-center gap-[2px]" style={{ height: "120px" }}>
              <div
                className="flex-1 max-w-[14px] rounded-t bg-blue-500 hover:bg-blue-400 transition-all cursor-pointer"
                style={{
                  height: `${Math.max((item.a / maxVal) * 100, 2)}%`,
                  minHeight: item.a > 0 ? "4px" : "2px",
                }}
              />
              <div
                className="flex-1 max-w-[14px] rounded-t bg-emerald-500 hover:bg-emerald-400 transition-all cursor-pointer"
                style={{
                  height: `${Math.max((item.b / maxVal) * 100, 2)}%`,
                  minHeight: item.b > 0 ? "4px" : "2px",
                }}
              />
            </div>
            <span className="text-[10px] text-[#8b949e] mt-1 truncate w-full text-center">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Progress bar row */
function ProgressRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[#c9d1d9] w-32 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-[#161b22] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm text-white font-medium w-12 text-right">{value}</span>
    </div>
  );
}

/* Card wrapper */
function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-[#1a1f2e] border border-[#2d333b] p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-white font-semibold text-base">{title}</h3>
        {subtitle && <p className="text-[#8b949e] text-xs mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* Status badge */
const statusLabels: Record<string, string> = {
  open: "Abierta",
  pending: "Pendiente",
  resolved: "Resuelta",
  closed: "Cerrada",
};
const statusColors: Record<string, string> = {
  open: "#3b82f6",
  pending: "#f59e0b",
  resolved: "#10b981",
  closed: "#8b949e",
};

/* Message type labels */
const typeLabels: Record<string, string> = {
  text: "Texto",
  image: "Imagen",
  video: "Video",
  audio: "Audio",
  document: "Documento",
  template: "Plantilla",
  interactive: "Interactivo",
  location: "Ubicacion",
  sticker: "Sticker",
};

/* ------------------------------------------------------------------ */
/*  Tab Content Components                                             */
/* ------------------------------------------------------------------ */

/* Tab 1: Resumen */
function TabResumen({ data }: { data: NonNullable<ReturnType<typeof useReports>["data"]> }) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        <KPICard
          icon={MessageSquare}
          label="Total Conversaciones"
          value={data.totalConversations}
          color="#3b82f6"
        />
        <KPICard
          icon={CheckCircle2}
          label="Tasa de Resolucion"
          value={`${data.resolutionRate}%`}
          sub={`${data.resolvedConversations} resueltas de ${data.totalConversations}`}
          color="#10b981"
        />
        <KPICard
          icon={Clock}
          label="Tiempo Prom. de Respuesta"
          value={fmtMs(data.avgResponseTimeMs)}
          color="#f59e0b"
        />
        <KPICard
          icon={UserPlus}
          label="Contactos Nuevos"
          value={data.newContacts}
          sub={`${data.totalContacts} total`}
          color="#8b5cf6"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Conversaciones Abiertas / Cerradas" subtitle="Por dia">
          <DualBarChart
            data={data.conversationsPerDay.map((d) => ({
              label: d.label,
              a: d.opened,
              b: d.closed,
            }))}
            legend={["Abiertas", "Cerradas"]}
          />
        </Card>
        <Card title="Volumen de Mensajes" subtitle="Entrantes vs Salientes por dia">
          <DualBarChart
            data={data.messagesPerDay.map((d) => ({
              label: d.label,
              a: d.inbound,
              b: d.outbound,
            }))}
            legend={["Entrantes", "Salientes"]}
          />
        </Card>
      </div>
    </div>
  );
}

/* Tab 2: Conversaciones */
function TabConversaciones({ data }: { data: NonNullable<ReturnType<typeof useReports>["data"]> }) {
  const maxStatus = Math.max(...data.conversationsByStatus.map((s) => s.count), 1);
  const maxChannel = Math.max(...data.conversationsByChannel.map((c) => c.count), 1);

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card title="Conversaciones Abiertas vs Cerradas" subtitle="Por dia">
        <DualBarChart
          data={data.conversationsPerDay.map((d) => ({
            label: d.label,
            a: d.opened,
            b: d.closed,
          }))}
          legend={["Abiertas", "Cerradas"]}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By status */}
        <Card title="Conversaciones por Estado">
          <div className="space-y-3">
            {data.conversationsByStatus.map((s) => (
              <ProgressRow
                key={s.status}
                label={statusLabels[s.status] || s.status}
                value={s.count}
                max={maxStatus}
                color={statusColors[s.status] || "#3b82f6"}
              />
            ))}
            {data.conversationsByStatus.length === 0 && (
              <p className="text-[#8b949e] text-sm text-center py-6">Sin datos</p>
            )}
          </div>
        </Card>

        {/* By channel */}
        <Card title="Conversaciones por Canal">
          <div className="space-y-3">
            {data.conversationsByChannel.map((c) => (
              <ProgressRow
                key={c.channel}
                label={c.channel}
                value={c.count}
                max={maxChannel}
                color="#3b82f6"
              />
            ))}
            {data.conversationsByChannel.length === 0 && (
              <p className="text-[#8b949e] text-sm text-center py-6">Sin datos</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent closed table */}
      <Card title="Conversaciones Cerradas Recientes">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#8b949e] text-xs border-b border-[#2d333b]">
                <th className="text-left px-3 py-2.5 font-medium">Contacto</th>
                <th className="text-left px-3 py-2.5 font-medium">Canal</th>
                <th className="text-left px-3 py-2.5 font-medium">Abierta</th>
                <th className="text-left px-3 py-2.5 font-medium">Cerrada</th>
                <th className="text-left px-3 py-2.5 font-medium">Categoria</th>
                <th className="text-left px-3 py-2.5 font-medium">Agente</th>
              </tr>
            </thead>
            <tbody>
              {data.recentClosedConversations.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-[#8b949e] py-10">
                    No hay conversaciones cerradas en este periodo
                  </td>
                </tr>
              )}
              {data.recentClosedConversations.map((c, i) => (
                <tr
                  key={i}
                  className="border-b border-[#2d333b]/50 hover:bg-[#161b22] transition-colors"
                >
                  <td className="px-3 py-2.5 text-white font-medium">{c.contactName}</td>
                  <td className="px-3 py-2.5 text-[#8b949e]">{c.channel}</td>
                  <td className="px-3 py-2.5 text-[#8b949e] text-xs whitespace-nowrap">{fmtDate(c.openedAt)}</td>
                  <td className="px-3 py-2.5 text-[#8b949e] text-xs whitespace-nowrap">{fmtDate(c.closedAt)}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded-md bg-[#161b22] text-[#8b949e] text-xs">
                      {c.category}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#c9d1d9]">{c.agent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* Tab 3: Mensajes */
function TabMensajes({ data }: { data: NonNullable<ReturnType<typeof useReports>["data"]> }) {
  const maxType = Math.max(...data.messagesByType.map((t) => t.count), 1);
  const maxHour = Math.max(...data.messagesByHour.map((h) => h.count), 1);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        <KPICard icon={Mail} label="Mensajes Recibidos" value={data.totalInbound} color="#3b82f6" />
        <KPICard icon={Send} label="Mensajes Enviados" value={data.totalOutbound} color="#10b981" />
        <KPICard
          icon={MessageSquare}
          label="Total Mensajes"
          value={data.totalInbound + data.totalOutbound}
          color="#8b5cf6"
        />
      </div>

      {/* Messages per day */}
      <Card title="Mensajes por Dia" subtitle="Entrantes vs Salientes">
        <DualBarChart
          data={data.messagesPerDay.map((d) => ({
            label: d.label,
            a: d.inbound,
            b: d.outbound,
          }))}
          legend={["Entrantes", "Salientes"]}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By type */}
        <Card title="Mensajes por Tipo">
          <div className="space-y-3">
            {data.messagesByType
              .sort((a, b) => b.count - a.count)
              .map((t) => (
                <ProgressRow
                  key={t.type}
                  label={typeLabels[t.type] || t.type}
                  value={t.count}
                  max={maxType}
                  color="#3b82f6"
                />
              ))}
            {data.messagesByType.length === 0 && (
              <p className="text-[#8b949e] text-sm text-center py-6">Sin datos</p>
            )}
          </div>
        </Card>

        {/* By hour */}
        <Card title="Horas de Mayor Actividad" subtitle="Mensajes por hora del dia">
          <BarChart
            data={data.messagesByHour.map((h) => ({
              label: `${String(h.hour).padStart(2, "0")}`,
              value: h.count,
            }))}
          />
        </Card>
      </div>
    </div>
  );
}

/* Tab 4: Contactos */
function TabContactos({ data }: { data: NonNullable<ReturnType<typeof useReports>["data"]> }) {
  const maxChannel = Math.max(...data.contactsByChannel.map((c) => c.count), 1);
  const maxLifecycle = Math.max(...data.contactsByLifecycle.map((l) => l.count), 1);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        <KPICard icon={UserPlus} label="Nuevos Contactos" value={data.newContacts} color="#10b981" />
        <KPICard icon={Users} label="Total Contactos" value={data.totalContacts} color="#3b82f6" />
      </div>

      {/* Growth chart */}
      <Card title="Crecimiento de Contactos" subtitle="Nuevos contactos por dia">
        <BarChart
          data={data.contactsPerDay.map((d) => ({
            label: d.label,
            value: d.count,
          }))}
          color="bg-emerald-500"
          hoverColor="hover:bg-emerald-400"
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By channel */}
        <Card title="Contactos por Canal">
          <div className="space-y-3">
            {data.contactsByChannel.map((c) => (
              <ProgressRow
                key={c.channel}
                label={c.channel}
                value={c.count}
                max={maxChannel}
                color="#3b82f6"
              />
            ))}
            {data.contactsByChannel.length === 0 && (
              <p className="text-[#8b949e] text-sm text-center py-6">Sin datos</p>
            )}
          </div>
        </Card>

        {/* By lifecycle */}
        <Card title="Contactos por Etapa del Ciclo de Vida">
          <div className="space-y-3">
            {data.contactsByLifecycle.map((l) => (
              <ProgressRow
                key={l.stage}
                label={l.stage}
                value={l.count}
                max={maxLifecycle}
                color={l.color || "#3b82f6"}
              />
            ))}
            {data.contactsByLifecycle.length === 0 && (
              <p className="text-[#8b949e] text-sm text-center py-6">Sin etapas configuradas</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* Tab 5: Agentes */
function TabAgentes({ data }: { data: NonNullable<ReturnType<typeof useReports>["data"]> }) {
  const maxConvos = Math.max(...data.agentPerformance.map((a) => a.assignedConversations), 1);

  return (
    <div className="space-y-6">
      {/* Agent bar chart */}
      <Card title="Conversaciones por Agente">
        <BarChart
          data={data.agentPerformance.map((a) => ({
            label: a.name.split(" ")[0],
            value: a.assignedConversations,
          }))}
          color="bg-indigo-500"
          hoverColor="hover:bg-indigo-400"
        />
      </Card>

      {/* Agent table */}
      <Card title="Rendimiento de Agentes">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#8b949e] text-xs border-b border-[#2d333b]">
                <th className="text-left px-3 py-2.5 font-medium">Agente</th>
                <th className="text-right px-3 py-2.5 font-medium">Conv. Asignadas</th>
                <th className="text-right px-3 py-2.5 font-medium">Conv. Cerradas</th>
                <th className="text-right px-3 py-2.5 font-medium">Mensajes Enviados</th>
                <th className="text-right px-3 py-2.5 font-medium">Tiempo Prom. Respuesta</th>
              </tr>
            </thead>
            <tbody>
              {data.agentPerformance.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-[#8b949e] py-10">
                    No hay agentes
                  </td>
                </tr>
              )}
              {data.agentPerformance.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[#2d333b]/50 hover:bg-[#161b22] transition-colors"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {a.name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="text-white font-medium">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-[#c9d1d9]">{a.assignedConversations}</td>
                  <td className="px-3 py-3 text-right text-[#c9d1d9]">{a.closedConversations}</td>
                  <td className="px-3 py-3 text-right text-[#c9d1d9]">{a.messagesSent}</td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                        a.avgResponseTimeMs === 0
                          ? "bg-[#161b22] text-[#8b949e]"
                          : a.avgResponseTimeMs < 300000
                          ? "bg-green-500/10 text-green-400"
                          : a.avgResponseTimeMs < 900000
                          ? "bg-yellow-500/10 text-yellow-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {fmtMs(a.avgResponseTimeMs)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* Tab 6: Difusiones */
function TabDifusiones({ data }: { data: NonNullable<ReturnType<typeof useReports>["data"]> }) {
  return (
    <div className="space-y-6">
      {/* Broadcast performance chart */}
      {data.broadcastMetrics.length > 0 && (
        <Card title="Rendimiento de Difusiones" subtitle="Tasa de entrega por difusion">
          <BarChart
            data={data.broadcastMetrics.map((b) => ({
              label: b.name.length > 12 ? b.name.slice(0, 12) + "..." : b.name,
              value: b.deliveryRate,
            }))}
            color="bg-cyan-500"
            hoverColor="hover:bg-cyan-400"
          />
        </Card>
      )}

      {/* Broadcast table */}
      <Card title="Difusiones Recientes">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#8b949e] text-xs border-b border-[#2d333b]">
                <th className="text-left px-3 py-2.5 font-medium">Nombre</th>
                <th className="text-right px-3 py-2.5 font-medium">Enviados</th>
                <th className="text-right px-3 py-2.5 font-medium">Entregados</th>
                <th className="text-right px-3 py-2.5 font-medium">Leidos</th>
                <th className="text-right px-3 py-2.5 font-medium">Fallidos</th>
                <th className="text-right px-3 py-2.5 font-medium">Tasa Entrega</th>
                <th className="text-right px-3 py-2.5 font-medium">Tasa Lectura</th>
                <th className="text-left px-3 py-2.5 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.broadcastMetrics.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-[#8b949e] py-10">
                    No hay difusiones en este periodo
                  </td>
                </tr>
              )}
              {data.broadcastMetrics.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-[#2d333b]/50 hover:bg-[#161b22] transition-colors"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-cyan-400 shrink-0" />
                      <span className="text-white font-medium truncate max-w-[200px]">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-[#c9d1d9]">{b.sentCount}</td>
                  <td className="px-3 py-3 text-right text-[#c9d1d9]">{b.deliveredCount}</td>
                  <td className="px-3 py-3 text-right text-[#c9d1d9]">{b.readCount}</td>
                  <td className="px-3 py-3 text-right text-red-400">{b.failedCount}</td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                        b.deliveryRate >= 90
                          ? "bg-green-500/10 text-green-400"
                          : b.deliveryRate >= 70
                          ? "bg-yellow-500/10 text-yellow-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {b.deliveryRate}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400">
                      {b.readRate}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[#8b949e] text-xs whitespace-nowrap">
                    {fmtDate(b.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */
function ReportsSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 min-w-[200px] h-28 rounded-xl bg-[#1a1f2e] border border-[#2d333b]" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 rounded-xl bg-[#1a1f2e] border border-[#2d333b]" />
        <div className="h-64 rounded-xl bg-[#1a1f2e] border border-[#2d333b]" />
      </div>
      <div className="h-72 rounded-xl bg-[#1a1f2e] border border-[#2d333b]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */
type TabKey = "resumen" | "conversaciones" | "mensajes" | "contactos" | "agentes" | "difusiones";

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "resumen", label: "Resumen", icon: BarChart3 },
  { key: "conversaciones", label: "Conversaciones", icon: MessageSquare },
  { key: "mensajes", label: "Mensajes", icon: Send },
  { key: "contactos", label: "Contactos", icon: Users },
  { key: "agentes", label: "Agentes", icon: UserPlus },
  { key: "difusiones", label: "Difusiones", icon: Radio },
];

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */
export default function ReportsPage() {
  const [preset, setPreset] = useState<PresetKey>("last14");
  const [activeTab, setActiveTab] = useState<TabKey>("resumen");
  const [showPresets, setShowPresets] = useState(false);

  const filters: ReportFilters = useMemo(() => getPresetRange(preset), [preset]);
  const { data, isLoading } = useReports(filters);

  const currentPresetLabel = presets.find((p) => p.key === preset)?.label || "";

  return (
    <div className="p-6 bg-[#0d1117] min-h-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Reportes</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Analisis detallado de tu plataforma de mensajeria
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="relative">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a1f2e] border border-[#2d333b] text-[#c9d1d9] text-sm hover:border-[#444c56] transition-colors"
          >
            <Clock className="h-4 w-4 text-[#8b949e]" />
            {currentPresetLabel}
            <svg className="h-4 w-4 text-[#8b949e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showPresets && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPresets(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg bg-[#1a1f2e] border border-[#2d333b] shadow-xl py-1">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setPreset(p.key);
                      setShowPresets(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      preset === p.key
                        ? "bg-blue-500/10 text-blue-400"
                        : "text-[#c9d1d9] hover:bg-[#161b22]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Date range display */}
      <div className="text-xs text-[#8b949e]">
        {filters.dateFrom} — {filters.dateTo}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-[#2d333b]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-[1px] ${
                isActive
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#444c56]"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading || !data ? (
        <ReportsSkeleton />
      ) : (
        <>
          {activeTab === "resumen" && <TabResumen data={data} />}
          {activeTab === "conversaciones" && <TabConversaciones data={data} />}
          {activeTab === "mensajes" && <TabMensajes data={data} />}
          {activeTab === "contactos" && <TabContactos data={data} />}
          {activeTab === "agentes" && <TabAgentes data={data} />}
          {activeTab === "difusiones" && <TabDifusiones data={data} />}
        </>
      )}
    </div>
  );
}
