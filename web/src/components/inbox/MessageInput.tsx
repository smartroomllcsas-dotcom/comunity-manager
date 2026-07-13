"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Mic,
  Music2,
  Paperclip,
  Send,
  Smile,
  Square,
  Sticker,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AIAssistButton, AIAssistPreview } from "./AIAssist";
import { EmojiGrid, StickerGrid, emojiToStickerFilename, emojiToTwemojiUrl } from "./EmojiStickerPicker";
import { TemplateBanner, templateHasVariables, type InboxTemplate } from "./TemplateBanner";
import { useVoiceRecorder } from "./useVoiceRecorder";
import { useTemplates } from "@/hooks/useTemplates";
import type { Message } from "@/types/database";

type AttachmentKind = "image" | "video" | "audio" | "document" | "sticker";

type ComposerAttachment = {
  kind: AttachmentKind;
  url: string;
  filename: string;
  mimeType: string;
};

interface MessageInputProps {
  onSend: (payload: {
    text?: string;
    attachment?: ComposerAttachment;
    template?: { name: string; language: string; components?: unknown[] };
  }) => Promise<void>;
  disabled?: boolean;
  conversationId?: string;
  messages?: Message[];
  channelId?: string | null;
  channelType?: string | null;
  whatsappWindowExpired?: boolean;
}

