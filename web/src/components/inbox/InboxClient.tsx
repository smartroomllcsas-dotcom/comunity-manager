"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Sparkles, RefreshCw, GaugeCircle, Users2, Radio, PanelTopClose, PanelTopOpen } from "lucide-react";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatWindow } from "@/components/inbox/ChatWindow";
import { ContactPanel } from "@/components/inbox/ContactPanel";
import { InboxChannelsBar } from "@/components/inbox/InboxChannelsBar";
import { useInboxStore } from "@/stores/inbox";
import { useConversations } from "@/hooks/useConversations";
import { useChannels } from "@/hooks/useChannels";
import { useInboxBrands } from "@/hooks/useInboxBrands";
import type { Channel, Conversation } from "@/types/database";
import type { InboxBrand } from "@/lib/inbox/brand-display";

interface InboxClientProps {
  initialConversations: Conversation[];
  initialChannels: Channel[];
  initialBrands: InboxBrand[];
}

export function InboxClient({ initialConversations, initialChannels, initialBrands }: InboxClientProps) {
  const selectedId = useInboxStore((s) => s.selectedConversationId);
  const contactPanelOpen = useInboxStore((s) => s.contactPanelOpen);
  const setSelectedConversation = useInboxStore((s) => s.setSelectedConversation);
  const {
    data: conversations,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useConversations(initialConversations);
  const { data: channels } = useChannels(initialChannels);
  // Seed the shared query cache before the child filters and rows render. The
  // server already resolved the authorized catalog, so labels are available
  // in the first paint instead of appearing after a browser fetch.
  const { data: brands } = useInboxBrands(initialBrands);
  const selectedConversation = conversations?.find((c) => c.id === selectedId);
  // Keep the dashboard summary closed until the operator explicitly opens it.
  const [showTopPanel, setShowTopPanel] = useState(false);

  useEffect(() => {
    if (!selectedId && conversations?.length) {
      setSelectedConversation(conversations[0].id);
    }
  }, [conversations, selectedId, setSelectedConversation]);

  const openCount = conversations?.filter((c) => c.status === "open").length || 0;
  const pendingCount = conversations?.filter((c) => c.status === "pending").length || 0;
  const activeChannels = channels?.filter((channel) => channel.status === "active").length || 0;
  const unassignedCount = conversations?.filter((c) => c.status === "open" && !c.assigned_agent_id).length || 0;

  void brands;

  const loadMoreConversations = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const actionButtonClass =
    "inline-flex h-8 max-sm:min-h-[var(--touch-target)] items-center gap-1.5 rounded-md border border-white/[0.08] bg-transparent px-3 text-[13px] font-medium text-[var(--text-secondary)] transition-[background-color,border-color,color,transform] duration-[var(--duration-fast)] ease-[var(--easing-out)] hover:bg-[var(--inbox-hover)] hover:text-[var(--text-primary)] hover:border-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="relative flex flex-col h-[calc(100vh-48px)] overflow-hidden bg-[var(--inbox-canvas)]">
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">Inbox</h1>
          <span className="hidden items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] md:inline-flex">
            <Sparkles className="icon-xs text-[var(--accent-text)]" />
            Multicanal
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTopPanel((open) => !open)}
            className={actionButtonClass}
          >
            {showTopPanel ? <PanelTopClose className="icon-sm" /> : <PanelTopOpen className="icon-sm text-[var(--accent-text)]" />}
            {showTopPanel ? "Ocultar panel" : "Mostrar panel"}
          </button>
          <Link href="/settings/channels" className={actionButtonClass}>
            <Radio className="icon-sm text-[var(--accent-text)]" />
            Ver canales
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={actionButtonClass}
          >
            <RefreshCw className="icon-sm" />
            Refrescar
          </button>
        </div>
      </div>

      {showTopPanel && (
        <div className="grid grid-cols-2 divide-x divide-white/[0.06] border-b border-white/[0.06] xl:grid-cols-4">
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Abiertas</p>
              <GaugeCircle className="icon-sm text-[var(--accent-text)]" />
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">{openCount}</p>
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Sin asignar</p>
              <Users2 className="icon-sm text-warning" />
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">{unassignedCount}</p>
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Pendientes</p>
              <MessageSquare className="icon-sm text-[var(--text-secondary)]" />
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">{pendingCount}</p>
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Canales activos</p>
              <Radio className="icon-sm text-[var(--text-secondary)]" />
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">{activeChannels}</p>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {showTopPanel && <InboxChannelsBar channels={channels || []} />}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 w-[320px] min-w-[320px] flex-col overflow-hidden border-r border-white/[0.06] bg-[var(--inbox-panel)]">
            <ConversationList
              conversations={conversations || []}
              isLoading={isLoading}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={loadMoreConversations}
            />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden bg-[var(--inbox-canvas)]">
            {selectedConversation ? (
              <ChatWindow conversation={selectedConversation} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/[0.06] bg-[var(--inbox-raised)]">
                  <MessageSquare className="icon-lg text-[var(--text-tertiary)]" />
                </div>
                <div className="space-y-1">
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">Selecciona una conversación</p>
                  <p className="mx-auto max-w-md text-xs text-[var(--text-secondary)]">
                    Elige un chat para ver el contexto, responder y gestionar el canal desde esta misma pantalla.
                  </p>
                </div>
              </div>
            )}
          </div>

          {selectedConversation && contactPanelOpen && (
            <div className="w-[300px] min-w-[300px] overflow-hidden border-l border-white/[0.06] bg-[var(--inbox-panel)]">
              <ContactPanel conversation={selectedConversation} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
