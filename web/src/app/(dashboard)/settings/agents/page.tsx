"use client";
import { useState } from "react";
import { useAgents } from "@/hooks/useAgents";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useInvitations } from "@/hooks/useInvitations";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Trash2, Mail, Shield, Users, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const roleBadgeColors: Record<string, string> = {
  admin: "bg-red-500/20 text-red-400 border-red-500/30",
  supervisor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  agent: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  agent: "Agente",
};

const statusColors: Record<string, { dot: string; label: string }> = {
  online: { dot: "bg-green-400", label: "En línea" },
  away: { dot: "bg-yellow-400", label: "Ausente" },
  offline: { dot: "bg-gray-500", label: "Desconectado" },
};

export default function AgentsSettingsPage() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: currentAgent } = useCurrentAgent();
  const { data: invitations, isLoading: invitationsLoading } = useInvitations();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isAdmin = currentAgent?.role === "admin";

  async function handleInvite() {
    setInviteError("");
    setInviteLoading(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || "Error al enviar invitacion");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("agent");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRoleChange(agentId: string, role: string) {
    if (!role) return;
    setActionLoading(agentId);
    try {
      const res = await fetch(`/api/agents/${agentId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["agents"] });
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemoveAgent(agentId: string) {
    setActionLoading(agentId);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["agents"] });
      }
    } finally {
      setActionLoading(null);
      setRemoveConfirm(null);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    setActionLoading(invitationId);
    try {
      const res = await fetch(`/api/invitations/${invitationId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["invitations"] });
      }
    } finally {
      setActionLoading(null);
    }
  }

  const pendingInvitations = invitations?.filter((i) => i.status === "pending") || [];

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Equipo</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Gestiona los miembros de tu equipo y sus roles</p>
        </div>
        {isAdmin && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger
              render={
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Invitar miembro
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md bg-[#1a1f2e] border-[#2d333b]">
              <DialogHeader>
                <DialogTitle className="text-white">Invitar miembro al equipo</DialogTitle>
                <DialogDescription className="text-[#8b949e]">
                  Envia una invitacion por email para unirse a tu organizacion.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-email" className="text-xs text-[#8b949e]">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="ejemplo@empresa.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role" className="text-xs text-[#8b949e]">Rol</Label>
                  <Select value={inviteRole} onValueChange={(v) => v && setInviteRole(v)}>
                    <SelectTrigger className="w-full bg-[#0d1117] border-[#2d333b] text-white h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                      <SelectItem value="agent">Agente</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-[#8b949e]">
                    {inviteRole === "admin" && "Acceso completo: gestionar equipo, configuracion y todos los chats."}
                    {inviteRole === "supervisor" && "Puede ver todos los chats y reasignar conversaciones."}
                    {inviteRole === "agent" && "Puede ver y responder solo sus chats asignados."}
                  </p>
                </div>
                {inviteError && (
                  <p className="text-sm text-red-400">{inviteError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleInvite}
                  disabled={!inviteEmail || inviteLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {inviteLoading ? "Enviando..." : "Enviar invitacion"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="p-6">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-[#8b949e]" />
              <span className="text-xs font-medium text-[#8b949e]">Miembros</span>
            </div>
            <p className="text-2xl font-bold text-white">{agents?.length ?? 0}</p>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-[#8b949e]" />
              <span className="text-xs font-medium text-[#8b949e]">Admins</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {agents?.filter((a) => a.role === "admin").length ?? 0}
            </p>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-[#8b949e]" />
              <span className="text-xs font-medium text-[#8b949e]">Invitaciones pendientes</span>
            </div>
            <p className="text-2xl font-bold text-white">{pendingInvitations.length}</p>
          </div>
        </div>

        {/* Team members table */}
        <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden mb-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2d333b]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Email</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Rol</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Max chats</th>
                {isAdmin && <th className="px-4 py-2.5 w-16" />}
              </tr>
            </thead>
            <tbody>
              {agentsLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="text-center py-12 text-[#8b949e]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Cargando...</span>
                    </div>
                  </td>
                </tr>
              ) : agents?.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="text-center py-12 text-[#8b949e]">
                    No hay miembros en el equipo
                  </td>
                </tr>
              ) : (
                agents?.map((agent) => {
                  const isSelf = agent.id === currentAgent?.id;
                  const sc = statusColors[agent.status] || statusColors.offline;
                  return (
                    <tr key={agent.id} className="border-b border-[#2d333b]/50 hover:bg-[#1a1f2e] transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-white">
                          {agent.name}
                          {isSelf && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              Tu
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8b949e]">{agent.email}</td>
                      <td className="px-4 py-3">
                        {isAdmin && !isSelf ? (
                          <Select
                            value={agent.role ?? ""}
                            onValueChange={(role) =>
                              role && handleRoleChange(agent.id ?? "", role)
                            }
                            disabled={actionLoading === agent.id}
                          >
                            <SelectTrigger className="w-32 h-8 bg-[#0d1117] border-[#2d333b] text-white text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                              <SelectItem value="agent">Agente</SelectItem>
                              <SelectItem value="supervisor">Supervisor</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${roleBadgeColors[agent.role] || "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
                            {roleLabels[agent.role] ?? agent.role}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                          <span className={`h-2 w-2 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8b949e]">{agent.max_concurrent_chats}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {!isSelf && (
                            <>
                              {removeConfirm === agent.id ? (
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    onClick={() => handleRemoveAgent(agent.id)}
                                    disabled={actionLoading === agent.id}
                                    className="bg-red-600 hover:bg-red-700 text-white text-xs h-7"
                                  >
                                    {actionLoading === agent.id ? "..." : "Si"}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setRemoveConfirm(null)}
                                    className="bg-transparent border-[#2d333b] text-[#8b949e] hover:text-white text-xs h-7"
                                  >
                                    No
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setRemoveConfirm(agent.id)}
                                  title="Eliminar miembro"
                                  className="p-1.5 rounded hover:bg-red-500/10 text-[#8b949e] hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pending invitations */}
        {isAdmin && (
          <div>
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#8b949e]" /> Invitaciones pendientes
            </h2>
            {invitationsLoading ? (
              <p className="text-sm text-[#8b949e]">Cargando...</p>
            ) : pendingInvitations.length === 0 ? (
              <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg py-8 text-center text-[#8b949e] text-sm">
                No hay invitaciones pendientes
              </div>
            ) : (
              <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#2d333b]">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Email</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Rol</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Expira</th>
                      <th className="px-4 py-2.5 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvitations.map((invitation) => (
                      <tr key={invitation.id} className="border-b border-[#2d333b]/50 hover:bg-[#1a1f2e] transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-white">{invitation.email}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${roleBadgeColors[invitation.role] || "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
                            {roleLabels[invitation.role] ?? invitation.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#8b949e]">
                          {new Date(invitation.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#8b949e]">
                          {new Date(invitation.expires_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleCancelInvitation(invitation.id)}
                            disabled={actionLoading === invitation.id}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === invitation.id ? "..." : "Cancelar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
