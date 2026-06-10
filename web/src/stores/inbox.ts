import { create } from "zustand";
import type { ConversationStatus } from "@/types/database";

interface InboxState {
  selectedConversationId: string | null;
  filter: "all" | "mine" | "unassigned" | ConversationStatus;
  searchQuery: string;
  contactPanelOpen: boolean;
  statusFilter: "open" | "closed" | "pending" | "snoozed" | "all";
  channelFilter: "all" | "whatsapp" | "facebook" | "instagram" | "tiktok" | "telegram" | "webchat" | "custom";
  setSelectedConversation: (id: string | null) => void;
  setFilter: (filter: InboxState["filter"]) => void;
  setSearchQuery: (query: string) => void;
  toggleContactPanel: () => void;
  setContactPanelOpen: (open: boolean) => void;
  setStatusFilter: (status: InboxState["statusFilter"]) => void;
  setChannelFilter: (channel: InboxState["channelFilter"]) => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  selectedConversationId: null,
  filter: "all",
  searchQuery: "",
  contactPanelOpen: true,
  statusFilter: "open",
  channelFilter: "all",
  setSelectedConversation: (id) => set({ selectedConversationId: id }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleContactPanel: () => set((s) => ({ contactPanelOpen: !s.contactPanelOpen })),
  setContactPanelOpen: (open) => set({ contactPanelOpen: open }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setChannelFilter: (channelFilter) => set({ channelFilter }),
}));
