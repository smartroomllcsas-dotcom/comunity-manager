"use client";
import { useState } from "react";
import { useLifecycleStages } from "@/hooks/useLifecycleStages";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  GripVertical,
  Loader2,
  Star,
  Sparkles,
  GitBranch,
} from "lucide-react";
import Link from "next/link";
import type { LifecycleStage } from "@/types/database";

export const dynamic = "force-dynamic";

const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

const DEFAULT_STAGES = [
  { name: "Nuevo Lead", color: "#3b82f6", type: "primary" as const },
  { name: "Lead Caliente", color: "#f59e0b", type: "primary" as const },
  { name: "Pagando", color: "#22c55e", type: "primary" as const },
  { name: "Cliente", color: "#8b5cf6", type: "primary" as const },
  { name: "Lead Frio", color: "#6b7280", type: "lost" as const },
];

export default function LifecycleSettingsPage() {
  const { data: stages, isLoading } = useLifecycleStages();
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();
  const isAdmin = currentAgent?.role === "admin";

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState(PRESET_COLORS[0]);
  const [createType, setCreateType] = useState<"primary" | "lost">("primary");
  const [createLoading, setCreateLoading] = useState(false);

  const [editStage, setEditStage] = useState<LifecycleStage | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editType, setEditType] = useState<"primary" | "lost">("primary");
  const [editLoading, setEditLoading] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [defaultLoading, setDefaultLoading] = useState<string | null>(null);

  const primaryStages = stages?.filter((s) => s.type === "primary") || [];
  const lostStages = stages?.filter((s) => s.type === "lost") || [];

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreateLoading(true);
    try {
      const res = await fetch("/api/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName, color: createColor, type: createType }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["lifecycle-stages"] });
        setCreateOpen(false);
        setCreateName("");
        setCreateColor(PRESET_COLORS[0]);
        setCreateType("primary");
      }
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEdit() {
    if (!editStage || !editName.trim()) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/lifecycle/${editStage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, color: editColor, type: editType }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["lifecycle-stages"] });
        setEditStage(null);
      }
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/lifecycle/${id}`, { method: "DELETE" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["lifecycle-stages"] });
        setDeleteConfirm(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleSetDefault(id: string) {
    setDefaultLoading(id);
    try {
      const res = await fetch(`/api/lifecycle/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["lifecycle-stages"] });
      }
    } finally {
      setDefaultLoading(null);
    }
  }

  async function handleSeedDefaults() {
    setSeedLoading(true);
    try {
      for (let i = 0; i < DEFAULT_STAGES.length; i++) {
        const s = DEFAULT_STAGES[i];
        await fetch("/api/lifecycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: s.name,
            color: s.color,
            type: s.type,
            is_default: i === 0,
          }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["lifecycle-stages"] });
    } finally {
      setSeedLoading(false);
    }
  }

  async function handleMoveStage(stage: LifecycleStage, direction: "up" | "down") {
    const sameTypeStages = stage.type === "primary" ? primaryStages : lostStages;
    const currentIndex = sameTypeStages.findIndex((s) => s.id === stage.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= sameTypeStages.length) return;

    const reordered = [...sameTypeStages];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];

    const stagesPayload = reordered.map((s, i) => ({ id: s.id, position: i }));

    await fetch("/api/lifecycle/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stages: stagesPayload }),
    });

    queryClient.invalidateQueries({ queryKey: ["lifecycle-stages"] });
  }

  function openEdit(stage: LifecycleStage) {
    setEditStage(stage);
    setEditName(stage.name);
    setEditColor(stage.color);
    setEditType(stage.type as "primary" | "lost");
  }

  function openCreateForType(type: "primary" | "lost") {
    setCreateType(type);
    setCreateOpen(true);
  }

  function renderStageRow(stage: LifecycleStage, list: LifecycleStage[]) {
    const index = list.findIndex((s) => s.id === stage.id);
    return (
      <div
        key={stage.id}
        className="flex items-center gap-3 px-3 py-2.5 rounded hover:bg-[#1a1f2e] transition-colors group"
      >
        {isAdmin && (
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => handleMoveStage(stage, "up")}
              disabled={index === 0}
              className="text-[#8b949e] hover:text-white disabled:opacity-20 transition-colors"
            >
              <GripVertical className="h-3.5 w-3.5 rotate-180" />
            </button>
            <button
              onClick={() => handleMoveStage(stage, "down")}
              disabled={index === list.length - 1}
              className="text-[#8b949e] hover:text-white disabled:opacity-20 transition-colors"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: stage.color }}
        />
        <span className="text-sm font-medium text-white flex-1">{stage.name}</span>
        {stage.is_default && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            <Star className="h-3 w-3" /> Por defecto
          </span>
        )}
        {isAdmin && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!stage.is_default && (
              <button
                onClick={() => handleSetDefault(stage.id)}
                disabled={defaultLoading === stage.id}
                className="p-1.5 rounded hover:bg-yellow-500/10 text-[#8b949e] hover:text-yellow-400 transition-colors"
                title="Establecer como etapa por defecto"
              >
                {defaultLoading === stage.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Star className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              onClick={() => openEdit(stage)}
              className="p-1.5 rounded hover:bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {deleteConfirm === stage.id ? (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  onClick={() => handleDelete(stage.id)}
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
                onClick={() => setDeleteConfirm(stage.id)}
                className="p-1.5 rounded hover:bg-red-500/10 text-[#8b949e] hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <GitBranch className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Ciclo de Vida</h1>
            <p className="text-xs text-[#8b949e] mt-0.5">Define las etapas del ciclo de vida de tus contactos</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-3xl">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[#8b949e] text-sm mt-3">Cargando etapas...</p>
          </div>
        ) : (!stages || stages.length === 0) ? (
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg py-16 text-center">
            <GitBranch className="h-12 w-12 text-[#2d333b] mx-auto mb-3" />
            <p className="text-[#8b949e] text-sm mb-4">No hay etapas de ciclo de vida configuradas</p>
            {isAdmin && (
              <Button
                onClick={handleSeedDefaults}
                disabled={seedLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {seedLoading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" />
                )}
                Crear etapas por defecto
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Primary stages */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">Etapas Principales</h2>
                {isAdmin && (
                  <button
                    onClick={() => openCreateForType("primary")}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Anadir etapa
                  </button>
                )}
              </div>
              <div className="bg-[#161b22] border border-[#2d333b] rounded-lg divide-y divide-[#2d333b]/50">
                {primaryStages.length === 0 ? (
                  <p className="text-sm text-[#8b949e] py-6 text-center">No hay etapas principales</p>
                ) : (
                  primaryStages.map((s) => renderStageRow(s, primaryStages))
                )}
              </div>
            </div>

            {/* Lost stages */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">Etapas de Perdida</h2>
                {isAdmin && (
                  <button
                    onClick={() => openCreateForType("lost")}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Anadir etapa
                  </button>
                )}
              </div>
              <div className="bg-[#161b22] border border-[#2d333b] rounded-lg divide-y divide-[#2d333b]/50">
                {lostStages.length === 0 ? (
                  <p className="text-sm text-[#8b949e] py-6 text-center">No hay etapas de perdida</p>
                ) : (
                  lostStages.map((s) => renderStageRow(s, lostStages))
                )}
              </div>
            </div>

            {/* Seed defaults button */}
            {isAdmin && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSeedDefaults}
                  disabled={seedLoading}
                  className="bg-transparent border-[#2d333b] text-[#8b949e] hover:text-white hover:border-[#3d444d]"
                >
                  {seedLoading ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1.5" />
                  )}
                  Crear etapas por defecto
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm bg-[#1a1f2e] border-[#2d333b]">
          <DialogHeader>
            <DialogTitle className="text-white">Anadir etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Nombre</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Ej: Nuevo Lead, Cliente..."
                className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Tipo</Label>
              <Select value={createType} onValueChange={(v) => v && setCreateType(v as "primary" | "lost")}>
                <SelectTrigger className="w-full bg-[#0d1117] border-[#2d333b] text-white h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                  <SelectItem value="primary">Principal</SelectItem>
                  <SelectItem value="lost">Perdida</SelectItem>
                </SelectContent>
              </Select>
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
              {createLoading ? "Creando..." : "Crear etapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editStage} onOpenChange={(open) => !open && setEditStage(null)}>
        <DialogContent className="sm:max-w-sm bg-[#1a1f2e] border-[#2d333b]">
          <DialogHeader>
            <DialogTitle className="text-white">Editar etapa</DialogTitle>
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
              <Label className="text-xs text-[#8b949e]">Tipo</Label>
              <Select value={editType} onValueChange={(v) => v && setEditType(v as "primary" | "lost")}>
                <SelectTrigger className="w-full bg-[#0d1117] border-[#2d333b] text-white h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                  <SelectItem value="primary">Principal</SelectItem>
                  <SelectItem value="lost">Perdida</SelectItem>
                </SelectContent>
              </Select>
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
