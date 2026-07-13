"use client";
import { useInboxStore } from "@/stores/inbox";
import { ConversationFilters } from "./ConversationFilters";
import { ConversationItem } from "./ConversationItem";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Inbox } from "lucide-react";
import type { Conversation } from "@/types/database";

interface ConversationListProps {
  conversations?: Conversation[];
  isLoading?: boolean;
}

export function ConversationList({ conversations = [], isLoading = false }: ConversationListProps) {
  const selectedId = useInboxStore((s) => s.selectedConversationId);
  const setSelected = useInboxStore((s) => s.setSelectedConversation);

  const openCount = conversations?.filter((c) => c.status === "open").length || 0;

  return (
    <>
      {/* Header */}
      <div className="h-12 min-h-[48px] flex items-center justify-between px-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Bandeja de entrada</h2>
        {openCount > 0 && (
          <span
            className="text-[10px] font-medium bg-primary/15 text-[#58a6ff] px-1.5 py-0.5 rounded-full"
            aria-label={`${openCount} conversaciones abiertas`}
          >
            {openCount}
          </span>
        )}
      </div>

      {/* Filters */}
      <ConversationFilters />

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
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
      </div>
    </>
  );
}
