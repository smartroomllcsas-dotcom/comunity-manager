"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface RespondIoConnectProps {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

const RESPOND_IO_CHANNEL_TYPES = [
  { value: "whatsapp", label: "WhatsApp Business Platform" },
  { value: "messenger", label: "Facebook Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "line", label: "LINE" },
  { value: "viber", label: "Viber" },
  { value: "wechat", label: "WeChat" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "webchat", label: "Web Chat" },
  { value: "custom", label: "Canal personalizado" },
] as const;

export function RespondIoConnect({ onSuccess, onError }: RespondIoConnectProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    apiToken: "",
    respondChannelId: "",
    respondChannelType: "whatsapp" as (typeof RESPOND_IO_CHANNEL_TYPES)[number]["value"],
    workspaceId: "",
    displayName: "",
    webhookSecret: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/channels/respond-io/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Error al conectar");
      toast.success("Canal Respond.io conectado");
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        Conectar Respond.io
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="respondio-name">Nombre del canal</Label>
        <Input
          id="respondio-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="WhatsApp Principal"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="respondio-type">Tipo de canal</Label>
        <select
          id="respondio-type"
          className="bg-background border border-input rounded-md h-9 px-3 text-sm"
          value={form.respondChannelType}
          onChange={(e) =>
            setForm({
              ...form,
              respondChannelType: e.target.value as (typeof RESPOND_IO_CHANNEL_TYPES)[number]["value"],
            })
          }
        >
          {RESPOND_IO_CHANNEL_TYPES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="respondio-token">API Token de Respond.io</Label>
        <Input
          id="respondio-token"
          type="password"
          value={form.apiToken}
          onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
          placeholder="rio_********************************"
          required
        />
        <p className="text-[11px] text-muted-foreground">
          Genera el token en Respond.io: Settings &gt; Integrations &gt; Developer API &gt; Add Access Token.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="respondio-channel-id">Channel ID</Label>
        <Input
          id="respondio-channel-id"
          value={form.respondChannelId}
          onChange={(e) => setForm({ ...form, respondChannelId: e.target.value })}
          placeholder="ch_XXXXXXXXXX"
          required
        />
        <p className="text-[11px] text-muted-foreground">
          ID del canal conectado en Respond.io (Workspace Settings &gt; Channels).
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="respondio-workspace">Workspace ID (opcional)</Label>
        <Input
          id="respondio-workspace"
          value={form.workspaceId}
          onChange={(e) => setForm({ ...form, workspaceId: e.target.value })}
          placeholder="ws_XXXXXXXXXX"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="respondio-secret">Webhook secret (opcional)</Label>
        <Input
          id="respondio-secret"
          type="password"
          value={form.webhookSecret}
          onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
          placeholder="Clave compartida para validar firmas HMAC"
        />
      </div>

      <div className="flex gap-2 mt-1">
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? "Conectando..." : "Conectar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
