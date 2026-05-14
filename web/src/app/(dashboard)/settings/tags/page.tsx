"use client";
import { useState } from "react";
import { useTags } from "@/hooks/useTags";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Tag,
  Loader2,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

export default function TagsSettingsPage() {
  const { data: tags, isLoading } = useTags();
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();
  const isAdmin = currentAgent?.role === "admin";

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState(PRESET_COLORS[0]);
  const [createLoading, setCreateLoading] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreateLoading(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName, color: createColor }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["tags"] });
        setCreateOpen(false);
        setCreateName("");
        setCreateColor(PRESET_COLORS[0]);
      }
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEdit() {
    if (!editId || !editName.trim()) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/tags/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, color: editColor }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["tags"] });
        setEditId(null);
      }
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["tags"] });
        setDeleteConfirm(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  function openEdit(tag: { id: string; name: string; color: string }) {
    setEditId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <Tag className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Etiquetas</h1>
            <p className="text-xs text-[#8b949e] mt-0.5">Gestiona las etiquetas para clasificar tus contactos</p>
          </div>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Crear etiqueta
          </Button>
        )}
      </div>

      <div className="p-6 max-w-3xl">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[#8b949e] text-sm mt-3">Cargando etiquetas...</p>
          </div>
        ) : !tags || tags.length === 0 ? (
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg py-16 text-center">
            <Tag className="h-12 w-12 text-[#2d333b] mx-auto mb-3" />
            <p className="text-[#8b949e] text-sm">No hay etiquetas creadas</p>
            {isAdmin && (
              <p className="text-[#8b949e] text-xs mt-1">Crea etiquetas para clasificar tus contactos</p>
            )}
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2d333b]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Etiqueta</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Contactos</th>
                  {isAdmin && <th className="px-4 py-2.5 w-24" />}
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag.id} className="border-b border-[#2d333b]/50 hover:bg-[#1a1f2e] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm font-medium text-white">{tag.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b949e]">{tag.usage_count}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(tag)}
                            className="p-1.5 rounded hover:bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {deleteConfirm === tag.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                onClick={() => handleDelete(tag.id)}
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
                              onClick={() => setDeleteConfirm(tag.id)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-[#8b949e] hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm bg-[#1a1f2e] border-[#2d333b]">
          <DialogHeader>
            <DialogTitle className="text-white">Crear etiqueta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Nombre</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Ej: VIP, Interesado..."
                className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setCreateColor(color)}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      createColor === color
                        ? "border-white scale-110"
                        : "border-transparent hover:border-[#8b949e]"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreate}
              disabled={!createName.trim() || createLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {createLoading ? "Creando..." : "Crear etiqueta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="sm:max-w-sm bg-[#1a1f2e] border-[#2d333b]">
          <DialogHeader>
            <DialogTitle className="text-white">Editar etiqueta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Nombre</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-[#0d1117] border-[#2d333b] text-white h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditColor(color)}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      editColor === color
                        ? "border-white scale-110"
                        : "border-transparent hover:border-[#8b949e]"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleEdit}
              disabled={!editName.trim() || editLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {editLoading ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
