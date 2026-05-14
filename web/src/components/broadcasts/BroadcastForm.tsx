"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTemplates } from "@/hooks/useTemplates";
import { useChannels } from "@/hooks/useChannels";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Save, AlertTriangle } from "lucide-react";
import Link from "next/link";

export function BroadcastForm() {
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sending, setSending] = useState(false);
  const { data: templates } = useTemplates();
  const { data: channels } = useChannels();
  const { data: agent } = useCurrentAgent();
  const router = useRouter();
  const supabase = createClient();

  const whatsappChannels = useMemo(() => {
    if (!channels) return [];
    return channels.filter(
      (ch) => ch.type.startsWith("whatsapp") && ch.status === "active"
    );
  }, [channels]);

  // Auto-select first channel when available
  const selectedChannelId = channelId || whatsappChannels[0]?.id || "";

  async function handleCreate(send: boolean) {
    if (!name || !templateId || !agent) return;
    setSending(true);
    try {
      const contactFilter = tagFilter ? { tags: tagFilter.split(",").map((t) => t.trim()) } : {};
      const { data: broadcast, error } = await supabase.from("broadcasts").insert({
        organization_id: agent.organization_id, name, template_id: templateId,
        channel_id: selectedChannelId || null,
        contact_filter: contactFilter, status: send ? "sending" : "draft",
      }).select().single();
      if (error) throw error;
      if (send && broadcast) {
        await fetch("/api/broadcasts/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ broadcastId: broadcast.id }),
        });
      }
      router.push("/broadcasts");
    } finally { setSending(false); }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5 space-y-5">
        <div className="space-y-2">
          <Label className="text-xs text-[#8b949e]">Canal de envio</Label>
          {whatsappChannels.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">
                No hay canales de WhatsApp activos.{" "}
                <Link href="/settings/channels" className="underline hover:text-amber-300">
                  Conecta un canal
                </Link>
              </p>
            </div>
          ) : (
            <Select value={selectedChannelId} onValueChange={(v) => setChannelId(v ?? "")}>
              <SelectTrigger className="bg-[#0d1117] border-[#2d333b] text-white h-9">
                <SelectValue placeholder="Selecciona un canal" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                {whatsappChannels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name}{ch.whatsapp_phone_number ? ` (${ch.whatsapp_phone_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-[#8b949e]">Nombre de la difusion</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Promo Marzo 2026"
            className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-[#8b949e]">Template</Label>
          <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
            <SelectTrigger className="bg-[#0d1117] border-[#2d333b] text-white h-9">
              <SelectValue placeholder="Selecciona un template" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
              {templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.language})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-[#8b949e]">Filtrar por etiquetas (opcional, separadas por coma)</Label>
          <Input
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="Ej: cliente, vip"
            className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => handleCreate(false)}
            disabled={!name || !templateId || sending}
            className="bg-transparent border-[#2d333b] text-[#8b949e] hover:bg-[#0d1117] hover:text-white"
          >
            <Save className="h-4 w-4 mr-1.5" />
            Guardar borrador
          </Button>
          <Button
            onClick={() => handleCreate(true)}
            disabled={!name || !templateId || sending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sending ? "Enviando..." : "Enviar ahora"}
          </Button>
        </div>
      </div>
    </div>
  );
}
