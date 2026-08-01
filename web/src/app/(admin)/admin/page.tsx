"use client";
import { useState, useEffect } from "react";
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

interface PlatformStats {
  totalOrgs: number;
  activeOrgs: number;
  totalAgents: number;
  monthlyRevenue: number;
  recentOrgs: { id: string; name: string; created_at: string; is_active: boolean; plan_name: string | null }[];
  trialOrgs: number;
  paidOrgs: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const response = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!response.ok) { setLoading(false); return; }
      const payload = await response.json();
      setStats({
        totalOrgs: payload.totalOrgs ?? 0,
        activeOrgs: payload.activeOrgs ?? 0,
        totalAgents: payload.totalAgents ?? 0,
        monthlyRevenue: payload.monthlyRevenue ?? 0,
        recentOrgs: payload.recentOrgs ?? [],
        trialOrgs: payload.subscriptionsByStatus?.trial ?? 0,
        paidOrgs: payload.subscriptionsByStatus?.active ?? 0,
      });
      setLoading(false);
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando panel...</span>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const kpis = [
    {
      label: "Total Organizaciones",
      value: stats.totalOrgs,
      icon: Building2,
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
    },
    {
      label: "Organizaciones Activas",
      value: stats.activeOrgs,
      icon: CheckCircle2,
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/20",
    },
    {
      label: "Ingresos del Mes",
      value: `$${stats.monthlyRevenue.toLocaleString("es-CO")}`,
      icon: DollarSign,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10 border-yellow-500/20",
    },
    {
      label: "Usuarios Totales",
      value: stats.totalAgents,
      icon: Users,
      color: "text-purple-400",
      bg: "bg-purple-500/10 border-purple-500/20",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Panel de Administracion</h1>
        <p className="text-sm text-[#8b949e] mt-1">Vista general de la plataforma</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`border rounded-lg p-5 ${kpi.bg}`}
          >
            <div className="flex items-center justify-between mb-3">
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              <TrendingUp className="h-4 w-4 text-[#3d444d]" />
            </div>
            <p className="text-2xl font-bold text-white">{kpi.value}</p>
            <p className="text-xs text-[#8b949e] mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-orange-400" />
            <span className="text-xs text-[#8b949e]">En Trial</span>
          </div>
          <p className="text-xl font-bold text-white">{stats.trialOrgs}</p>
        </div>
        <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-xs text-[#8b949e]">Suscripciones Activas</span>
          </div>
          <p className="text-xl font-bold text-white">{stats.paidOrgs}</p>
        </div>
        <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-[#8b949e]">Inactivas</span>
          </div>
          <p className="text-xl font-bold text-white">{stats.totalOrgs - stats.activeOrgs}</p>
        </div>
      </div>

      {/* Recent signups */}
      <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg">
        <div className="px-5 py-4 border-b border-[#1e2433]">
          <h2 className="text-sm font-semibold text-white">Registros Recientes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2433] text-[#8b949e] text-xs">
                <th className="text-left px-5 py-3 font-medium">Organizacion</th>
                <th className="text-left px-5 py-3 font-medium">Plan</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
                <th className="text-left px-5 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrgs.map((org) => (
                <tr key={org.id} className="border-b border-[#1e2433]/50 hover:bg-[#1a1f2e]/30">
                  <td className="px-5 py-3 text-white font-medium">{org.name}</td>
                  <td className="px-5 py-3 text-[#8b949e] capitalize">{org.plan_name || "Sin plan"}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                        org.is_active
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}
                    >
                      {org.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#8b949e]">
                    {new Date(org.created_at).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
