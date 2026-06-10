"use client";
import { useMessages } from "@/hooks/useMessages";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useInboxStore } from "@/stores/inbox";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { InternalNotes } from "./InternalNotes";
import { SnoozeDropdown } from "./SnoozeDropdown";
import { ClosingDialog } from "./ClosingDialog";
import { ChannelBadge } from "./ChannelBadge";
import { useState, useEffect, useRef } from "react";
import type { Conversation } from "@/types/database";
import type { MessageContent } from "@/types/database";
import {
  UserPlus,
  CheckCircle2,
  XCircle,
  PanelRightOpen,
  PanelRightClose,
  Phone,
  Loader2,
  MessageSquare,
  Bot,
  StickyNote,
} from "lucide-react";
import { useAgents } from "@/hooks/useAgents";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./ContactAvatar";

interface ChatWindowProps {
  conversation: Conversation;
}

type ChatTab = "messages" | "notes";

export function ChatWindow({ conversation }: ChatWindowProps) {
  const { data: messages, isLoading } = useMessages(conversation.id);
  const { data: agent } = useCurrentAgent();
  const { data: agents } = useAgents();
  const contactPanelOpen = useInboxStore((s) => s.contactPanelOpen);
  const toggleContactPanel = useInboxStore((s) => s.toggleContactPanel);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ChatTab>("messages");
  const [closingDialogOpen, setClosingDialogOpen] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (conversation.unread_count > 0) {
      void fetch(`/api/inbox/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      });
    }
  }, [conversation.id, conversation.unread_count]);

  // Reset tab when conversation changes
  useEffect(() => {
    setActiveTab("messages");
  }, [conversation.id]);

  async function handleSend(payload: {
    text?: string;
    attachment?: { kind: "image" | "video" | "audio" | "document" | "sticker"; url: string; filename: string; mimeType: string };
    template?: { name: string; language: string; components?: unknown[] };
  }) {
    const hasText = !!payload.text?.trim();
    const attachment = payload.attachment;

    let type: MessageContent["type"] = "text";
    let content: MessageContent;

    if (payload.template) {
      type = "template";
      content = {
        type: "template",
        template_name: payload.template.name,
        language: payload.template.language,
        components: payload.template.components || [],
      };
    } else if (attachment) {
      type = attachment.kind;
      if (attachment.kind === "image" || attachment.kind === "sticker") {
        if (attachment.kind === "sticker") {
          content = { type: "sticker", url: attachment.url };
        } else {
          content = { type: "image", url: attachment.url, caption: hasText ? payload.text!.trim() : undefined };
        }
      } else if (attachment.kind === "video") {
        content = { type: "video", url: attachment.url, caption: hasText ? payload.text!.trim() : undefined };
      } else if (attachment.kind === "audio") {
        content = { type: "audio", url: attachment.url };
      } else {
        content = { type: "document", url: attachment.url, filename: attachment.filename, caption: hasText ? payload.text!.trim() : undefined };
      }
    } else {
      type = "text";
      content = { type: "text", text: payload.text?.trim() || "" };
    }

    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        type,
        content,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      let error: unknown = { error: errorText || `HTTP ${response.status}` };
      try {
        error = errorText ? JSON.parse(errorText) : error;
      } catch {
        error = { error: errorText || `HTTP ${response.status}` };
      }
      console.error("Failed to send:", error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["messages", conversation.id] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function handleResolve() {
    await fetch(`/api/inbox/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status: "resolved" }),
    });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function handleCloseClick() {
    setClosingDialogOpen(true);
  }

  async function handleCloseConfirm(category: string | null, notes: string | null) {
    await fetch(`/api/inbox/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", category, notes }),
    });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    setClosingDialogOpen(false);
  }

  async function handleSnooze(snoozedUntil: string) {
    const res = await fetch(`/api/conversations/${conversation.id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snoozedUntil }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  }

  async function handleUnsnooze() {
    const res = await fetch(`/api/conversations/${conversation.id}/snooze`, {
      method: "DELETE",
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  }

  const contact = conversation.contact;
  const assignedAgent = conversation.assigned_agent;
  const displayName = contact?.name || contact?.wa_id || "Desconocido";
  const isSnoozed = !!conversation.snoozed_until;
  const channelType = conversation.channel?.type || "";
  const isWhatsAppConversation = channelType.includes("whatsapp");
  const lastInboundMessage = messages
    ?.filter((message) => message.direction === "inbound")
    .at(-1);
  const whatsappWindowExpired = Boolean(
    isWhatsAppConversation &&
      lastInboundMessage?.created_at &&
      Date.now() - new Date(lastInboundMessage.created_at).getTime() > 24 * 60 * 60 * 1000
  );

  const statusColors: Record<string, string> = {
    open: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    resolved: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    closed: "bg-[#484f58]/20 text-[#8b949e] border-[#484f58]/30",
  };

  const statusLabels: Record<string, string> = {
    open: "Abierta",
    pending: "Pendiente",
    resolved: "Resuelta",
    closed: "Cerrada",
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="h-14 min-h-[56px] border-b border-[#2d333b] bg-[#161b22] flex items-center justify-between px-4">
        <div className="flex items-center gap-3 min-w-0">
          <ContactAvatar
            name={displayName}
            photoUrl={contact?.profile_picture_url}
            className="h-9 w-9 rounded-full text-xs shrink-0"
            initialsClassName="text-[11px]"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-white truncate">{displayName}</p>
              <ChannelBadge conversation={conversation} compact />
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${statusColors[conversation.status] || statusColors.open}`}>
                {statusLabels[conversation.status] || conversation.status}
              </span>
              {isSnoozed && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-blue-500/15 text-blue-400 border-blue-500/30 flex items-center gap-1">
                  <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Snoozed
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="h-2.5 w-2.5 text-[#484f58]" />
              <p className="text-[11px] text-[#8b949e]">{contact?.wa_id}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Snooze */}
          {conversation.status !== "closed" && (
            <SnoozeDropdown
              conversationId={conversation.id}
              isSnoozed={isSnoozed}
              onSnooze={handleSnooze}
              onUnsnooze={handleUnsnooze}
            />
          )}

          {conversation.status === "open" && (
            <button
              onClick={handleResolve}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resolver
            </button>
          )}
          {conversation.status !== "closed" && (
            <button
              onClick={handleCloseClick}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-[#8b949e] hover:bg-[#1a1f2e] transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cerrar
            </button>
          )}
          <div className="w-px h-5 bg-[#2d333b] mx-1" />
          <button
            onClick={toggleContactPanel}
            className="p-1.5 rounded-md text-[#8b949e] hover:bg-[#1a1f2e] hover:text-white transition-colors"
            title={contactPanelOpen ? "Ocultar panel" : "Mostrar panel"}
          >
            {contactPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Assigned Agent Banner */}
      {assignedAgent && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[#161b22] border-b border-[#2d333b]">
          <UserPlus className="h-3 w-3 text-[#484f58]" />
          <span className="text-[11px] text-[#8b949e]">
            Asignado a: <span className="text-[#c9d1d9] font-medium">{assignedAgent.name}</span>
          </span>
        </div>
      )}

      {/* Tab Toggle */}
      <div className="flex items-center border-b border-[#2d333b] bg-[#161b22] px-4">
        <button
          onClick={() => setActiveTab("messages")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors",
            activeTab === "messages"
              ? "text-white border-[#388bfd]"
              : "text-[#8b949e] border-transparent hover:text-white"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Mensajes
        </button>
        <button
          onClick={() => setActiveTab("notes")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors",
            activeTab === "notes"
              ? "text-amber-300 border-amber-400"
              : "text-[#8b949e] border-transparent hover:text-amber-300"
          )}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Notas
        </button>
      </div>

      {/* Content Area */}
      {activeTab === "messages" ? (
        <>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="px-4 py-3 space-y-0.5">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-[#484f58]" />
                </div>
              ) : messages?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#484f58] gap-2">
                  <MessageSquare className="h-8 w-8" />
                  <p className="text-xs">No hay mensajes aun</p>
                </div>
              ) : (
                messages?.map((msg) => <MessageBubble key={msg.id} message={msg} />)
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Message Input */}
          <MessageInput
            onSend={handleSend}
            disabled={!agent}
            conversationId={conversation.id}
            messages={messages || []}
            channelId={conversation.channel_id}
            channelType={conversation.channel?.type}
            whatsappWindowExpired={whatsappWindowExpired}
          />
        </>
      ) : (
        <InternalNotes conversationId={conversation.id} />
      )}

      {/* Closing Dialog */}
      <ClosingDialog
        open={closingDialogOpen}
        onClose={() => setClosingDialogOpen(false)}
        onConfirm={handleCloseConfirm}
        organizationId={conversation.organization_id}
      />
    </div>
  );
}
