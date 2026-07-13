"use client";
import { useRef, useState, useCallback } from "react";
import { Music2, Paperclip, Smile, Sticker } from "lucide-react";
import { uploadChatMedia } from "./uploadChatMedia";

export type AttachmentKind = "image" | "video" | "audio" | "document" | "sticker";

export type ComposerAttachment = {
  kind: AttachmentKind;
  url: string;
  filename: string;
  mimeType: string;
};

type AttachmentBarProps = {
  disabled: boolean;
  onAttachmentSelected: (attachment: ComposerAttachment) => void;
  onError: (message: string) => void;
  emojiPickerOpen: boolean;
  stickerPickerOpen: boolean;
  onToggleEmojiPicker: () => void;
  onToggleStickerPicker: () => void;
  /** Callback invocado antes de abrir/lanzar cualquier acción — para cerrar otros pickers externos (e.g. voice recorder). */
  onBeforeAction?: () => void;
};

export function AttachmentBar({
  disabled,
  onAttachmentSelected,
  onError,
  emojiPickerOpen,
  stickerPickerOpen,
  onToggleEmojiPicker,
  onToggleStickerPicker,
  onBeforeAction,
}: AttachmentBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = useCallback(
    async (file: File | null) => {
      if (!file || disabled || uploading) return;
      setUploading(true);
      try {
        const uploaded = await uploadChatMedia(file);
        onAttachmentSelected(uploaded);
      } catch (error) {
        console.error(error);
        const msg = error instanceof Error ? error.message : "No se pudo subir el archivo.";
        onError(msg);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (audioInputRef.current) audioInputRef.current.value = "";
      }
    },
    [disabled, uploading, onAttachmentSelected, onError]
  );

  const buttonDisabled = disabled || uploading;

  return (
    <>
      <button
        onClick={() => {
          onBeforeAction?.();
          fileInputRef.current?.click();
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#8b949e] hover:text-foreground hover:bg-[var(--surface-interactive)] transition-colors shrink-0 mb-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={buttonDisabled}
        title="Adjuntar archivo"
        type="button"
      >
        <Paperclip className="h-4.5 w-4.5" />
      </button>

      <button
        onClick={() => {
          onBeforeAction?.();
          audioInputRef.current?.click();
        }}
        className="inline-flex min-h-10 items-center gap-1.5 px-3 py-2 rounded-md border border-[#1f6feb]/40 bg-[var(--surface-base)] text-[#7dd3fc] hover:text-white hover:bg-[var(--surface-interactive)] hover:border-primary transition-colors shrink-0 mb-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={buttonDisabled}
        title="Adjuntar audio"
        type="button"
      >
        <Music2 className="h-4.5 w-4.5" />
        <span className="text-xs font-medium">Audio</span>
      </button>

      <button
        onClick={() => {
          onBeforeAction?.();
          onToggleEmojiPicker();
        }}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors shrink-0 mb-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:cursor-not-allowed ${
          emojiPickerOpen ? "text-white bg-[var(--surface-interactive)]" : "text-[#f9c74f] hover:text-white hover:bg-[var(--surface-interactive)]"
        }`}
        disabled={buttonDisabled}
        title="Emojis"
        aria-label="Abrir selector de emojis"
        aria-expanded={emojiPickerOpen}
        type="button"
      >
        <Smile className="h-4.5 w-4.5" aria-hidden="true" />
      </button>

      <button
        onClick={() => {
          onBeforeAction?.();
          onToggleStickerPicker();
        }}
        className={`inline-flex min-h-10 items-center gap-1.5 px-3 py-2 rounded-md border transition-colors shrink-0 mb-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:cursor-not-allowed ${
          stickerPickerOpen
            ? "border-[#8b5cf6] bg-[var(--surface-interactive)] text-white"
            : "border-[#6e56cf]/40 bg-[var(--surface-base)] text-[#a371f7] hover:text-white hover:bg-[var(--surface-interactive)] hover:border-[#8b5cf6]"
        }`}
        disabled={buttonDisabled}
        title="Stickers"
        aria-label="Abrir selector de stickers"
        aria-expanded={stickerPickerOpen}
        type="button"
      >
        <Sticker className="h-4.5 w-4.5" aria-hidden="true" />
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
    </>
  );
}
