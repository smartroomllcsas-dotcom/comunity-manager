"use client";
import { useEffect, useState } from "react";
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
import { UserPlus, Trash2, Mail, Shield, Users, Clock, ArrowLeft, Building2, UserRoundCog } from "lucide-react";
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

interface BrandOption {
  id: string;
  name: string;
  status: string;
}

interface MembershipAssignment {
  id: string;
  agent_id: string;
  brand_id: string;
}

function isBrandScopedMemberType(memberType: string) {
  return memberType === "brand_admin" || memberType === "brand_advisor";
}

function memberTypeLabel(memberType: string | null | undefined) {
  switch (memberType) {
    case "brand_admin":
      return "Administrador de marca";
    case "brand_advisor":
      return "Asesor de marca";
    default:
      return "Usuario de agencia";
  }
}

export default function AgentsSettingsPage() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: currentAgent } = useCurrentAgent();
  const { data: invitations, isLoading: invitationsLoading } = useInvitations();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  // New members are restricted to a brand unless the agency admin explicitly grants agency-wide access.
  const [inviteMemberType, setInviteMemberType] = useState("brand_advisor");
  const [inviteBrandIds, setInviteBrandIds] = useState<string[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [assignments, setAssignments] = useState<MembershipAssignment[]>([]);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [membershipAgentId, setMembershipAgentId] = useState("");
  const [membershipType, setMembershipType] = useState("agency_user");
  const [membershipBrandIds, setMembershipBrandIds] = useState<string[]>([]);
  const [membershipError, setMembershipError] = useState("");
  const [membershipLoading, setMembershipLoading] = useState(false);

  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isAgencyAdmin =
    currentAgent?.role === "admin" &&
    (currentAgent.member_type || "agency_user") === "agency_user";
  const isBrandAdmin = currentAgent?.member_type === "brand_admin";
  const canManageTeam = isAgencyAdmin || isBrandAdmin;

  function resetInviteForm() {
    const memberType = "brand_advisor";
    setInviteEmail("");
    setInviteMemberType(memberType);
    setInviteRole("agent");
    setInviteBrandIds([]);
    setInviteError("");
  }

  async function loadMemberships() {
    const response = await fetch("/api/agents/memberships", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    setBrands(payload.brands || []);
    setAssignments(payload.assignments || []);
  }

  useEffect(() => {
    if (currentAgent) void loadMemberships();
  }, [currentAgent?.organization_id]);

  function toggleBrand(
    brandId: string,
    selected: string[],
    setter: (value: string[]) => void
  ) {
    setter(
      selected.includes(brandId)
        ? selected.filter((id) => id !== brandId)
        : [...selected, brandId]
    );
  }

  async function handleInvite() {
    setInviteError("");
    setInviteLoading(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          member_type: inviteMemberType,
          brand_ids: isBrandScopedMemberType(inviteMemberType)
            ? inviteBrandIds
            : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || "Error al enviar invitacion");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      setInviteOpen(false);
      resetInviteForm();
    } finally {
      setInviteLoading(false);
    }
  }

  function openMembershipEditor(agentId: string, memberType: string) {
    setMembershipAgentId(agentId);
    setMembershipType(memberType || "agency_user");
    setMembershipBrandIds(
      assignments
        .filter((assignment) => assignment.agent_id === agentId)
        .map((assignment) => assignment.brand_id)
    );
    setMembershipError("");
    setMembershipOpen(true);
  }

  async function handleMembershipSave() {
    setMembershipError("");
    setMembershipLoading(true);
    try {
      const response = await fetch("/api/agents/memberships", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: membershipAgentId,
          member_type: membershipType,
          brand_ids: isBrandScopedMemberType(membershipType)
            ? membershipBrandIds
            : [],
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMembershipError(payload.error || "No se pudo actualizar el miembro.");
        return;
      }
      await Promise.all([
        loadMemberships(),
        queryClient.invalidateQueries({ queryKey: ["agents"] }),
      ]);
      setMembershipOpen(false);
    } finally {
      setMembershipLoading(false);
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
  const agencyUsers =
    (agents?.filter((agent) => (agent.member_type || "agency_user") === "agency_user")
      .length ?? 0) +
    pendingInvitations.filter((invitation) => invitation.member_type === "agency_user").length;
  const brandAdvisors =
    (agents?.filter((agent) => agent.member_type === "brand_advisor").length ?? 0) +
    pendingInvitations.filter((invitation) => invitation.member_type === "brand_advisor").length;
  const brandAdmins =
    (agents?.filter((agent) => agent.member_type === "brand_admin").length ?? 0) +
    pendingInvitations.filter((invitation) => invitation.member_type === "brand_admin").length;

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
        {canManageTeam && (
          <Dialog
            open={inviteOpen}
            onOpenChange={(open) => {
              setInviteOpen(open);
              if (open) resetInviteForm();
            }}
          >
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
                    <DialogTitle className="text-white">Invitar miembro y asignar cliente</DialogTitle>
                <DialogDescription className="text-[#8b949e]">
                  Define si la persona trabaja para toda la agencia o para un cliente especifico.
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
                  <Label htmlFor="invite-member-type" className="text-xs text-[#8b949e]">Tipo de miembro</Label>
                  <Select
                    value={inviteMemberType}
                    onValueChange={(value) => {
                      if (!value) return;
                      setInviteMemberType(value);
                      if (value === "brand_advisor") setInviteRole("agent");
                      if (value === "brand_admin") setInviteRole("supervisor");
                      if (value === "agency_user") {
                        setInviteBrandIds([]);
                        setInviteRole("agent");
                      }
                    }}
                  >
                    <SelectTrigger className="w-full bg-[#0d1117] border-[#2d333b] text-white h-9">
                      <span>{memberTypeLabel(inviteMemberType)}</span>
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                      {isAgencyAdmin && <SelectItem value="agency_user">Usuario de agencia</SelectItem>}
                      {isAgencyAdmin && <SelectItem value="brand_admin">Administrador de marca</SelectItem>}
                      <SelectItem value="brand_advisor">Asesor de marca</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-[#8b949e]">
                    {inviteMemberType === "agency_user" &&
                      "Trabaja para la agencia y puede colaborar en todas las marcas."}
                    {inviteMemberType === "brand_admin" &&
                      "Administra una sola marca y podrá gestionar sus asesores, leads y canales."}
                    {inviteMemberType === "brand_advisor" &&
                      "Solo ve las marcas, leads y canales que le asignes; consume el límite de asesores del plan."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role" className="text-xs text-[#8b949e]">Rol</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => v && setInviteRole(v)}
                    disabled={isBrandScopedMemberType(inviteMemberType)}
                  >
                    <SelectTrigger className="w-full bg-[#0d1117] border-[#2d333b] text-white h-9">
                      <span>{roleLabels[inviteRole] ?? inviteRole}</span>
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
                <div className="rounded-lg border border-[#2d5f9c] bg-[#10233a] p-3 space-y-2">
                  <Label className="text-sm font-medium text-white">
                    Cliente o marca que atendera
                  </Label>
                  {isBrandScopedMemberType(inviteMemberType) ? (
                    <>
                      <p className="text-xs text-[#9fbad6]">
                        {inviteMemberType === "brand_admin"
                          ? "Selecciona un unico cliente. Este administrador gestionara sus canales, leads y asesores."
                          : "Selecciona los clientes que este asesor podra atender. No vera datos de otros clientes."}
                      </p>
                      <div className="max-h-36 overflow-y-auto rounded-md border border-[#2d333b] bg-[#0d1117] p-2 space-y-1">
                        {brands.length === 0 ? (
                          <p className="text-xs text-[#8b949e] p-2">
                            Crea primero una marca para poder invitar asesores.
                          </p>
                        ) : (
                          brands.map((brand) => (
                            <label
                              key={brand.id}
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-white hover:bg-[#1a1f2e] cursor-pointer"
                            >
                              <input
                                type={inviteMemberType === "brand_admin" ? "radio" : "checkbox"}
                                name={inviteMemberType === "brand_admin" ? "invite-brand-admin" : undefined}
                                checked={inviteBrandIds.includes(brand.id)}
                                onChange={() => {
                                  if (inviteMemberType === "brand_admin") {
                                    setInviteBrandIds([brand.id]);
                                    return;
                                  }
                                  toggleBrand(brand.id, inviteBrandIds, setInviteBrandIds);
                                }}
                              />
                              {brand.name}
                            </label>
                          ))
                        )}
                      </div>
                      <p className="text-xs text-[#8b949e]">
                        El limite de asesores se valida automaticamente con el plan contratado.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-[#9fbad6]">
                      Este usuario trabajara para toda la agencia y podra acceder a todos los clientes. Para limitarlo a un cliente, selecciona Asesor de marca o Administrador de marca arriba.
                    </p>
                  )}
                </div>
                {inviteError && (
                  <p className="text-sm text-red-400">{inviteError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleInvite}
                  disabled={
                    !inviteEmail ||
                    inviteLoading ||
                    (isBrandScopedMemberType(inviteMemberType) &&
                      inviteBrandIds.length === 0)
                  }
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {inviteLoading ? "Enviando..." : "Enviar invitacion"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Dialog open={membershipOpen} onOpenChange={setMembershipOpen}>
        <DialogContent className="sm:max-w-md bg-[#1a1f2e] border-[#2d333b]">
          <DialogHeader>
            <DialogTitle className="text-white">Clasificar miembro</DialogTitle>
            <DialogDescription className="text-[#8b949e]">
              Separa el equipo interno de los asesores asignados a marcas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-[#8b949e]">Tipo de miembro</Label>
              <Select
                value={membershipType}
                onValueChange={(value) => {
                  if (!value) return;
                  setMembershipType(value);
                  if (value === "brand_admin" && membershipBrandIds.length > 1) {
                    setMembershipBrandIds(membershipBrandIds.slice(0, 1));
                  }
                }}
              >
                <SelectTrigger className="w-full bg-[#0d1117] border-[#2d333b] text-white h-9">
                  <span>{memberTypeLabel(membershipType)}</span>
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                  {isAgencyAdmin && <SelectItem value="agency_user">Usuario de agencia</SelectItem>}
                  {isAgencyAdmin && <SelectItem value="brand_admin">Administrador de marca</SelectItem>}
                  <SelectItem value="brand_advisor">Asesor de marca</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isBrandScopedMemberType(membershipType) && (
              <div className="space-y-2">
                <Label className="text-xs text-[#8b949e]">Marcas asignadas</Label>
                <div className="max-h-44 overflow-y-auto rounded-md border border-[#2d333b] bg-[#0d1117] p-2 space-y-1">
                  {brands.map((brand) => (
                    <label
                      key={brand.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-white hover:bg-[#1a1f2e] cursor-pointer"
                    >
                      <input
                        type={membershipType === "brand_admin" ? "radio" : "checkbox"}
                        name={membershipType === "brand_admin" ? "membership-brand-admin" : undefined}
                        checked={membershipBrandIds.includes(brand.id)}
                        onChange={() => {
                          if (membershipType === "brand_admin") {
                            setMembershipBrandIds([brand.id]);
                            return;
                          }
                          toggleBrand(brand.id, membershipBrandIds, setMembershipBrandIds);
                        }}
                      />
                      {brand.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {membershipError && (
              <p className="text-sm text-red-400">{membershipError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleMembershipSave}
              disabled={
                membershipLoading ||
                (isBrandScopedMemberType(membershipType) &&
                  membershipBrandIds.length === 0)
              }
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {membershipLoading ? "Guardando..." : "Guardar clasificacion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-6">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-[#8b949e]" />
              <span className="text-xs font-medium text-[#8b949e]">Usuarios de agencia</span>
            </div>
            <p className="text-2xl font-bold text-white">{agencyUsers}</p>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-[#8b949e]" />
              <span className="text-xs font-medium text-[#8b949e]">Asesores de marca</span>
            </div>
            <p className="text-2xl font-bold text-white">{brandAdvisors}</p>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserRoundCog className="h-4 w-4 text-[#8b949e]" />
              <span className="text-xs font-medium text-[#8b949e]">Administradores de marca</span>
            </div>
            <p className="text-2xl font-bold text-white">{brandAdmins}</p>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-[#8b949e]" />
              <span className="text-xs font-medium text-[#8b949e]">Administradores</span>
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
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Marcas</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Rol</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Max chats</th>
                {canManageTeam && <th className="px-4 py-2.5 w-16" />}
              </tr>
            </thead>
            <tbody>
              {agentsLoading ? (
                <tr>
                  <td colSpan={canManageTeam ? 8 : 7} className="text-center py-12 text-[#8b949e]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Cargando...</span>
                    </div>
                  </td>
                </tr>
              ) : agents?.length === 0 ? (
                <tr>
                  <td colSpan={canManageTeam ? 8 : 7} className="text-center py-12 text-[#8b949e]">
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
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${
                          agent.member_type === "brand_advisor"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : agent.member_type === "brand_admin"
                            ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                            : "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                        }`}>
                          {memberTypeLabel(agent.member_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#8b949e]">
                        {isBrandScopedMemberType(agent.member_type || "")
                          ? assignments
                              .filter(
                                (assignment) => assignment.agent_id === agent.id
                              )
                              .map(
                                (assignment) =>
                                  brands.find(
                                    (brand) => brand.id === assignment.brand_id
                                  )?.name
                              )
                              .filter(Boolean)
                              .join(", ") || "Sin asignar"
                          : "Todas"}
                      </td>
                      <td className="px-4 py-3">
                        {isAgencyAdmin && !isSelf && !isBrandScopedMemberType(agent.member_type || "") ? (
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
                      {canManageTeam && (
                        <td className="px-4 py-3">
                          {!isSelf && (isAgencyAdmin || agent.member_type === "brand_advisor") && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  openMembershipEditor(
                                    agent.id,
                                    agent.member_type || "agency_user"
                                  )
                                }
                                title="Configurar tipo y marcas"
                                className="p-1.5 rounded hover:bg-blue-500/10 text-[#8b949e] hover:text-blue-400 transition-colors"
                              >
                                <UserRoundCog className="h-4 w-4" />
                              </button>
                              {isAgencyAdmin && removeConfirm === agent.id ? (
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
                              ) : isAgencyAdmin ? (
                                <button
                                  onClick={() => setRemoveConfirm(agent.id)}
                                  title="Eliminar miembro"
                                  className="p-1.5 rounded hover:bg-red-500/10 text-[#8b949e] hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
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
        {canManageTeam && (
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
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Tipo</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Marcas</th>
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
                        <td className="px-4 py-3 text-xs text-[#8b949e]">
                          {memberTypeLabel(invitation.member_type)}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#8b949e]">
                          {isBrandScopedMemberType(invitation.member_type || "")
                            ? (invitation.brand_ids || [])
                                .map(
                                  (brandId) =>
                                    brands.find((brand) => brand.id === brandId)
                                      ?.name
                                )
                                .filter(Boolean)
                                .join(", ") || "Sin asignar"
                            : "Todas"}
                        </td>
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
