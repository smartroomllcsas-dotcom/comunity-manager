"use client";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatWindow } from "@/components/inbox/ChatWindow";
import { ContactPanel } from "@/components/inbox/ContactPanel";
import { useInboxStore } from "@/stores/inbox";
import { useConversations } from "@/hooks/useConversations";
import { MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  const selectedId = useInboxStore((s) => s.selectedConversationId);
  const contactPanelOpen = useInboxStore((s) => s.contactPanelOpen);
  const { data: conversations } = useConversations();
  const selectedConversation = conversations?.find((c) => c.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#0d1117] overflow-hidden">
      {/* Left Panel - Conversation List */}
      <div className="w-[280px] min-w-[280px] flex flex-col border-r border-[#2d333b] bg-[#161b22]">
        <ConversationList />
      </div>

      {/* Center Panel - Chat Window */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConversation ? (
          <ChatWindow conversation={selectedConversation} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[#8b949e] gap-3">
            <div className="w-16 h-16 rounded-full bg-[#161b22] border border-[#2d333b] flex items-center justify-center">
              <MessageSquare className="h-7 w-7 text-[#484f58]" />
            </div>
            <p className="text-sm font-medium">Selecciona una conversacion</p>
            <p className="text-xs text-[#484f58]">Elige un chat de la lista para comenzar</p>
          </div>
        )}
      </div>

      {/* Right Panel - Contact Info (collapsible) */}
      {selectedConversation && contactPanelOpen && (
        <div className="w-[300px] min-w-[300px] flex flex-col border-l border-[#2d333b] bg-[#161b22]">
          <ContactPanel conversation={selectedConversation} />
        </div>
      )}
    </div>
  );
}
