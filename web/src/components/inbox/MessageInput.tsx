"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, Smile } from "lucide-react";
import { AIAssistPreview, AIAssistButton } from "./AIAssist";
import type { Message } from "@/types/database";

interface MessageInputProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  conversationId?: string;
  messages?: Message[];
}

export function MessageInput({ onSend, disabled, conversationId, messages }: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // AI Assist state
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, [text]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText("");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const generateSuggestion = useCallback(async () => {
    if (!conversationId || !messages?.length) return;
    setAiLoading(true);
    setAiVisible(true);
    setAiSuggestion(null);

    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messages: messages.slice(-10).map((m) => ({
            direction: m.direction,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error("Failed to generate suggestion");
      const data = await res.json();
      setAiSuggestion(data.suggestion || "No se pudo generar una sugerencia.");
    } catch {
      setAiSuggestion("Error al generar sugerencia. Intenta de nuevo.");
    } finally {
      setAiLoading(false);
    }
  }, [conversationId, messages]);

  function handleUseSuggestion() {
    if (aiSuggestion) {
      setText(aiSuggestion);
      setAiVisible(false);
      setAiSuggestion(null);
      textareaRef.current?.focus();
    }
  }

  function handleCloseAi() {
    setAiVisible(false);
    setAiSuggestion(null);
  }

  const hasAI = !!conversationId && !!messages && messages.length > 0;

  return (
    <div className="border-t border-[#2d333b] bg-[#161b22]">
      {/* AI Assist preview - above the input bar */}
      {aiVisible && (
        <AIAssistPreview
          suggestion={aiSuggestion}
          loading={aiLoading}
          onUse={handleUseSuggestion}
          onRegenerate={generateSuggestion}
          onClose={handleCloseAi}
        />
      )}

      <div className="px-4 py-3">
        <div className="flex items-end gap-2">
          {/* Attachment button */}
          <button
            className="p-2 rounded-md text-[#484f58] hover:text-[#8b949e] hover:bg-[#1a1f2e] transition-colors shrink-0 mb-0.5"
            disabled={disabled}
          >
            <Paperclip className="h-4.5 w-4.5" />
          </button>

          {/* Emoji button */}
          <button
            className="p-2 rounded-md text-[#484f58] hover:text-[#8b949e] hover:bg-[#1a1f2e] transition-colors shrink-0 mb-0.5"
            disabled={disabled}
          >
            <Smile className="h-4.5 w-4.5" />
          </button>

          {/* AI Assist button */}
          {hasAI && (
            <AIAssistButton onClick={generateSuggestion} disabled={aiLoading} />
          )}

          {/* Text area */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              className="w-full min-h-[36px] max-h-[120px] resize-none rounded-lg bg-[#0d1117] border border-[#2d333b] text-sm text-white placeholder:text-[#484f58] px-3 py-2 focus:outline-none focus:border-[#388bfd] focus:ring-1 focus:ring-[#388bfd]/30 transition-colors scrollbar-thin"
              rows={1}
              disabled={disabled || sending}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending || disabled}
            className="p-2 rounded-lg bg-[#4f46e5] text-white hover:bg-[#6366f1] disabled:opacity-30 disabled:hover:bg-[#4f46e5] transition-colors shrink-0 mb-0.5"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Quick reply hint */}
        {!disabled && (
          <p className="text-[10px] text-[#30363d] mt-1.5 pl-1">
            Escribe / para respuestas rapidas &middot; Enter para enviar
          </p>
        )}
      </div>
    </div>
  );
}