export function MessageInput({
  onSend,
  disabled,
  conversationId,
  messages,
  channelId,
  channelType,
  whatsappWindowExpired,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // AI Assist state
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const { data: templates, isLoading: templatesLoading } = useTemplates();

  const isWhatsApp = !!channelType?.includes("whatsapp");
  const requiresTemplate = Boolean(isWhatsApp && whatsappWindowExpired);
  const availableTemplates = useMemo(() => {
    return ((templates || []) as InboxTemplate[]).filter((template) => {
      return !template.channel_id || !channelId || template.channel_id === channelId;
    });
  }, [channelId, templates]);
  const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId);

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

  const uploadAttachment = useCallback(async (file: File): Promise<ComposerAttachment> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/uploads/chat-media", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo subir el archivo");
    }

    const data = (await res.json()) as {
      url: string;
      fileName: string;
      mimeType: string;
    };

    const kind: AttachmentKind = data.mimeType.startsWith("image/")
      ? "image"
      : data.mimeType.startsWith("video/")
        ? "video"
        : data.mimeType.startsWith("audio/")
          ? "audio"
          : "document";

    return {
      kind,
      url: data.url,
      filename: data.fileName,
      mimeType: data.mimeType,
    };
  }, []);

  const uploadRecordedAudio = useCallback(
    async (blob: Blob, mimeType: string) => {
      const extension = mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("wav")
          ? "wav"
          : mimeType.includes("mp4")
            ? "mp4"
            : "webm";
      const file = new File([blob], `voice-${Date.now()}.${extension}`, {
        type: mimeType || "audio/webm",
      });
      setUploading(true);
      setInputError(null);
      try {
        const uploaded = await uploadAttachment(file);
        setAttachment(uploaded);
      } finally {
        setUploading(false);
      }
    },
    [uploadAttachment]
  );

  const {
    recording,
    seconds: recordingSeconds,
    toggle: toggleVoiceRecording,
  } = useVoiceRecorder({
    disabled: disabled || sending || uploading,
    onStart: () => {
      setEmojiPickerOpen(false);
      setStickerPickerOpen(false);
      setInputError(null);
    },
    onAudioRecorded: uploadRecordedAudio,
    onError: setInputError,
  });

  function handlePaperclipClick() {
    setEmojiPickerOpen(false);
    setStickerPickerOpen(false);
    fileInputRef.current?.click();
  }

  function handleAudioClick() {
    setEmojiPickerOpen(false);
    setStickerPickerOpen(false);
    audioInputRef.current?.click();
  }

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText((prev) => `${prev}${emoji}`);
      return;
    }

    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(next);
    setEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + emoji.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function attachSticker(emoji: string) {
    setAttachment({
      kind: "sticker",
      url: emojiToTwemojiUrl(emoji),
      filename: emojiToStickerFilename(emoji),
      mimeType: "image/png",
    });
    setStickerPickerOpen(false);
    setEmojiPickerOpen(false);
  }

  async function handleFileChange(file: File | null) {
    if (!file || disabled || sending || uploading) return;
    setUploading(true);
    setInputError(null);
    try {
      const uploaded = await uploadAttachment(file);
      setAttachment(uploaded);
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "No se pudo subir el archivo.";
      setInputError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (requiresTemplate) {
      if (!selectedTemplate) return;
      if (templateHasVariables(selectedTemplate)) {
        console.warn("Template requires variables and cannot be sent from the simple picker yet.");
        return;
      }
      setSending(true);
      try {
        await onSend({
          template: {
            name: selectedTemplate.name,
            language: selectedTemplate.language,
            components: [],
          },
        });
        setSelectedTemplateId("");
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
      return;
    }

    if (!trimmed && !attachment) return;
    if (sending || uploading) return;
    setSending(true);
    try {
      await onSend({
        ...(trimmed ? { text: trimmed } : {}),
        ...(attachment ? { attachment } : {}),
      });
      setText("");
      setAttachment(null);
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
  const composerDisabled = disabled || sending || uploading || requiresTemplate;

  return (
    <div className="border-t border-[#2d333b] bg-[#161b22]">
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
        {requiresTemplate && (
          <TemplateBanner
            templates={availableTemplates}
            templatesLoading={templatesLoading}
            selectedTemplateId={selectedTemplateId}
            onSelectedTemplateChange={setSelectedTemplateId}
            onSend={handleSend}
            sending={sending}
          />
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={handlePaperclipClick}
            className="p-2 rounded-md text-[#484f58] hover:text-[#8b949e] hover:bg-[#1a1f2e] transition-colors shrink-0 mb-0.5"
            disabled={composerDisabled}
            title="Adjuntar archivo"
            type="button"
          >
            <Paperclip className="h-4.5 w-4.5" />
          </button>

          <button
            onClick={handleAudioClick}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#1f6feb]/40 bg-[#0d1117] text-[#7dd3fc] hover:text-white hover:bg-[#1a1f2e] hover:border-[#388bfd] transition-colors shrink-0 mb-0.5"
            disabled={composerDisabled}
            title="Adjuntar audio"
            type="button"
          >
            <Music2 className="h-4.5 w-4.5" />
            <span className="text-xs font-medium">Audio</span>
          </button>

          <button
            onClick={toggleVoiceRecording}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-md border transition-colors shrink-0 mb-0.5",
              recording
                ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/15"
                : "border-[#1f6feb]/40 bg-[#0d1117] text-[#7dd3fc] hover:text-white hover:bg-[#1a1f2e] hover:border-[#388bfd]"
            )}
            disabled={composerDisabled}
            title={recording ? "Detener grabación" : "Grabar audio"}
            type="button"
          >
            {recording ? <Square className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
            <span className="text-xs font-medium">
              {recording
                ? `Grabando ${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}`
                : "Grabar"}
            </span>
          </button>

          <button
            onClick={() => {
              setEmojiPickerOpen((open) => !open);
              setStickerPickerOpen(false);
            }}
            className="p-2 rounded-md text-[#f9c74f] hover:text-white hover:bg-[#1a1f2e] transition-colors shrink-0 mb-0.5"
            disabled={composerDisabled}
            title="Emojis"
            type="button"
          >
            <Smile className="h-4.5 w-4.5" />
          </button>

          <button
            onClick={() => {
              setStickerPickerOpen((open) => !open);
              setEmojiPickerOpen(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#6e56cf]/40 bg-[#0d1117] text-[#a371f7] hover:text-white hover:bg-[#1a1f2e] hover:border-[#8b5cf6] transition-colors shrink-0 mb-0.5"
            disabled={composerDisabled}
            title="Stickers"
            type="button"
          >
            <Sticker className="h-4.5 w-4.5" />
            <span className="text-xs font-medium">Stickers</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />

          <input
            ref={audioInputRef}
            type="file"
            className="hidden"
            accept="audio/*"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />

          {hasAI && <AIAssistButton onClick={generateSuggestion} disabled={aiLoading} />}

          <div className="flex-1 relative">
            {attachment && (
              <div className="mb-2 rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {attachment.kind === "image" && <ImageIcon className="h-4 w-4 text-[#58a6ff]" />}
                  {attachment.kind === "video" && <Video className="h-4 w-4 text-[#58a6ff]" />}
                  {attachment.kind === "audio" && <Music2 className="h-4 w-4 text-[#58a6ff]" />}
                  {attachment.kind === "document" && <FileText className="h-4 w-4 text-[#58a6ff]" />}
                  {attachment.kind === "sticker" && <Sticker className="h-4 w-4 text-[#a371f7]" />}
                  <div className="min-w-0">
                    <p className="text-xs text-[#c9d1d9] truncate">{attachment.filename}</p>
                    <p className="text-[10px] text-[#484f58] truncate">{attachment.mimeType}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="p-1 rounded-md text-[#8b949e] hover:text-white hover:bg-[#1a1f2e]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              className="w-full min-h-[36px] max-h-[120px] resize-none rounded-lg bg-[#0d1117] border border-[#2d333b] text-sm text-white placeholder:text-[#484f58] px-3 py-2 focus:outline-none focus:border-[#388bfd] focus:ring-1 focus:ring-[#388bfd]/30 transition-colors scrollbar-thin"
              rows={1}
              disabled={composerDisabled}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={requiresTemplate || (!text.trim() && !attachment) || sending || uploading || disabled}
            className="p-2 rounded-lg bg-[#4f46e5] text-white hover:bg-[#6366f1] disabled:opacity-30 disabled:hover:bg-[#4f46e5] transition-colors shrink-0 mb-0.5"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {emojiPickerOpen && <EmojiGrid onPick={insertEmoji} />}
        {stickerPickerOpen && <StickerGrid onPick={attachSticker} />}

        {inputError && <p className="mt-2 text-xs text-red-400 pl-1">{inputError}</p>}

        {!disabled && (
          <p className="text-[10px] text-[#30363d] mt-1.5 pl-1">
            Escribe / para respuestas rapidas &middot; Enter para enviar &middot; Usa Grabar para voz
          </p>
        )}
      </div>
    </div>
  );
}
