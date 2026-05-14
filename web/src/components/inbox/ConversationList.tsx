"use client";
import { useConversations } from "@/hooks/useConversations";
import { useInboxStore } from "@/stores/inbox";
import { ConversationFilters } from "./ConversationFilters";
import { ConversationItem } from "./ConversationItem";
import { Loader2, Inbox } from "lucide-react";

export function ConversationList() {
  const { data: conversations, isLoading } = useConversations();
  const selectedId = useInboxStore((s) => s.selectedConversationId);
  const setSelected = useInboxStore((s) => s.setSelectedConversation);

  const openCount = conversations?.filter((c) => c.status === "open").length || 0;

  return (
    <>
      {/* Header */}
      <div className="h-12 min-h-[48px] flex items-center justify-between px-4 border-b border-[#2d333b]">
        <h2 className="text-sm font-semibold text-white">Bandeja de entrada</h2>
        {openCount > 0 && (
          <span className="text-[10px] font-medium bg-[#388bfd]/15 text-[#58a6ff] px-1.5 py-0.5 rounded-full">
            {openCount}
          </span>
        )}
      </div>

      {/* Filters */}
      <ConversationFilters />

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#484f58]" />
          </div>
        ) : conversations?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#484f58] gap-2">
            <Inbox className="h-8 w-8" />
            <p className="text-xs">No hay conversaciones</p>
          </div>
        ) : (
          conversations?.map((conv) => (
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
