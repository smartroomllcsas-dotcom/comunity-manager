"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import type { QuickReply } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowLeft, Zap, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function QuickRepliesPage() {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();
  const queryClient = useQueryClient();
  const [shortcut, setShortcut] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: replies } = useQuery<QuickReply[]>({
    queryKey: ["quick-replies"],
    queryFn: async () => { const { data, error } = await supabase.from("quick_replies").select("*").order("shortcut"); if (error) throw error; return data || []; },
  });

  async function handleAdd() {
    setValidationError(null);
    setError(null);

    // Validate inputs
    const trimmedShortcut = shortcut.trim();
    const trimmedContent = content.trim();

    if (!trimmedShortcut) {
      setValidationError("El atajo es obligatorio");
      return;
    }
    if (!trimmedContent) {
      setValidationError("El contenido es obligatorio");
      return;
    }
    if (!agent) {
      setError("No se pudo identificar al agente. Recarga la pagina.");
      return;
    }

    setAdding(true);
    try {
      const { error: insertError } = await supabase.from("quick_replies").insert({
        organization_id: agent.organization_id,
        shortcut: trimmedShortcut.startsWith("/") ? trimmedShortcut : `/${trimmedShortcut}`,
        content: trimmedContent,
      });
      if (insertError) throw insertError;
      setShortcut("");
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error al crear la respuesta rapida";
      setError(message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from("quick_replies").delete().eq("id", id);
      if (deleteError) throw deleteError;
      queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error al eliminar la respuesta rapida";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Respuestas Rapidas</h1>
            <p className="text-xs text-[#8b949e] mt-0.5">Crea atajos de respuestas frecuentes para tu equipo</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-3xl">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
              x
            </button>
          </div>
        )}

        {/* Add Form */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">Nueva respuesta rapida</h3>
          <div className="flex gap-3">
            <Input
              value={shortcut}
              onChange={(e) => { setShortcut(e.target.value); setValidationError(null); }}
              placeholder="/atajo"
              className={`w-32 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] font-mono h-9 ${
                validationError && !shortcut.trim() ? "border-red-500" : ""
              }`}
            />
            <Textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setValidationError(null); }}
              placeholder="Contenido de la respuesta..."
              rows={1}
              className={`flex-1 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] resize-none min-h-9 ${
                validationError && !content.trim() ? "border-red-500" : ""
              }`}
            />
            <Button
              onClick={handleAdd}
              disabled={adding}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
          {validationError && (
            <p className="text-red-400 text-xs mt-2">{validationError}</p>
          )}
        </div>

        {/* Table */}
        <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2d333b]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider w-36">Atajo</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Contenido</th>
                <th className="px-4 py-2.5 w-14" />
              </tr>
            </thead>
            <tbody>
              {!replies || replies.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-[#8b949e]">
                    <div className="flex flex-col items-center gap-3">
                      <Zap className="h-10 w-10 text-[#2d333b]" />
                      <p className="text-sm">No hay respuestas rapidas</p>
                    </div>
                  </td>
                </tr>
              ) : (
                replies.map((reply) => (
                  <tr key={reply.id} className="border-b border-[#2d333b]/50 hover:bg-[#1a1f2e] transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono">
                        {reply.shortcut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b949e]">{reply.content}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(reply.id)}
                        disabled={deletingId === reply.id}
                        className="p-1.5 rounded hover:bg-red-500/10 text-[#8b949e] hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        {deletingId === reply.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#8b949e] mt-4">Escribe el atajo en el chat (ej: /precio) para usar la respuesta rapida.</p>
      </div>
    </div>
  );
}
