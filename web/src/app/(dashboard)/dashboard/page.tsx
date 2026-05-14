"use client";

import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useContacts } from "@/hooks/useContacts";
import { useAgents } from "@/hooks/useAgents";
import { useState } from "react";
import {
  Users,
  UserX,
  UserPlus,
  MessageSquare,
  Send,
  TrendingUp,
  TrendingDown,
  Phone,
  Clock,
} from "lucide-react";
import type { Agent, Contact } from "@/types/database";

/* ------------------------------------------------------------------ */
/*  Stat Card                                                         */
/* ------------------------------------------------------------------ */
function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  color: string;
}) {
  return (
    <div className="min-w-[200px] flex-1 rounded-xl bg-[#1a1f2e] border border-[#2d333b] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[#8b949e] text-sm font-medium">{label}</span>
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + "20" }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-white">{value}</span>
        {trend && trendLabel && (
          <span
            className={`flex items-center gap-1 text-xs font-medium pb-1 ${
              trend === "up"
                ? "text-green-400"
                : trend === "down"
                ? "text-red-400"
                : "text-[#8b949e]"
            }`}
          >
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : trend === "down" ? (
              <TrendingDown className="h-3 w-3" />
            ) : null}
            {trendLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Contact avatar helper                                             */
/* ------------------------------------------------------------------ */
function ContactAvatar({ name }: { name: string | null }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="h-8 w-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-semibold shrink-0">
      {initials}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Contacts Table                                                    */
/* ------------------------------------------------------------------ */
function ContactsTable({ contacts }: { contacts: Contact[] }) {
  const [tab, setTab] = useState<"all" | "assigned" | "unassigned">("all");
  const [page, setPage] = useState(0);
  const perPage = 8;

  const filtered = contacts; // filtering by assignment would need conversations joined; show all for now
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  return (
    <div className="rounded-xl bg-[#1a1f2e] border border-[#2d333b] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-white font-semibold text-base">Contactos Recientes</h2>
        <div className="flex gap-1 bg-[#161b22] rounded-lg p-0.5">
          {(
            [
              ["all", "Abiertos"],
              ["assigned", "Asignados"],
              ["unassigned", "No Asignado"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setPage(0);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === key
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-[#8b949e] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#8b949e] text-xs border-b border-[#2d333b]">
              <th className="text-left px-5 py-3 font-medium">Nombre</th>
              <th className="text-left px-3 py-3 font-medium">Plataforma</th>
              <th className="text-left px-3 py-3 font-medium">Estado</th>
              <th className="text-left px-3 py-3 font-medium">Telefono</th>
              <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">
                Ultimo Mensaje
              </th>
              <th className="text-left px-3 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-[#8b949e] py-12">
                  No hay contactos
                </td>
              </tr>
            )}
            {paged.map((c) => (
              <tr
                key={c.id}
                className="border-b border-[#2d333b]/50 hover:bg-[#161b22] transition-colors cursor-pointer"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <ContactAvatar name={c.name} />
                    <span className="text-white font-medium truncate max-w-[160px]">
                      {c.name || "Sin nombre"}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-400 text-xs font-medium">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.609l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.239 0-4.329-.726-6.033-1.96l-.424-.313-2.641.886.886-2.641-.313-.424A9.956 9.956 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                    </svg>
                    WhatsApp
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-[#8b949e] text-xs">Activo</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-[#8b949e]">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3" />
                    {c.wa_id || "-"}
                  </span>
                </td>
                <td className="px-3 py-3 text-[#8b949e] hidden lg:table-cell truncate max-w-[200px]">
                  {c.custom_fields?.last_message || "-"}
                </td>
                <td className="px-3 py-3 text-[#8b949e] text-xs whitespace-nowrap">
                  {c.last_message_at
                    ? new Date(c.last_message_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[#2d333b]">
        <span className="text-xs text-[#8b949e]">
          {filtered.length} contactos
        </span>
        <div className="flex items-center gap-1">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 text-xs rounded-md bg-[#161b22] text-[#8b949e] hover:text-white disabled:opacity-40 transition-colors"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-xs text-[#8b949e]">
            {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 text-xs rounded-md bg-[#161b22] text-[#8b949e] hover:text-white disabled:opacity-40 transition-colors"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Team Members                                                      */
/* ------------------------------------------------------------------ */
function TeamPanel({ agents }: { agents: Agent[] }) {
  const statusColor: Record<string, string> = {
    online: "bg-green-500",
    away: "bg-yellow-500",
    offline: "bg-gray-500",
  };
  const statusLabel: Record<string, string> = {
    online: "En línea",
    away: "Ausente",
    offline: "Desconectado",
  };
  const roleBadge: Record<string, { bg: string; text: string }> = {
    admin: { bg: "bg-purple-500/15", text: "text-purple-400" },
    supervisor: { bg: "bg-blue-500/15", text: "text-blue-400" },
    agent: { bg: "bg-[#2d333b]", text: "text-[#8b949e]" },
  };

  return (
    <div className="rounded-xl bg-[#1a1f2e] border border-[#2d333b] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-white font-semibold text-base">Miembros del equipo</h2>
        <span className="text-xs text-blue-400 hover:underline cursor-pointer">
          Todos los miembros
        </span>
      </div>
      <div className="flex flex-col">
        {agents.length === 0 && (
          <div className="text-center text-[#8b949e] py-12 text-sm">
            No hay agentes
          </div>
        )}
        {agents.map((a) => {
          const badge = roleBadge[a.role] || roleBadge.agent;
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-[#161b22] transition-colors"
            >
              {/* Avatar with status dot */}
              <div className="relative shrink-0">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold">
                  {(a.name || "?")
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#1a1f2e] ${
                    statusColor[a.status] || "bg-gray-500"
                  }`}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium truncate">
                    {a.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.bg} ${badge.text}`}
                  >
                    {a.role}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`text-xs ${
                      a.status === "online"
                        ? "text-green-400"
                        : a.status === "away"
                        ? "text-yellow-400"
                        : "text-[#8b949e]"
                    }`}
                  >
                    {statusLabel[a.status] || a.status}
                  </span>
                </div>
              </div>

              {/* Capacity indicator */}
              <div className="text-right shrink-0">
                <span className="text-xs text-[#8b949e]">
                  {a.max_concurrent_chats} chats max
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Conversations Bar Chart                                           */
/* ------------------------------------------------------------------ */
function ConversationsChart({
  chartData,
  total,
}: {
  chartData: { date: string; count: number }[];
  total: number;
}) {
  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div className="rounded-xl bg-[#1a1f2e] border border-[#2d333b] p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-white font-semibold text-base">Conversaciones</h2>
          <p className="text-[#8b949e] text-xs mt-1">Ultimos 14 dias</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{total}</p>
            <p className="text-xs text-[#8b949e]">Total conversaciones</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex items-end gap-2 h-48">
        {chartData.map((d, i) => {
          const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1.5 group"
            >
              {/* Tooltip */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white bg-[#2d333b] px-2 py-1 rounded whitespace-nowrap">
                {d.count}
              </div>
              {/* Bar */}
              <div className="w-full flex items-end justify-center" style={{ height: "160px" }}>
                <div
                  className="w-full max-w-[32px] rounded-t-md bg-blue-500 hover:bg-blue-400 transition-all duration-200 cursor-pointer"
                  style={{
                    height: `${Math.max(height, 2)}%`,
                    minHeight: d.count > 0 ? "8px" : "2px",
                  }}
                />
              </div>
              {/* Label */}
              <span className="text-[10px] text-[#8b949e] truncate w-full text-center">
                {d.date}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                  */
/* ------------------------------------------------------------------ */
function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Stats row */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="min-w-[200px] flex-1 h-28 rounded-xl bg-[#1a1f2e] border border-[#2d333b]"
          />
        ))}
      </div>
      {/* Middle */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 h-96 rounded-xl bg-[#1a1f2e] border border-[#2d333b]" />
        <div className="lg:col-span-2 h-96 rounded-xl bg-[#1a1f2e] border border-[#2d333b]" />
      </div>
      {/* Bottom */}
      <div className="h-72 rounded-xl bg-[#1a1f2e] border border-[#2d333b]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                    */
/* ------------------------------------------------------------------ */
export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: contactsData, isLoading: contactsLoading } = useContacts();
  const { data: agents } = useAgents();

  if (statsLoading || contactsLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-6 space-y-6 bg-[#0d1117] min-h-full">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          Resumen general de tu plataforma de mensajería
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        <StatCard
          icon={Users}
          label="Contactos Activos"
          value={stats?.totalContacts ?? 0}
          trend={stats?.trends?.contacts.percentage ? stats.trends.contacts.direction : "neutral"}
          trendLabel={stats?.trends?.contacts.percentage || "\u2014"}
          color="#3b82f6"
        />
        <StatCard
          icon={UserX}
          label="Contactos Sin Asignar"
          value={stats?.unassigned ?? 0}
          trend={stats?.unassigned ? "down" : "neutral"}
          trendLabel={stats?.unassigned ? `${stats.unassigned} pendientes` : "0"}
          color="#f59e0b"
        />
        <StatCard
          icon={UserPlus}
          label="Nuevos"
          value={stats?.newContactsToday ?? 0}
          trend={stats?.trends?.newContacts.percentage ? stats.trends.newContacts.direction : "neutral"}
          trendLabel={stats?.trends?.newContacts.percentage || "\u2014"}
          color="#10b981"
        />
        <StatCard
          icon={MessageSquare}
          label="Conversaciones Activas"
          value={stats?.activeConversations ?? 0}
          trend={stats?.trends?.conversations.percentage ? stats.trends.conversations.direction : "neutral"}
          trendLabel={stats?.trends?.conversations.percentage || "\u2014"}
          color="#8b5cf6"
        />
        <StatCard
          icon={Send}
          label="Mensajes Enviados"
          value={stats?.messagesToday ?? 0}
          trend={stats?.trends?.messages.percentage ? stats.trends.messages.direction : "neutral"}
          trendLabel={stats?.trends?.messages.percentage || "\u2014"}
          color="#06b6d4"
        />
      </div>

      {/* Middle: Contacts Table + Team Members */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ContactsTable contacts={contactsData?.contacts || []} />
        </div>
        <div className="lg:col-span-2">
          <TeamPanel agents={agents || stats?.agents || []} />
        </div>
      </div>

      {/* Bottom: Conversations Chart */}
      <ConversationsChart
        chartData={stats?.chartData || []}
        total={stats?.activeConversations ?? 0}
      />
    </div>
  );
}
