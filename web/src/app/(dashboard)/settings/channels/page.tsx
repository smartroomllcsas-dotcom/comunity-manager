"use client";
import { useState, useEffect } from "react";
import { useChannels } from "@/hooks/useChannels";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { AddChannelDialog } from "@/components/channels/AddChannelDialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Plus,
  Settings2,
  Wifi,
  WifiOff,
  Clock,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle2,
  Calendar,
  Phone,
  Hash,
  Shield,
} from "lucide-react";
import type { Channel, ChannelStatus } from "@/types/database";
import Link from "next/link";

export const dynamic = "force-dynamic";

function channelStatusConfig(status: ChannelStatus) {
  switch (status) {
    case "active":
      return { label: "Activo", dotColor: "bg-green-400", badgeBg: "bg-green-500/20", badgeText: "text-green-400", icon: Wifi };
    case "disconnected":
      return { label: "Desconectado", dotColor: "bg-red-400", badgeBg: "bg-red-500/20", badgeText: "text-red-400", icon: WifiOff };
    case "pending":
      return { label: "Pendiente", dotColor: "bg-yellow-400", badgeBg: "bg-yellow-500/20", badgeText: "text-yellow-400", icon: Clock };
    case "error":
      return { label: "Error", dotColor: "bg-red-400", badgeBg: "bg-red-500/20", badgeText: "text-red-400", icon: AlertCircle };
    default:
      return { label: status, dotColor: "bg-gray-400", badgeBg: "bg-gray-500/20", badgeText: "text-gray-400", icon: Wifi };
  }
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-8 w-8 text-green-500 fill-current"}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function channelIcon(type: string) {
  switch (type) {
    case "whatsapp_business_api":
    case "whatsapp_cloud_api":
      return <WhatsAppIcon className="h-10 w-10 text-green-500 fill-current" />;
    default:
      return <Wifi className="h-10 w-10 text-[#8b949e]" />;
  }
}

function channelDisplayName(channel: Channel) {
  if (channel.name) return channel.name;
  switch (channel.type) {
    case "whatsapp_business_api": return "WhatsApp Business";
    case "whatsapp_cloud_api": return "WhatsApp Cloud";
    case "facebook_messenger": return "Facebook Messenger";
    case "instagram": return "Instagram";
    case "telegram": return "Telegram";
    default: return channel.type;
  }
}

