"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { InternalNote } from "@/types/database";
import { useEffect } from "react";

type SupabaseNoteChangePayload = {
  new: InternalNote;
};

export function useInternalNotes(conversationId: string | null) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Real-time subscription for new notes
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`notes-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "internal_notes",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload: SupabaseNoteChangePayload) => {
        queryClient.setQueryData<InternalNote[]>(
          ["internal-notes", conversationId],
          (old) => {
            if (!old) return [payload.new as InternalNote];
            const exists = old.some((n) => n.id === (payload.new as InternalNote).id);
            if (exists) return old;
            return [...old, payload.new as InternalNote];
          }
        );
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, queryClient]);

  const query = useQuery<InternalNote[]>({
    queryKey: ["internal-notes", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await fetch(`/api/notes?conversationId=${conversationId}`);
      if (!res.ok) throw new Error("Failed to fetch notes");
      const data = await res.json();
      return data.notes || [];
    },
    enabled: !!conversationId,
  });

  const addNote = useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content }),
      });
      if (!res.ok) throw new Error("Failed to add note");
      const data = await res.json();
      return data.note as InternalNote;
    },
    onSuccess: (note) => {
      queryClient.setQueryData<InternalNote[]>(
        ["internal-notes", conversationId],
        (old) => {
          if (!old) return [note];
          const exists = old.some((n) => n.id === note.id);
          if (exists) return old;
          return [...old, note];
        }
      );
    },
  });

  return { ...query, addNote };
}
