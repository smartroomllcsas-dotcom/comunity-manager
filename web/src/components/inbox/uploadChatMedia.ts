import type { AttachmentKind, ComposerAttachment } from "./AttachmentBar";

/** Sube un File a /api/uploads/chat-media y devuelve el ComposerAttachment resultante. */
export async function uploadChatMedia(file: File): Promise<ComposerAttachment> {
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

  return { kind, url: data.url, filename: data.fileName, mimeType: data.mimeType };
}
