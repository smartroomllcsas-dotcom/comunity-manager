"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Paperclip, Smile, Sticker, X, Image as ImageIcon, FileText, Music2, Video, Mic, Square, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIAssistPreview, AIAssistButton } from "./AIAssist";
import { useTemplates } from "@/hooks/useTemplates";
import type { Message, MessageTemplate } from "@/types/database";

type AttachmentKind = "image" | "video" | "audio" | "document" | "sticker";

type ComposerAttachment = {
  kind: AttachmentKind;
  url: string;
  filename: string;
  mimeType: string;
};

const EMOJI_PICKER = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎",
  "🤝", "🙏", "👏", "🎉", "💪", "🔥", "💡", "✅",
  "❤️", "💙", "💜", "🫶", "👍", "👀", "🥳", "😅",
];

const STICKER_PICKER = [
  "😺", "🤖", "🌟", "🔥", "💥", "🎉", "❤️", "👍",
];

function emojiToTwemojiUrl(emoji: string) {
  const codePoints = Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-");
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codePoints}.png`;
}

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

type InboxTemplate = MessageTemplate & {
  channel_id?: string | null;
};

function getTemplateBodyPreview(template: InboxTemplate) {
  const components = Array.isArray(template.components) ? template.components : [];
  const body = components.find((component) => {
    if (!component || typeof component !== "object") return false;
    return String((component as { type?: unknown }).type || "").toUpperCase() === "BODY";
  }) as { text?: string } | undefined;

  return body?.text || "Plantilla aprobada de WhatsApp";
}

function templateHasVariables(template: InboxTemplate) {
  return /\{\{\s*\d+\s*\}\}/.test(getTemplateBodyPreview(template));
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
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);

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

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function uploadAttachment(file: File): Promise<ComposerAttachment> {
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

    const data = await res.json() as {
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
  }

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

  async function uploadRecordedAudio(blob: Blob, mimeType: string) {
    const extension = mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("wav")
        ? "wav"
        : mimeType.includes("mp4")
          ? "mp4"
          : "webm";
    const file = new File(
      [blob],
      `voice-${Date.now()}.${extension}`,
      { type: mimeType || "audio/webm" },
    );
    const uploaded = await uploadAttachment(file);
    setAttachment(uploaded);
  }

  async function startVoiceRecording() {
    if (disabled || sending || uploading || recording) return;
    setEmojiPickerOpen(false);
    setStickerPickerOpen(false);
    setRecordingError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Tu navegador no soporta grabación de audio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      setRecordingSeconds(0);
      setRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const chunks = recordingChunksRef.current.slice();
        recordingChunksRef.current = [];
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (!chunks.length) return;
        setUploading(true);
        try {
          const blob = new Blob(chunks, { type: mimeType });
          await uploadRecordedAudio(blob, mimeType);
        } catch (error) {
          console.error(error);
        } finally {
          setUploading(false);
        }
      };

      recorder.start();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (error) {
      console.error(error);
      setRecordingError("No se pudo acceder al micrófono.");
      setRecording(false);
      recordingStreamRef.current = null;
      recorderRef.current = null;
    }
  }

  function stopVoiceRecording() {
    if (!recording) return;
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recorderRef.current?.stop();
  }

  function toggleVoiceRecording() {
    if (recording) {
      stopVoiceRecording();
      return;
    }
    void startVoiceRecording();
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
    const url = emojiToTwemojiUrl(emoji);
    setAttachment({
      kind: "sticker",
      url,
      filename: `sticker-${Array.from(emoji)
        .map((char) => char.codePointAt(0)?.toString(16))
        .filter(Boolean)
        .join("-")}.png`,
      mimeType: "image/png",
    });
    setStickerPickerOpen(false);
    setEmojiPickerOpen(false);
  }

  async function handleFileChange(file: File | null) {
    if (!file || disabled || sending || uploading) return;
    setUploading(true);
    try {
      const uploaded = await uploadAttachment(file);
      setAttachment(uploaded);
    } catch (error) {
      console.error(error);
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
        {requiresTemplate && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                <FileCheck2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-100">Ventana de WhatsApp cerrada</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-100/70">
                  Han pasado mas de 24 horas desde el ultimo mensaje del cliente. Para retomar, envia una plantilla aprobada.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    disabled={sending || templatesLoading || availableTemplates.length === 0}
                    className="min-h-[38px] flex-1 rounded-lg border border-[#2d333b] bg-[#0d1117] px-3 text-sm text-white outline-none focus:border-amber-400/70"
                  >
                    <option value="">
                      {templatesLoading
                        ? "Cargando plantillas..."
                        : availableTemplates.length === 0
                          ? "No hay plantillas aprobadas"
                          : "Selecciona una plantilla"}
                    </option>
                    {availableTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.language}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleSend}
                    disabled={!selectedTemplate || sending || templateHasVariables(selectedTemplate)}
                    className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                    type="button"
                  >
                    <Send className="h-4 w-4" />
                    Enviar plantilla
                  </button>
                </div>
                {selectedTemplate && (
                  <div className="mt-2 rounded-lg border border-[#2d333b] bg-[#0d1117]/80 p-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#8b949e]">Vista previa</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#c9d1d9]">
                      {getTemplateBodyPreview(selectedTemplate)}
                    </p>
                    {templateHasVariables(selectedTemplate) && (
                      <p className="mt-2 text-xs text-red-300">
                        Esta plantilla tiene variables. Primero hay que configurar los campos dinamicos antes de enviarla desde el inbox.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* Attachment button */}
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
                : "border-[#1f6feb]/40 bg-[#0d1117] text-[#7dd3fc] hover:text-white hover:bg-[#1a1f2e] hover:border-[#388bfd]",
            )}
            disabled={composerDisabled}
            title={recording ? "Detener grabación" : "Grabar audio"}
            type="button"
          >
            {recording ? <Square className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
            <span className="text-xs font-medium">{recording ? `Grabando ${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}` : "Grabar"}</span>
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

          {/* Emoji button */}
          {/* AI Assist button */}
          {hasAI && (
            <AIAssistButton onClick={generateSuggestion} disabled={aiLoading} />
          )}

          {/* Text area */}
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

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={requiresTemplate || (!text.trim() && !attachment) || sending || uploading || disabled}
            className="p-2 rounded-lg bg-[#4f46e5] text-white hover:bg-[#6366f1] disabled:opacity-30 disabled:hover:bg-[#4f46e5] transition-colors shrink-0 mb-0.5"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {emojiPickerOpen && (
          <div className="mt-2 grid grid-cols-8 gap-1 rounded-lg border border-[#2d333b] bg-[#0d1117] p-2 max-w-[360px]">
            {EMOJI_PICKER.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="h-8 w-8 rounded-md hover:bg-[#1a1f2e] text-lg flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {stickerPickerOpen && (
          <div className="mt-2 grid grid-cols-4 gap-2 rounded-lg border border-[#2d333b] bg-[#0d1117] p-2 max-w-[360px]">
            {STICKER_PICKER.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => attachSticker(emoji)}
                className="h-16 rounded-md bg-[#161b22] border border-[#2d333b] hover:border-[#388bfd] flex items-center justify-center p-2"
                title="Enviar sticker"
              >
                <img
                  src={emojiToTwemojiUrl(emoji)}
                  alt={`Sticker ${emoji}`}
                  className="h-10 w-10 object-contain"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        {recordingError && (
          <p className="mt-2 text-xs text-red-400 pl-1">{recordingError}</p>
        )}

        {/* Quick reply hint */}
        {!disabled && (
          <p className="text-[10px] text-[#30363d] mt-1.5 pl-1">
            Escribe / para respuestas rapidas &middot; Enter para enviar &middot; Usa Grabar para voz
          </p>
        )}
      </div>
    </div>
  );
}
