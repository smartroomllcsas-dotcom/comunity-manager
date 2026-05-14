"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import type { ClosingCategory } from "@/types/database";

export const dynamic = "force-dynamic";

export default function ClosingNotesPage() {
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();
  const isAdmin = currentAgent?.role === "admin";

  const { data: categories, isLoading } = useQuery<ClosingCategory[]>({
    queryKey: ["closing-categories"],
    queryFn: async () => {
      const res = await fetch("/api/closing-categories");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      return data.categories || [];
    },
  });

  const [newName, setNewName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch("/api/closing-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["closing-categories"] });
        setNewName("");
      }
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/closing-categories/${id}`, { method: "DELETE" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["closing-categories"] });
        setDeleteConfirm(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <ClipboardList className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Notas de Cierre</h1>
            <p className="text-xs text-[#8b949e] mt-0.5">Categorias para clasificar las notas al cerrar conversaciones</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-2xl">
        {/* Add form */}
        {isAdmin && (
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-white mb-3">Nueva categoria</h3>
            <div className="flex gap-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Venta cerrada, Sin interes..."
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="flex-1 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9"
              />
              <Button
                onClick={handleAdd}
                disabled={!newName.trim() || addLoading}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              >
                {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[#8b949e] text-sm mt-3">Cargando categorias...</p>
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg py-16 text-center">
            <ClipboardList className="h-12 w-12 text-[#2d333b] mx-auto mb-3" />
            <p className="text-[#8b949e] text-sm">No hay categorias de cierre</p>
            {isAdmin && (
              <p className="text-[#8b949e] text-xs mt-1">Agrega categorias para clasificar las notas de cierre</p>
            )}
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2d333b]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Categoria</th>
                  {isAdmin && <th className="px-4 py-2.5 w-14" />}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-b border-[#2d333b]/50 hover:bg-[#1a1f2e] transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-white">{cat.name}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        {deleteConfirm === cat.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleDelete(cat.id)}
                              disabled={deleteLoading}
                              className="bg-red-600 hover:bg-red-700 text-white text-xs h-6 px-2"
                            >
                              {deleteLoading ? "..." : "Si"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteConfirm(null)}
                              className="bg-transparent border-[#2d333b] text-[#8b949e] hover:text-white text-xs h-6 px-2"
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(cat.id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-[#8b949e] hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
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
