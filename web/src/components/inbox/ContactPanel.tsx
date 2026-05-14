"use client";
import { useState } from "react";
import type { Conversation } from "@/types/database";
import { useAgents } from "@/hooks/useAgents";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useInboxStore } from "@/stores/inbox";
import {
  X,
  Phone,
  Tag,
  User,
  Clock,
  ChevronDown,
  ChevronRight,
  FileText,
  MessageSquare,
  CircleDot,
  StickyNote,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ContactPanelProps {
  conversation: Conversation;
}

const avatarColors = [
  "bg-blue-600", "bg-emerald-600", "bg-purple-600", "bg-amber-600",
  "bg-rose-600", "bg-cyan-600", "bg-indigo-600", "bg-pink-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#2d333b]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[#1a1f2e] transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-[#484f58] shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-[#484f58] shrink-0" />
        )}
        <Icon className="h-3 w-3 text-[#484f58] shrink-0" />
        <span className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
          {title}
        </span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function ContactPanel({ conversation }: ContactPanelProps) {
  const contact = conversation.contact;
  const { data: agents } = useAgents();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const setContactPanelOpen = useInboxStore((s) => s.setContactPanelOpen);

  async function handleAssign(agentId: string) {
    const value = agentId === "unassigned" ? null : agentId;
    await supabase
      .from("conversations")
      .update({ assigned_agent_id: value })
      .eq("id", conversation.id);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function handleStatusChange(status: string) {
    await supabase
      .from("conversations")
      .update({
        status,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", conversation.id);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  if (!contact) return null;

  const displayName = contact.name || contact.wa_id;
  const initials = displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with close button */}
      <div className="h-12 min-h-[48px] flex items-center justify-between px-4 border-b border-[#2d333b]">
        <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
          Contacto
        </span>
        <button
          onClick={() => setContactPanelOpen(false)}
          className="p-1 rounded-md text-[#484f58] hover:text-white hover:bg-[#1a1f2e] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Contact Header */}
        <div className="flex flex-col items-center text-center px-4 py-5 border-b border-[#2d333b]">
          <div
            className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center text-white text-lg font-semibold mb-3",
              getAvatarColor(displayName)
            )}
          >
            {initials}
          </div>
          <h3 className="font-semibold text-white text-sm">
            {contact.name || "Sin nombre"}
          </h3>
          <p className="text-xs text-[#8b949e] flex items-center gap-1 mt-1">
            <Phone className="h-3 w-3" />
            {contact.wa_id}
          </p>
        </div>

        {/* Contact Info */}
        <CollapsibleSection title="Informacion" icon={FileText}>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-[#484f58] uppercase tracking-wider">
                Nombre
              </label>
              <p className="text-xs text-[#c9d1d9]">{contact.name || "Sin nombre"}</p>
            </div>
            <div>
              <label className="text-[10px] text-[#484f58] uppercase tracking-wider">
                WhatsApp
              </label>
              <p className="text-xs text-[#c9d1d9]">{contact.wa_id}</p>
            </div>
            {contact.custom_fields &&
              Object.entries(contact.custom_fields).map(([key, value]) => (
                <div key={key}>
                  <label className="text-[10px] text-[#484f58] uppercase tracking-wider">
                    {key}
                  </label>
                  <p className="text-xs text-[#c9d1d9]">{value}</p>
                </div>
              ))}
          </div>
        </CollapsibleSection>

        {/* Tags */}
        <CollapsibleSection title="Etiquetas" icon={Tag}>
          <div className="flex flex-wrap gap-1">
            {contact.tags?.length > 0 ? (
              contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#388bfd]/15 text-[#58a6ff] border border-[#388bfd]/20"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-[#484f58]">Sin etiquetas</span>
            )}
          </div>
        </CollapsibleSection>

        {/* Assignment */}
        <CollapsibleSection title="Asignacion" icon={User}>
          <select
            value={conversation.assigned_agent_id || "unassigned"}
            onChange={(e) => handleAssign(e.target.value)}
            className="w-full h-8 rounded-md bg-[#0d1117] border border-[#2d333b] text-xs text-[#c9d1d9] px-2 focus:outline-none focus:border-[#388bfd] transition-colors"
          >
            <option value="unassigned">Sin asignar</option>
            {agents?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </CollapsibleSection>

        {/* Status */}
        <CollapsibleSection title="Estado" icon={CircleDot}>
          <select
            value={conversation.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full h-8 rounded-md bg-[#0d1117] border border-[#2d333b] text-xs text-[#c9d1d9] px-2 focus:outline-none focus:border-[#388bfd] transition-colors"
          >
            <option value="open">Abierta</option>
            <option value="pending">Pendiente</option>
            <option value="resolved">Resuelta</option>
            <option value="closed">Cerrada</option>
          </select>
        </CollapsibleSection>

        {/* Lifecycle / Stage */}
        <CollapsibleSection title="Ciclo de vida" icon={Clock} defaultOpen={false}>
          <div className="flex items-center gap-3">
            {["Nuevo", "Activo", "VIP"].map((stage, i) => (
              <div key={stage} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    i === 0
                      ? "bg-emerald-500"
                      : "bg-[#30363d]"
                  )}
                />
                <span className="text-[9px] text-[#484f58]">{stage}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Notes */}
        <CollapsibleSection title="Notas" icon={StickyNote} defaultOpen={false}>
          <textarea
            placeholder="Agregar una nota..."
            className="w-full h-16 rounded-md bg-[#0d1117] border border-[#2d333b] text-xs text-[#c9d1d9] placeholder:text-[#484f58] px-2 py-1.5 resize-none focus:outline-none focus:border-[#388bfd] transition-colors"
          />
        </CollapsibleSection>

        {/* Conversation Metadata */}
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#484f58]">Creado</span>
            <span className="text-[10px] text-[#8b949e]">
              {format(new Date(conversation.created_at), "dd MMM yyyy HH:mm", {
                locale: es,
              })}
            </span>
          </div>
          {conversation.resolved_at && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#484f58]">Resuelto</span>
              <span className="text-[10px] text-[#8b949e]">
                {format(
                  new Date(conversation.resolved_at),
                  "dd MMM yyyy HH:mm",
                  { locale: es }
                )}
              </span>
            </div>
          )}
          {contact.last_message_at && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#484f58]">Ultimo mensaje</span>
              <span className="text-[10px] text-[#8b949e]">
                {format(
                  new Date(contact.last_message_at),
                  "dd MMM yyyy HH:mm",
                  { locale: es }
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
