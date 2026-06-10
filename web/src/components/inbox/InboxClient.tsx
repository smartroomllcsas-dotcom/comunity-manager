"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare, Sparkles, RefreshCw, GaugeCircle, Users2, Radio, PanelTopClose, PanelTopOpen } from "lucide-react";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatWindow } from "@/components/inbox/ChatWindow";
import { ContactPanel } from "@/components/inbox/ContactPanel";
import { InboxChannelsBar } from "@/components/inbox/InboxChannelsBar";
import { cn } from "@/lib/utils";
import { useInboxStore } from "@/stores/inbox";
import { useConversations } from "@/hooks/useConversations";
import { useChannels } from "@/hooks/useChannels";
import type { Channel, Conversation } from "@/types/database";

interface InboxClientProps {
  initialConversations: Conversation[];
  initialChannels: Channel[];
}

export function InboxClient({ initialConversations, initialChannels }: InboxClientProps) {
  const selectedId = useInboxStore((s) => s.selectedConversationId);
  const contactPanelOpen = useInboxStore((s) => s.contactPanelOpen);
  const setSelectedConversation = useInboxStore((s) => s.setSelectedConversation);
  const { data: conversations, isLoading } = useConversations(initialConversations);
  const { data: channels } = useChannels(initialChannels);
  const selectedConversation = conversations?.find((c) => c.id === selectedId);
  const [showTopPanel, setShowTopPanel] = useState(true);

  useEffect(() => {
    if (!selectedId && conversations?.length) {
      setSelectedConversation(conversations[0].id);
    }
  }, [conversations, selectedId, setSelectedConversation]);

  const openCount = conversations?.filter((c) => c.status === "open").length || 0;
  const pendingCount = conversations?.filter((c) => c.status === "pending").length || 0;
  const activeChannels = channels?.filter((channel) => channel.status === "active").length || 0;
  const unassignedCount = conversations?.filter((c) => c.status === "open" && !c.assigned_agent_id).length || 0;

  return (
    <div className="relative flex flex-col h-[calc(100vh-48px)] overflow-hidden bg-[#0b1020]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 left-8 h-64 w-64 rounded-full bg-[#3b82f6]/12 blur-3xl" />
        <div className="absolute top-24 right-12 h-72 w-72 rounded-full bg-[#8b5cf6]/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-[#14b8a6]/10 blur-3xl" />
      </div>

      <div className="relative border-b border-white/5 bg-gradient-to-b from-[#0b1020]/95 to-[#0b1020]/75 px-6 pb-4 pt-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#2d333b] bg-[#11172a] px-3 py-1 text-[11px] font-medium text-[#8b949e]">
              <Sparkles className="h-3.5 w-3.5 text-[#58a6ff]" />
              Centro de mensajes multicanal
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Inbox de CommunityAgent</h1>
              <p className="mt-1 max-w-2xl text-sm text-[#8b949e]">
                Unifica WhatsApp, Facebook, Instagram y futuros canales en una sola operación, con filtros por canal y contexto del contacto.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTopPanel((open) => !open)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#2d333b] bg-[#11172a] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-[#3d444d] hover:bg-[#161d33]"
            >
              {showTopPanel ? <PanelTopClose className="h-4 w-4 text-[#8b949e]" /> : <PanelTopOpen className="h-4 w-4 text-[#58a6ff]" />}
              {showTopPanel ? "Ocultar panel" : "Mostrar panel"}
            </button>
            <Link
              href="/settings/channels"
              className="inline-flex items-center gap-2 rounded-xl border border-[#2d333b] bg-[#11172a] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-[#3d444d] hover:bg-[#161d33]"
            >
              <Radio className="h-4 w-4 text-[#58a6ff]" />
              Ver canales
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-[#2d333b] bg-[#11172a] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-[#3d444d] hover:bg-[#161d33]"
            >
              <RefreshCw className="h-4 w-4 text-[#8b949e]" />
              Refrescar
            </button>
          </div>
        </div>

        {showTopPanel && (
          <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/6 bg-[#11172a]/90 p-4 shadow-lg shadow-black/10">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.22em] text-[#8b949e]">Abiertas</p>
                <GaugeCircle className="h-4 w-4 text-[#58a6ff]" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{openCount}</p>
            </div>
            <div className="rounded-2xl border border-white/6 bg-[#11172a]/90 p-4 shadow-lg shadow-black/10">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.22em] text-[#8b949e]">Sin asignar</p>
                <Users2 className="h-4 w-4 text-[#f59e0b]" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{unassignedCount}</p>
            </div>
            <div className="rounded-2xl border border-white/6 bg-[#11172a]/90 p-4 shadow-lg shadow-black/10">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.22em] text-[#8b949e]">Pendientes</p>
                <MessageSquare className="h-4 w-4 text-[#14b8a6]" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{pendingCount}</p>
            </div>
            <div className="rounded-2xl border border-white/6 bg-[#11172a]/90 p-4 shadow-lg shadow-black/10">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.22em] text-[#8b949e]">Canales activos</p>
                <Radio className="h-4 w-4 text-[#8b949e]" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{activeChannels}</p>
            </div>
          </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {showTopPanel && <InboxChannelsBar channels={channels || []} />}

        <div className={cn("flex min-h-0 flex-1 gap-4 overflow-hidden p-4", !showTopPanel && "pt-3")}>
          <div className="w-[320px] min-w-[320px] overflow-hidden rounded-3xl border border-white/6 bg-[#11172a]/85 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <ConversationList conversations={conversations || []} isLoading={isLoading} />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden rounded-3xl border border-white/6 bg-[#0f1526]/90 shadow-2xl shadow-black/20 backdrop-blur-sm">
            {selectedConversation ? (
              <ChatWindow conversation={selectedConversation} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[#8b949e]">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/6 bg-[#11172a] shadow-lg shadow-black/20">
                  <MessageSquare className="h-8 w-8 text-[#4b5563]" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">Selecciona una conversación</p>
                  <p className="mx-auto max-w-md text-xs text-[#8b949e]">
                    Elige un chat para ver el contexto, responder y gestionar el canal desde esta misma pantalla.
                  </p>
                </div>
              </div>
            )}
          </div>

          {selectedConversation && contactPanelOpen && (
            <div className="w-[320px] min-w-[320px] overflow-hidden rounded-3xl border border-white/6 bg-[#11172a]/85 shadow-2xl shadow-black/20 backdrop-blur-sm">
              <ContactPanel conversation={selectedConversation} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
