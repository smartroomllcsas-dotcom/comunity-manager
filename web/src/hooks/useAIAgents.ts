"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AIAgent, KnowledgeSource } from "@/types/database";

export function useAIAgents() {
  return useQuery<AIAgent[]>({
    queryKey: ["ai-agents"],
    queryFn: async () => {
      const res = await fetch("/api/ai-agents");
      if (!res.ok) throw new Error("Failed to fetch AI agents");
      const data = await res.json();
      return data.agents || [];
    },
  });
}

export function useAIAgent(id: string | null) {
  return useQuery<AIAgent>({
    queryKey: ["ai-agents", id],
    queryFn: async () => {
      const res = await fetch(`/api/ai-agents/${id}`);
      if (!res.ok) throw new Error("Failed to fetch AI agent");
      const data = await res.json();
      return data.agent;
    },
    enabled: !!id,
  });
}

export function useCreateAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<AIAgent>) => {
      const res = await fetch("/api/ai-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create AI agent");
      }
      const data = await res.json();
      return data.agent as AIAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });
}

export function useUpdateAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<AIAgent> & { id: string }) => {
      const res = await fetch(`/api/ai-agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update AI agent");
      }
      const data = await res.json();
      return data.agent as AIAgent;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents", variables.id] });
    },
  });
}

export function useDeleteAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ai-agents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete AI agent");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });
}

export function useToggleAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ai-agents/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to toggle AI agent");
      }
      const data = await res.json();
      return data.agent as AIAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });
}

export function useTestAIAgent() {
  return useMutation({
    mutationFn: async ({
      id,
      message,
      conversationHistory,
    }: {
      id: string;
      message: string;
      conversationHistory: { role: "user" | "assistant"; content: string }[];
    }) => {
      const res = await fetch(`/api/ai-agents/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationHistory }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to test AI agent");
      }
      return res.json() as Promise<{
        response: string;
        actions: { type: string; params: string[]; label: string }[];
      }>;
    },
  });
}

export function useKnowledgeSources(agentId: string | null) {
  return useQuery<KnowledgeSource[]>({
    queryKey: ["ai-agents", agentId, "knowledge"],
    queryFn: async () => {
      const res = await fetch(`/api/ai-agents/${agentId}/knowledge`);
      if (!res.ok) throw new Error("Failed to fetch knowledge sources");
      const data = await res.json();
      return data.sources || [];
    },
    enabled: !!agentId,
  });
}

export function useAddKnowledgeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      agentId,
      ...body
    }: {
      agentId: string;
      type: string;
      name: string;
      content?: string;
      url?: string;
    }) => {
      const res = await fetch(`/api/ai-agents/${agentId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add knowledge source");
      }
      const data = await res.json();
      return data.source as KnowledgeSource;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents", variables.agentId, "knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });
}

export function useDeleteKnowledgeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentId, sourceId }: { agentId: string; sourceId: string }) => {
      const res = await fetch(`/api/ai-agents/${agentId}/knowledge/${sourceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete knowledge source");
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents", variables.agentId, "knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });
}