function channelDescription(channel: Channel) {
  const parts: string[] = [];
  if (channel.type === "whatsapp_business_api" || channel.type === "whatsapp_cloud_api") {
    parts.push("WhatsApp Business Platform (API)");
  }
  if (channel.whatsapp_phone_number) parts.push(channel.whatsapp_phone_number);
  if (channel.whatsapp_business_account_id) parts.push(`ID: ${channel.whatsapp_business_account_id}`);
  return parts.join(" — ") || channel.type;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tokenDaysRemaining(expiresAt: string | null): { days: number; label: string; color: string } | null {
  if (!expiresAt) return null;
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();
  const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  if (days > 14) return { days, label: `${days} días restantes`, color: "text-green-400" };
  if (days > 3) return { days, label: `${days} días restantes`, color: "text-yellow-400" };
  return { days, label: days === 0 ? "Expira hoy" : `${days} días restantes`, color: "text-red-400" };
}

function ChannelManageSheet({
  channel,
  open,
  onOpenChange,
  onUpdated,
}: {
  channel: Channel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Reset state when channel changes
  useEffect(() => {
    if (channel) {
      setEditName(channelDisplayName(channel));
    }
  }, [channel]);

  if (!channel) return null;

  const sc = channelStatusConfig(channel.status);
  const StatusIcon = sc.icon;
  const tokenInfo = tokenDaysRemaining(channel.token_expires_at);

  async function handleSaveName() {
    if (!channel || !editName.trim() || editName === channelDisplayName(channel)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        onUpdated();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncTemplates() {
    if (!channel) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/templates/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channel.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`${data.synced} plantillas sincronizadas`);
        onUpdated();
      } else {
        setSyncResult(data.error || "Error al sincronizar");
      }
    } catch {
      setSyncResult("Error de conexión al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!channel) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/channels/${channel.id}`, { method: "DELETE" });
      if (res.ok) {
        onUpdated();
        onOpenChange(false);
      }
    } finally {
      setDisconnecting(false);
      setConfirmDisconnect(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto bg-[#161b22] border-[#2d333b]">
        <SheetHeader className="border-b border-[#2d333b] pb-4">
          <div className="flex items-center gap-3">
            {channelIcon(channel.type)}
            <div>
              <SheetTitle className="text-white">{channelDisplayName(channel)}</SheetTitle>
              <SheetDescription className="text-[#8b949e]">
                Configuración del canal
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5 p-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${sc.badgeBg} ${sc.badgeText}`}>
              <StatusIcon className="h-3 w-3" />
              {sc.label}
            </span>
            {tokenInfo && (
              <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-[#0d1117] border border-[#2d333b] ${tokenInfo.color}`}>
                <Shield className="h-3 w-3" />
                {tokenInfo.label}
              </span>
            )}
          </div>

          {/* Editable Name */}
          <div>
            <label className="text-xs font-medium text-[#8b949e] mb-1.5 block">Nombre del canal</label>
            <div className="flex gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-[#0d1117] border-[#2d333b] text-white focus:border-blue-500 h-9"
                placeholder="Nombre del canal"
              />
              <Button
                onClick={handleSaveName}
                disabled={saving || !editName.trim() || editName === channelDisplayName(channel)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-3 shrink-0"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
              </Button>
            </div>
          </div>

          {/* Info Fields */}
          <div className="grid gap-3">
            {channel.whatsapp_phone_number && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1117] border border-[#2d333b]">
                <Phone className="h-4 w-4 text-[#8b949e] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-[#8b949e]">Número de teléfono</p>
                  <p className="text-sm text-white font-mono">{channel.whatsapp_phone_number}</p>
                </div>
              </div>
            )}

            {channel.whatsapp_business_account_id && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1117] border border-[#2d333b]">
                <Hash className="h-4 w-4 text-[#8b949e] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-[#8b949e]">WABA ID</p>
                  <p className="text-sm text-white font-mono">{channel.whatsapp_business_account_id}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1117] border border-[#2d333b]">
                <Calendar className="h-4 w-4 text-[#8b949e] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-[#8b949e]">Conectado</p>
                  <p className="text-xs text-white">{formatDate(channel.connected_at)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1117] border border-[#2d333b]">
                <Clock className="h-4 w-4 text-[#8b949e] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-[#8b949e]">Última actividad</p>
                  <p className="text-xs text-white">{formatDate(channel.last_active_at)}</p>
                </div>
              </div>
            </div>

            {channel.token_expires_at && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1117] border border-[#2d333b]">
                <Shield className="h-4 w-4 text-[#8b949e] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-[#8b949e]">Expiración del token</p>
                  <p className="text-xs text-white">{formatDate(channel.token_expires_at)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Sync Templates */}
          <div className="border-t border-[#2d333b] pt-4">
            <Button
              onClick={handleSyncTemplates}
              disabled={syncing}
              className="w-full bg-[#0d1117] border border-[#2d333b] text-white hover:bg-[#1a1f2e] hover:border-blue-500/50 h-9"
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando plantillas..." : "Sincronizar Plantillas"}
            </Button>
            {syncResult && (
              <div className={`mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded-md ${
                syncResult.includes("Error")
                  ? "bg-red-500/10 border border-red-500/30 text-red-400"
                  : "bg-green-500/10 border border-green-500/30 text-green-400"
              }`}>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {syncResult}
              </div>
            )}
          </div>

          {/* Disconnect */}
          <div className="border-t border-[#2d333b] pt-4">
            {!confirmDisconnect ? (
              <Button
                onClick={() => setConfirmDisconnect(true)}
                variant="outline"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 h-9"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Desconectar canal
              </Button>
            ) : (
              <div className="flex flex-col gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-red-400 font-medium">
                  ¿Está seguro? Esta acción eliminará el canal y desvinculara todas las conversaciones asociadas.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    size="sm"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white h-8"
                  >
                    {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    {disconnecting ? "Eliminando..." : "Sí, desconectar"}
                  </Button>
                  <Button
                    onClick={() => setConfirmDisconnect(false)}
                    variant="outline"
                    size="sm"
                    className="flex-1 border-[#2d333b] text-[#8b949e] hover:bg-[#0d1117] h-8"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function ChannelsSettingsPage() {
  const { data: channels, isLoading } = useChannels();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [manageChannel, setManageChannel] = useState<Channel | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  async function handleToggle(channel: Channel) {
    setTogglingId(channel.id);
    try {
      const res = await fetch(`/api/channels/${channel.id}/toggle`, { method: "PATCH" });
      if (res.ok) queryClient.invalidateQueries({ queryKey: ["channels"] });
    } finally {
      setTogglingId(null);
    }
  }

  function handleChannelAdded() {
    queryClient.invalidateQueries({ queryKey: ["channels"] });
  }

  function handleManage(channel: Channel) {
    setManageChannel(channel);
    setSheetOpen(true);
  }

  function handleChannelUpdated() {
    queryClient.invalidateQueries({ queryKey: ["channels"] });
    queryClient.invalidateQueries({ queryKey: ["all-templates"] });
    queryClient.invalidateQueries({ queryKey: ["templates"] });
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Canales</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Administra tus canales de mensajería y descubre otros nuevos</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1.5" />
          Añadir canal
        </Button>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5 h-40 animate-pulse" />
            ))}
          </div>
        ) : !channels || channels.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-20 w-20 rounded-full bg-[#1a1f2e] border border-[#2d333b] flex items-center justify-center">
                <Wifi className="h-10 w-10 text-[#2d333b]" />
              </div>
              <div>
                <p className="font-medium text-white mb-1">No hay canales conectados</p>
                <p className="text-sm text-[#8b949e] max-w-sm">
                  Conecta tu primer canal de mensajería para empezar a recibir y enviar mensajes a tus clientes.
                </p>
              </div>
              <Button onClick={() => setDialogOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-1.5" />
                Añadir canal
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((channel) => {
              const sc = channelStatusConfig(channel.status);
              const StatusIcon = sc.icon;
              return (
                <div key={channel.id} className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5 hover:border-[#3d444d] transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0">{channelIcon(channel.type)}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate mb-1">
                        {channelDisplayName(channel)}
                      </h3>
                      <p className="text-xs text-[#8b949e] leading-relaxed mb-3">
                        {channelDescription(channel)}
                      </p>
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${sc.badgeBg} ${sc.badgeText}`}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#0d1117] hover:text-white text-xs h-7"
                          onClick={() => handleManage(channel)}
                        >
                          <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                          Gestionar
                        </Button>
                        <Switch
                          checked={channel.status === "active"}
                          onCheckedChange={() => handleToggle(channel)}
                          disabled={togglingId === channel.id}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onChannelAdded={handleChannelAdded}
      />

      <ChannelManageSheet
        channel={manageChannel}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={handleChannelUpdated}
      />
    </div>
  );
}
