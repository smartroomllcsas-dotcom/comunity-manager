"use client";
import { useState, useRef, useEffect } from "react";
import { useInternalNotes } from "@/hooks/useInternalNotes";
import { StickyNote, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface InternalNotesProps {
  conversationId: string;
}

export function InternalNotes({ conversationId }: InternalNotesProps) {
  const { data: notes, isLoading, addNote } = useInternalNotes(conversationId);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, [text]);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || addNote.isPending) return;
    setText("");
    addNote.mutate({ content: trimmed });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Notes List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-4 py-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-[#484f58]" />
            </div>
          ) : notes?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#484f58] gap-2">
              <StickyNote className="h-8 w-8" />
              <p className="text-xs">No hay notas internas</p>
              <p className="text-[10px] text-[#30363d]">Las notas solo son visibles para agentes</p>
            </div>
          ) : (
            notes?.map((note) => (
              <div
                key={note.id}
                className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <StickyNote className="h-3 w-3 text-amber-400" />
                  <span className="text-[10px] font-medium text-amber-300">
                    {note.agent?.name || "Agente"}
                  </span>
                  <span className="text-[10px] text-amber-400/50 ml-auto">
                    {format(new Date(note.created_at), "dd/MM HH:mm")}
                  </span>
                </div>
                <p className="text-[13px] text-amber-200 leading-relaxed whitespace-pre-wrap break-words">
                  {note.content}
                </p>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Note Input */}
      <div className="border-t border-[#2d333b] bg-[#161b22] px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe una nota interna..."
              className="w-full min-h-[36px] max-h-[120px] resize-none rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm text-amber-100 placeholder:text-amber-500/30 px-3 py-2 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors scrollbar-thin"
              rows={1}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || addNote.isPending}
            className="p-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-30 disabled:hover:bg-amber-500/20 transition-colors shrink-0 mb-0.5"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[10px] text-amber-500/30 mt-1.5 pl-1">
          Solo visible para agentes &middot; Enter para enviar
        </p>
      </div>
    </div>
  );
}
