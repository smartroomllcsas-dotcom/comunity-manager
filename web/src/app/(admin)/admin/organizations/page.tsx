"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Loader2,
  MoreVertical,
  Power,
  PowerOff,
  Trash2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrgRow {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  plan: { name: string } | null;
  _agents_count?: number;
  _contacts_count?: number;
  _has_whatsapp?: boolean;
}

export default function AdminOrganizationsPage() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "trial">("all");
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  async function loadOrgs() {
    setLoading(true);
    const { data } = await supabase
      .from("organizations")
      .select("id, name, is_active, created_at, trial_ends_at, plan:plans(name)")
      .order("created_at", { ascending: false });

    if (data) {
      // Enrich with counts
      const enriched: OrgRow[] = [];
      for (const org of data as any[]) {
        const [agentsRes, contactsRes, channelsRes] = await Promise.all([
          supabase.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
          supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
          supabase.from("channels").select("id").eq("organization_id", org.id).eq("type", "whatsapp_cloud_api").eq("status", "active").limit(1),
        ]);
        enriched.push({
          ...org,
          _agents_count: agentsRes.count ?? 0,
          _contacts_count: contactsRes.count ?? 0,
          _has_whatsapp: (channelsRes.data?.length ?? 0) > 0,
        });
      }
      setOrgs(enriched);
    }
    setLoading(false);
  }

  useEffect(() => { loadOrgs(); }, []);

  const filtered = useMemo(() => {
    let result = orgs;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) => o.name.toLowerCase().includes(q));
    }
    if (statusFilter === "active") result = result.filter((o) => o.is_active);
    if (statusFilter === "inactive") result = result.filter((o) => !o.is_active);
    return result;
  }, [orgs, search, statusFilter]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  async function toggleActive(orgId: string, current: boolean) {
    await supabase.from("organizations").update({ is_active: !current }).eq("id", orgId);
    setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, is_active: !current } : o)));
    setActionMenu(null);
  }

  async function deleteOrg(orgId: string) {
    if (!confirm("Estas seguro de eliminar esta organizacion? Esta accion es irreversible.")) return;
    await supabase.from("organizations").delete().eq("id", orgId);
    setOrgs((prev) => prev.filter((o) => o.id !== orgId));
    setActionMenu(null);
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando organizaciones...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Organizaciones</h1>
        <p className="text-sm text-[#8b949e] mt-1">Gestiona todas las organizaciones de la plataforma</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b949e]" />
          <input
            type="text"
            placeholder="Buscar organizacion..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2 bg-[#0d1117] border border-[#1e2433] rounded-lg text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#3b82f6]"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                statusFilter === s
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "text-[#8b949e] hover:text-white border border-[#1e2433] hover:border-[#3d444d]"
              }`}
            >
              {s === "all" ? "Todas" : s === "active" ? "Activas" : "Inactivas"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0d1117] border border-[#1e2433] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2433] text-[#8b949e] text-xs">
                <th className="text-left px-5 py-3 font-medium">Nombre</th>
                <th className="text-left px-5 py-3 font-medium">Plan</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
                <th className="text-left px-5 py-3 font-medium">Agentes</th>
                <th className="text-left px-5 py-3 font-medium">Contactos</th>
                <th className="text-left px-5 py-3 font-medium">WhatsApp</th>
                <th className="text-left px-5 py-3 font-medium">Creada</th>
                <th className="text-left px-5 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((org) => (
                <tr key={org.id} className="border-b border-[#1e2433]/50 hover:bg-[#1a1f2e]/30">
                  <td className="px-5 py-3 text-white font-medium">{org.name}</td>
                  <td className="px-5 py-3 text-[#8b949e] capitalize">{org.plan?.name || "Sin plan"}</td>
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
                  <td className="px-5 py-3 text-[#8b949e]">{org._agents_count}</td>
                  <td className="px-5 py-3 text-[#8b949e]">{(org._contacts_count ?? 0).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className={`h-2 w-2 rounded-full inline-block ${org._has_whatsapp ? "bg-green-400" : "bg-[#3d444d]"}`} />
                  </td>
                  <td className="px-5 py-3 text-[#8b949e]">{new Date(org.created_at).toLocaleDateString("es-CO")}</td>
                  <td className="px-5 py-3 relative">
                    <button
                      onClick={() => setActionMenu(actionMenu === org.id ? null : org.id)}
                      className="p-1 rounded hover:bg-[#1e2433] text-[#8b949e] hover:text-white transition-colors"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {actionMenu === org.id && (
                      <div className="absolute right-5 top-10 z-20 bg-[#161b22] border border-[#2d333b] rounded-lg shadow-xl py-1 min-w-[160px]">
                        <button
                          onClick={() => toggleActive(org.id, org.is_active)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#e6edf3] hover:bg-[#1a1f2e]"
                        >
                          {org.is_active ? <PowerOff className="h-3.5 w-3.5 text-orange-400" /> : <Power className="h-3.5 w-3.5 text-green-400" />}
                          {org.is_active ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          onClick={() => deleteOrg(org.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-[#1a1f2e]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-[#8b949e]">
                    No se encontraron organizaciones
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#1e2433]">
            <span className="text-xs text-[#8b949e]">
              {filtered.length} organizacion(es) &middot; Pagina {page + 1} de {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded hover:bg-[#1e2433] text-[#8b949e] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded hover:bg-[#1e2433] text-[#8b949e] disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
