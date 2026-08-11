import { create } from "zustand";
import type { ConversationStatus } from "@/types/database";

interface InboxState {
  selectedConversationId: string | null;
  filter: "all" | "mine" | "unassigned" | ConversationStatus;
  searchQuery: string;
  contactPanelOpen: boolean;
  statusFilter: "open" | "closed" | "pending" | "snoozed" | "all";
  channelFilter: "all" | "whatsapp" | "facebook" | "instagram" | "tiktok" | "telegram" | "webchat" | "custom";
  /** "all" o el id de una marca que el backend haya devuelto como accesible. */
  brandFilter: string;
  setSelectedConversation: (id: string | null) => void;
  setFilter: (filter: InboxState["filter"]) => void;
  setSearchQuery: (query: string) => void;
  toggleContactPanel: () => void;
  setContactPanelOpen: (open: boolean) => void;
  setStatusFilter: (status: InboxState["statusFilter"]) => void;
  setChannelFilter: (channel: InboxState["channelFilter"]) => void;
  setBrandFilter: (brandId: string) => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  selectedConversationId: null,
  filter: "all",
  searchQuery: "",
  contactPanelOpen: false,
  statusFilter: "open",
  channelFilter: "all",
  brandFilter: "all",
  setSelectedConversation: (id) => set({ selectedConversationId: id }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleContactPanel: () => set((s) => ({ contactPanelOpen: !s.contactPanelOpen })),
  setContactPanelOpen: (open) => set({ contactPanelOpen: open }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setChannelFilter: (channelFilter) => set({ channelFilter }),
  // Al cambiar de marca se suelta la conversación abierta: podría pertenecer a
  // la marca anterior y quedaría visible fuera de su filtro.
  setBrandFilter: (brandFilter) => set({ brandFilter, selectedConversationId: null }),
}));
