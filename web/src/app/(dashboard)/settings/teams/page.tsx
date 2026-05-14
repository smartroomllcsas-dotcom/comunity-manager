"use client";
import { useState } from "react";
import { useTeams } from "@/hooks/useTeams";
import { useAgents } from "@/hooks/useAgents";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Users,
  Trash2,
  Pencil,
  UserPlus,
  UserMinus,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import type { Team, Agent } from "@/types/database";

export const dynamic = "force-dynamic";

export default function TeamsSettingsPage() {
  const { data: teams, isLoading } = useTeams();
  const { data: agents } = useAgents();
  const { data: currentAgent } = useCurrentAgent();
  const queryClient = useQueryClient();
  const isAdmin = currentAgent?.role === "admin";

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createMembers, setCreateMembers] = useState<string[]>([]);
  const [createLoading, setCreateLoading] = useState(false);

  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [manageTeam, setManageTeam] = useState<Team | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberLoading, setMemberLoading] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreateLoading(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          description: createDesc,
          member_ids: createMembers,
        }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        setCreateOpen(false);
        setCreateName("");
        setCreateDesc("");
        setCreateMembers([]);
      }
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEdit() {
    if (!editTeam || !editName.trim()) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/teams/${editTeam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDesc }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        setEditTeam(null);
      }
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(teamId: string) {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        setDeleteConfirm(null);
        if (manageTeam?.id === teamId) setManageTeam(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleAddMember(agentId: string) {
    if (!manageTeam) return;
    setMemberLoading(agentId);
    try {
      const res = await fetch(`/api/teams/${manageTeam.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["teams"] });
      }
    } finally {
      setMemberLoading(null);
      setAddMemberOpen(false);
    }
  }

  async function handleRemoveMember(agentId: string) {
    if (!manageTeam) return;
    setMemberLoading(agentId);
    try {
      const res = await fetch(`/api/teams/${manageTeam.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["teams"] });
      }
    } finally {
      setMemberLoading(null);
    }
  }

  function toggleCreateMember(agentId: string) {
    setCreateMembers((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  }

  function openEdit(team: Team) {
    setEditName(team.name);
    setEditDesc(team.description || "");
    setEditTeam(team);
  }

  const teamMembers = manageTeam?.members?.map((m) => m.agent_id) || [];
  const availableAgents = agents?.filter((a) => !teamMembers.includes(a.id)) || [];

  // Keep manageTeam in sync with latest data
  const currentManageTeam = manageTeam
    ? teams?.find((t) => t.id === manageTeam.id) || manageTeam
    : null;

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <Users className="h-5 w-5 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Equipos</h1>
            <p className="text-xs text-[#8b949e] mt-0.5">Organiza tu equipo en grupos de trabajo</p>
          </div>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger
              render={
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crear equipo
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md bg-[#1a1f2e] border-[#2d333b]">
              <DialogHeader>
                <DialogTitle className="text-white">Crear equipo</DialogTitle>
                <DialogDescription className="text-[#8b949e]">
                  Crea un nuevo equipo y agrega miembros.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="text-xs text-[#8b949e]">Nombre</Label>
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Ej: Ventas, Soporte..."
                    className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-[#8b949e]">Descripcion</Label>
                  <Textarea
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="Descripcion del equipo..."
                    rows={2}
                    className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-[#8b949e]">Miembros</Label>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {agents?.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-center gap-2 px-3 py-2 rounded hover:bg-[#0d1117] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={createMembers.includes(agent.id)}
                          onChange={() => toggleCreateMember(agent.id)}
                          className="rounded border-[#2d333b]"
                        />
                        <span className="text-sm text-white">{agent.name}</span>
                        <span className="text-xs text-[#8b949e]">{agent.email}</span>
                      </label>
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
                  {createLoading ? "Creando..." : "Crear equipo"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="p-6">
        {/* Manage Team Panel */}
        {currentManageTeam && (
          <div className="bg-[#161b22] border border-[#2d333b] rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{currentManageTeam.name}</h2>
                {currentManageTeam.description && (
                  <p className="text-sm text-[#8b949e] mt-0.5">{currentManageTeam.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => setAddMemberOpen(true)}
                      className="p-2 rounded hover:bg-blue-500/10 text-[#8b949e] hover:text-blue-400 transition-colors"
                      title="Agregar miembro"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openEdit(currentManageTeam)}
                      className="p-2 rounded hover:bg-[#1a1f2e] text-[#8b949e] hover:text-white transition-colors"
                      title="Editar equipo"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setManageTeam(null)}
                  className="text-xs text-[#8b949e] hover:text-white px-2 py-1 rounded hover:bg-[#1a1f2e] transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Members list */}
            <div className="space-y-1">
              {(!currentManageTeam.members || currentManageTeam.members.length === 0) ? (
                <p className="text-sm text-[#8b949e] py-4 text-center">Este equipo no tiene miembros</p>
              ) : (
                currentManageTeam.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between px-3 py-2 rounded hover:bg-[#1a1f2e] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-xs font-medium text-blue-400">
                        {member.agent?.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{member.agent?.name}</p>
                        <p className="text-xs text-[#8b949e]">{member.agent?.email}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveMember(member.agent_id)}
                        disabled={memberLoading === member.agent_id}
                        className="p-1.5 rounded hover:bg-red-500/10 text-[#8b949e] hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Remover del equipo"
                      >
                        {memberLoading === member.agent_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserMinus className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add member dialog */}
            {addMemberOpen && (
              <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
                <DialogContent className="sm:max-w-sm bg-[#1a1f2e] border-[#2d333b]">
                  <DialogHeader>
                    <DialogTitle className="text-white">Agregar miembro</DialogTitle>
                  </DialogHeader>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {availableAgents.length === 0 ? (
                      <p className="text-sm text-[#8b949e] py-4 text-center">
                        Todos los agentes ya son miembros de este equipo
                      </p>
                    ) : (
                      availableAgents.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => handleAddMember(a.id)}
                          disabled={memberLoading === a.id}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-[#0d1117] transition-colors text-left disabled:opacity-50"
                        >
                          <div className="h-8 w-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-xs font-medium text-blue-400">
                            {a.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{a.name}</p>
                            <p className="text-xs text-[#8b949e]">{a.email}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}

        {/* Teams grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[#8b949e] text-sm mt-3">Cargando equipos...</p>
          </div>
        ) : !teams || teams.length === 0 ? (
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg py-16 text-center">
            <Users className="h-12 w-12 text-[#2d333b] mx-auto mb-3" />
            <p className="text-[#8b949e] text-sm">No hay equipos creados</p>
            {isAdmin && (
              <p className="text-[#8b949e] text-xs mt-1">Crea tu primer equipo para organizar a tus agentes</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => {
              const memberCount = team.members?.length || 0;
              return (
                <div
                  key={team.id}
                  onClick={() => setManageTeam(team)}
                  className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4 hover:border-[#3d444d] hover:bg-[#1e2536] transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{team.name}</h3>
                      {team.description && (
                        <p className="text-xs text-[#8b949e] mt-0.5 line-clamp-2">{team.description}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(team); }}
                          className="p-1.5 rounded hover:bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {deleteConfirm === team.id ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              onClick={() => handleDelete(team.id)}
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
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(team.id); }}
                            className="p-1.5 rounded hover:bg-red-500/10 text-[#8b949e] hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {team.members?.slice(0, 5).map((member) => (
                        <div
                          key={member.id}
                          className="h-7 w-7 rounded-full bg-blue-500/20 border-2 border-[#1a1f2e] flex items-center justify-center text-[10px] font-medium text-blue-400"
                          title={member.agent?.name || ""}
                        >
                          {member.agent?.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                      ))}
                      {memberCount > 5 && (
                        <div className="h-7 w-7 rounded-full bg-[#0d1117] border-2 border-[#1a1f2e] flex items-center justify-center text-[10px] font-medium text-[#8b949e]">
                          +{memberCount - 5}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-[#8b949e]">
                      {memberCount} {memberCount === 1 ? "miembro" : "miembros"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTeam} onOpenChange={(open) => !open && setEditTeam(null)}>
        <DialogContent className="sm:max-w-md bg-[#1a1f2e] border-[#2d333b]">
          <DialogHeader>
            <DialogTitle className="text-white">Editar equipo</DialogTitle>
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
              <Label className="text-xs text-[#8b949e]">Descripcion</Label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="bg-[#0d1117] border-[#2d333b] text-white resize-none"
              />
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
