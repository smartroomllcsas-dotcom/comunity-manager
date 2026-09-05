"use client";
import { useEffect, useRef } from "react";
import { useInboxStore } from "@/stores/inbox";
import { ConversationFilters } from "./ConversationFilters";
import { ConversationItem } from "./ConversationItem";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Inbox } from "lucide-react";
import type { Conversation } from "@/types/database";

interface ConversationListProps {
  conversations?: Conversation[];
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

export function ConversationList({
  conversations = [],
  isLoading = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
}: ConversationListProps) {
  const selectedId = useInboxStore((s) => s.selectedConversationId);
  const setSelected = useInboxStore((s) => s.setSelectedConversation);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const openCount = conversations?.filter((c) => c.status === "open").length || 0;

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    const scrollContainer = sentinel?.parentElement;
    if (!sentinel || !scrollContainer || !onLoadMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { root: scrollContainer, rootMargin: "240px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="h-11 min-h-[44px] shrink-0 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Bandeja de entrada</h2>
        {openCount > 0 && (
          <span
            className="text-[10px] font-medium tabular-nums bg-[var(--accent-soft)] text-[var(--accent-text)] px-1.5 py-0.5 rounded"
            aria-label={`${openCount} conversaciones abiertas`}
          >
            {openCount}
          </span>
        )}
      </div>

      {/* Filters */}
      <ConversationFilters />

      {/* Conversation List */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando conversaciones" />
          </div>
        ) : conversations?.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No hay conversaciones"
            description="Cuando lleguen mensajes nuevos aparecerán aquí."
            size="sm"
          />
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedId === conv.id}
              onClick={() => setSelected(conv.id)}
            />
          ))
        )}
        {hasNextPage && (
          <div ref={loadMoreRef} className="flex min-h-10 items-center justify-center px-3 py-2">
            {isFetchingNextPage ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Cargando más leads" />
            ) : (
              <span className="text-[10px] text-[var(--text-tertiary)]">Desplaza para cargar más leads</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
