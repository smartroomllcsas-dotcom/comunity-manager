"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ChatbotFlow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Plus, Bot, Search, MoreHorizontal, GitBranch } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const dynamic = "force-dynamic";

export default function ChatbotPage() {
  const supabase = createClient();
  const [search, setSearch] = useState("");

  const { data: flows, refetch } = useQuery<ChatbotFlow[]>({
    queryKey: ["chatbot-flows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chatbot_flows").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  async function toggleFlow(flowId: string, isActive: boolean) {
    await supabase.from("chatbot_flows").update({ is_active: isActive }).eq("id", flowId);
    refetch();
  }

  const filtered = flows?.filter((f) =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <div>
          <h1 className="text-xl font-bold text-white">Flujos de trabajo</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Automatiza conversaciones con flujos y chatbots</p>
        </div>
        <div className="flex-1" />
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b949e]" />
          <Input
            placeholder="Buscar flujos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] focus:border-blue-500 h-9 w-64"
          />
        </div>
        <Link href="/chatbot/ai">
          <Button variant="outline" size="sm" className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white">
            <Bot className="h-4 w-4 mr-1.5" />
            Config IA
          </Button>
        </Link>
        <Link href="/chatbot/new">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Añadir flujo de trabajo
          </Button>
        </Link>
      </div>

      {/* Content */}
      <div className="p-6">
        {!filtered || filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-20 w-20 rounded-full bg-[#1a1f2e] border border-[#2d333b] flex items-center justify-center">
                <GitBranch className="h-10 w-10 text-[#2d333b]" />
              </div>
              <div>
                <p className="font-medium text-white mb-1">No hay flujos de trabajo</p>
                <p className="text-sm text-[#8b949e]">Crea tu primer flujo para automatizar conversaciones</p>
              </div>
              <Link href="/chatbot/new">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crear flujo
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2d333b]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider w-24">Estado</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Trigger</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Nodos</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Fecha de creacion</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider w-20">Activo</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((flow) => (
                  <tr key={flow.id} className="border-b border-[#2d333b]/50 hover:bg-[#1a1f2e] transition-colors">
                    <td className="px-4 py-3">
                      {flow.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                          Publicado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-500/20 text-gray-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          Borrador
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/chatbot/${flow.id}`} className="text-sm font-medium text-white hover:text-blue-400 transition-colors">
                        {flow.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b949e]">
                      <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-[#0d1117] border border-[#2d333b] font-mono">
                        {flow.trigger_type}{flow.trigger_value ? ` = "${flow.trigger_value}"` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b949e]">
                      {flow.flow_data.nodes.length} nodos
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b949e]">
                      {format(new Date(flow.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={flow.is_active}
                        onCheckedChange={(checked) => toggleFlow(flow.id, checked)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button className="p-1 rounded hover:bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
