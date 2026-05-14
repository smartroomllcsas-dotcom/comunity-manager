"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useChannels } from "@/hooks/useChannels";
import type { MessageTemplate } from "@/types/database";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft, FileText, Search, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  approved: { label: "Aprobado", bg: "bg-green-500/20", text: "text-green-400" },
  pending: { label: "Pendiente", bg: "bg-yellow-500/20", text: "text-yellow-400" },
  rejected: { label: "Rechazado", bg: "bg-red-500/20", text: "text-red-400" },
};

export default function TemplatesSettingsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ message: string; isError: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");

  const { data: channels } = useChannels();
  const whatsappChannels = channels?.filter(
    (ch) => (ch.type === "whatsapp_business_api" || ch.type === "whatsapp_cloud_api") && ch.status === "active"
  );

  const { data: templates, isLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["all-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("message_templates").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const body: Record<string, string> = {};
      if (selectedChannelId) body.channelId = selectedChannelId;

      const res = await fetch("/api/templates/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({ message: `${data.synced} plantillas sincronizadas con éxito`, isError: false });
        queryClient.invalidateQueries({ queryKey: ["all-templates"] });
      } else {
        setSyncResult({ message: data.error || "Error al sincronizar", isError: true });
      }
    } catch {
      setSyncResult({ message: "Error de conexión al sincronizar", isError: true });
    } finally {
      setSyncing(false);
    }
  }

  const filtered = templates?.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Plantillas de WhatsApp</h1>
            <p className="text-xs text-[#8b949e] mt-0.5">Sincroniza y gestiona tus templates de Meta</p>
          </div>
        </div>
        <div className="flex-1" />
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b949e]" />
          <Input
            placeholder="Buscar templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] focus:border-blue-500 h-9 w-56"
          />
        </div>
        {whatsappChannels && whatsappChannels.length > 1 && (
          <select
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
            className="h-9 px-3 pr-8 text-sm rounded-md bg-[#161b22] border border-[#2d333b] text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none cursor-pointer transition-colors hover:border-[#444c56]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%238b949e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
          >
            <option value="">Todos los canales</option>
            {whatsappChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name || ch.whatsapp_phone_number || "WhatsApp"}
              </option>
            ))}
          </select>
        )}
        <Button onClick={handleSync} disabled={syncing} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          {syncing ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          {syncing ? "Sincronizando..." : "Sincronizar con WhatsApp"}
        </Button>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className={`mx-6 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
          syncResult.isError
            ? "bg-red-500/10 border border-red-500/30 text-red-400"
            : "bg-green-500/10 border border-green-500/30 text-green-400"
        }`}>
          {syncResult.isError ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {syncResult.message}
          {whatsappChannels && whatsappChannels.length === 1 && !syncResult.isError && (
            <span className="text-[#8b949e] ml-1">
              — {whatsappChannels[0].name || whatsappChannels[0].whatsapp_phone_number || "Canal WhatsApp"}
            </span>
          )}
          {selectedChannelId && !syncResult.isError && whatsappChannels && (
            <span className="text-[#8b949e] ml-1">
              — {whatsappChannels.find((c) => c.id === selectedChannelId)?.name ||
                  whatsappChannels.find((c) => c.id === selectedChannelId)?.whatsapp_phone_number ||
                  "Canal seleccionado"}
            </span>
          )}
          <button
            onClick={() => setSyncResult(null)}
            className="ml-auto text-current opacity-60 hover:opacity-100"
          >
            x
          </button>
        </div>
      )}

      {/* Channel info banner */}
      {whatsappChannels && whatsappChannels.length > 0 && !syncResult && (
        <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#161b22] border border-[#2d333b] text-sm text-[#8b949e]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-green-500 fill-current shrink-0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          {whatsappChannels.length === 1 ? (
            <span>
              Plantillas del canal: <span className="text-white font-medium">{whatsappChannels[0].name || whatsappChannels[0].whatsapp_phone_number || "WhatsApp Business"}</span>
            </span>
          ) : (
            <span>
              <span className="text-white font-medium">{whatsappChannels.length} canales WhatsApp</span> conectados — selecciona un canal para sincronizar plantillas especificas
            </span>
          )}
        </div>
      )}

      <div className="p-6">
        <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2d333b]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Idioma</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Categoria</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-[#8b949e]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Cargando...</span>
                    </div>
                  </td>
                </tr>
              ) : !filtered || filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-[#8b949e]">
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="h-10 w-10 text-[#2d333b]" />
                      <p className="text-sm">No hay templates. Sincroniza con WhatsApp.</p>
                      <Button onClick={handleSync} disabled={syncing} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                        {syncing ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-1.5" />
                        )}
                        Sincronizar con WhatsApp
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const sc = statusConfig[t.status] || { label: t.status, bg: "bg-gray-500/20", text: "text-gray-400" };
                  return (
                    <tr key={t.id} className="border-b border-[#2d333b]/50 hover:bg-[#1a1f2e] transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-white">{t.name}</td>
                      <td className="px-4 py-3 text-sm text-[#8b949e]">{t.language}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-[#0d1117] border border-[#2d333b] text-[#8b949e]">
                          {t.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
