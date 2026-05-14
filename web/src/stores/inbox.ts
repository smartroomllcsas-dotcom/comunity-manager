import { create } from "zustand";
import type { ConversationStatus } from "@/types/database";

interface InboxState {
  selectedConversationId: string | null;
  filter: "all" | "mine" | "unassigned" | ConversationStatus;
  searchQuery: string;
  contactPanelOpen: boolean;
  statusFilter: "open" | "closed" | "pending" | "snoozed" | "all";
  setSelectedConversation: (id: string | null) => void;
  setFilter: (filter: InboxState["filter"]) => void;
  setSearchQuery: (query: string) => void;
  toggleContactPanel: () => void;
  setContactPanelOpen: (open: boolean) => void;
  setStatusFilter: (status: InboxState["statusFilter"]) => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  selectedConversationId: null,
  filter: "all",
  searchQuery: "",
  contactPanelOpen: true,
  statusFilter: "open",
  setSelectedConversation: (id) => set({ selectedConversationId: id }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleContactPanel: () => set((s) => ({ contactPanelOpen: !s.contactPanelOpen })),
  setContactPanelOpen: (open) => set({ contactPanelOpen: open }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
}));
