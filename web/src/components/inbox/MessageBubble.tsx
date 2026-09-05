"use client";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/database";
import { Check, CheckCheck, Bot, Image as ImageIcon, FileText, MapPin, Music2, Sticker, FileCheck2, ExternalLink, Download } from "lucide-react";
import { ATTACHMENT_TYPES, extensionFromName, formatBytes } from "@/lib/inbox/attachments";
import { format } from "date-fns";

interface MessageBubbleProps {
  message: Message;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: null,
  sent: <Check className="h-3 w-3 text-[var(--text-tertiary)]" />,
  delivered: <CheckCheck className="h-3 w-3 text-[var(--text-tertiary)]" />,
  read: <CheckCheck className="h-3 w-3 text-[var(--accent-text)]" />,
  failed: <span className="text-red-400 text-[10px] font-medium">Error</span>,
};

function looksLikeAudio(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.includes("audio") ||
    /\.(aac|aif|aiff|amr|m4a|mp3|oga|ogg|opus|wav|weba|webm)(\?|#|$)/.test(normalized)
  );
}


/**
 * URL desde la que el navegador puede pedir el adjunto.
 *
 * **Siempre** el endpoint interno, nunca `content.url` ni `provider_url`: el
 * primero puede ser un media id de WhatsApp y el segundo puede llevar el token
 * del canal en la query. Devuelve null cuando no hay nada que resolver, para
 * poder mostrar «Archivo no disponible» en vez de un enlace roto.
 */
function mediaUrl(
  messageId: string,
  content: { type?: string; storage_path?: string; provider_media_id?: string; provider_url?: string; url?: string },
): string | null {
  const resolvable =
    (content.type && (ATTACHMENT_TYPES as string[]).includes(content.type)) ||
    content.storage_path ||
    content.provider_media_id ||
    content.provider_url ||
    (content.url && /^https?:\/\//i.test(content.url));
  return resolvable ? `/api/inbox/messages/${messageId}/media` : null;
}

function Unavailable({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 p-6 text-[var(--text-tertiary)]">
      {icon}
      <span className="text-xs">{label} no disponible</span>
    </div>
  );
}

/**
 * Abrir y Descargar.
 *
 * Son enlaces `<a>`, no botones con `onClick`: así funcionan con teclado, con
 * clic central y con «abrir en pestaña nueva» sin escribir un solo manejador.
 */
function AttachmentActions({
  url,
  filename,
  className,
}: {
  url: string;
  filename?: string;
  className?: string;
}) {
  const linkClass =
    "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[var(--accent-text)] " +
    "transition-[background-color,color] duration-[var(--duration-fast)] ease-[var(--easing-out)] " +
    "hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] active:scale-[0.98] focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--inbox-canvas)]";

  return (
    <div className={cn("flex items-center gap-1", className)} data-testid="attachment-actions">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        aria-label={filename ? `Abrir ${filename}` : "Abrir archivo"}
      >
        <ExternalLink className="h-3 w-3" />
        Abrir
      </a>
      <a
        href={`${url}?download=1`}
        download={filename || true}
        className={linkClass}
        aria-label={filename ? `Descargar ${filename}` : "Descargar archivo"}
      >
        <Download className="h-3 w-3" />
        Descargar
      </a>
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const isBot = message.is_bot;

  function renderContent() {
    const content = message.content;
    switch (content.type) {
      case "text":
        return <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{content.text}</p>;
      case "image": {
        const media = mediaUrl(message.id, content);
        return (
          <div>
            <div className="rounded-md overflow-hidden bg-[var(--inbox-canvas)] border border-white/[0.06] mb-1">
              {media ? (
                <a href={media} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${content.filename || "imagen"}`}>
                  <img src={media} alt={content.filename || "Imagen"} className="max-w-[240px] max-h-[200px] object-cover" />
                </a>
              ) : (
                <Unavailable label="Imagen" icon={<ImageIcon className="h-5 w-5" />} />
              )}
            </div>
            {media && <AttachmentActions url={media} filename={content.filename} />}
            {content.caption && (
              <p className="text-[13px] leading-relaxed mt-1">{content.caption}</p>
            )}
          </div>
        );
      }
      case "video": {
        const media = mediaUrl(message.id, content);
        return (
          <div>
            <div className="rounded-md overflow-hidden bg-[var(--inbox-canvas)] border border-white/[0.06] mb-1">
              {media ? (
                <video src={media} controls className="max-w-[260px] max-h-[220px] bg-black" />
              ) : (
                <Unavailable label="Video" icon={<ImageIcon className="h-5 w-5" />} />
              )}
            </div>
            {media && <AttachmentActions url={media} filename={content.filename} />}
            {content.caption && (
              <p className="text-[13px] leading-relaxed mt-1">{content.caption}</p>
            )}
          </div>
        );
      }
      case "audio": {
        const media = mediaUrl(message.id, content);
        return (
          <div className="min-w-[220px]">
            <div className="flex items-center gap-2 bg-[var(--inbox-canvas)] border border-white/[0.06] rounded-md px-3 py-2">
              <Music2 className="h-4 w-4 text-[var(--accent-text)] shrink-0" />
              {media ? (
                <audio controls className="w-full h-8">
                  <source src={media} type={content.mime_type || undefined} />
                </audio>
              ) : (
                <span className="text-xs text-[var(--text-secondary)]">Archivo no disponible</span>
              )}
            </div>
            {media && <AttachmentActions url={media} filename={content.filename} />}
            {content.caption && (
              <p className="text-[13px] leading-relaxed mt-1">{content.caption}</p>
            )}
          </div>
        );
      }
      case "document": {
        const media = mediaUrl(message.id, content);
        // Algunos proveedores mandan notas de voz como documento; si el mime o
        // la extensión lo delatan, se reproduce en vez de ofrecer descarga.
        if (looksLikeAudio(content.mime_type) || looksLikeAudio(content.filename) || looksLikeAudio(content.url)) {
          return (
            <div className="min-w-[220px]">
              <div className="flex items-center gap-2 bg-[var(--inbox-canvas)] border border-white/[0.06] rounded-md px-3 py-2">
                <Music2 className="h-4 w-4 text-[var(--accent-text)] shrink-0" />
                {media ? (
                  <audio controls className="w-full h-8">
                    <source src={media} type={content.mime_type || undefined} />
                  </audio>
                ) : (
                  <span className="text-xs text-[var(--text-secondary)]">Archivo no disponible</span>
                )}
              </div>
              {media && <AttachmentActions url={media} filename={content.filename} />}
            </div>
          );
        }

        const size = formatBytes(content.size_bytes);
        const extension = extensionFromName(content.filename)?.toUpperCase();
        const detail = [extension, size].filter(Boolean).join(" · ");

        return (
          <div>
            <div className="bg-[var(--inbox-canvas)] border border-white/[0.06] rounded-md px-3 py-2 min-w-[220px]">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--accent-text)] shrink-0" />
                <div className="min-w-0 flex-1">
                  {/* Nunca sólo «archivo»: `resolveFilename` ya garantiza un
                      nombre con extensión deducida del mime o del tipo. */}
                  <p className="text-xs text-[var(--text-secondary)] truncate" title={content.filename}>
                    {content.filename || "Documento"}
                  </p>
                  {detail && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{detail}</p>}
                </div>
              </div>
              {media ? (
                <AttachmentActions url={media} filename={content.filename} className="mt-2" />
              ) : (
                <p className="mt-2 text-[11px] text-[var(--text-secondary)]">Archivo no disponible</p>
              )}
            </div>
            {content.caption && (
              <p className="text-[13px] leading-relaxed mt-1">{content.caption}</p>
            )}
          </div>
        );
      }
      case "sticker": {
        const media = mediaUrl(message.id, content);
        return media ? (
          <div className="rounded-md overflow-hidden bg-[var(--inbox-canvas)] border border-white/[0.06]">
            <img
              src={media}
              alt="Sticker"
              className="max-w-[180px] max-h-[180px] object-contain bg-transparent"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-[var(--inbox-canvas)] border border-white/[0.06] rounded-md px-3 py-2">
            <Sticker className="icon-md text-[var(--chart-4)]" />
            <span className="text-xs text-[var(--text-secondary)] truncate">Sticker</span>
          </div>
        );
      }
      case "location":
        return (
          <div className="flex items-center gap-2 bg-[var(--inbox-canvas)] border border-white/[0.06] rounded-md px-3 py-2">
            <MapPin className="icon-md text-destructive" />
            <span className="text-xs text-[var(--text-secondary)]">
              {content.name || `${content.latitude}, ${content.longitude}`}
            </span>
          </div>
        );
      case "template":
        return (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 min-w-[220px]">
            <div className="flex items-center gap-2 text-amber-200">
              <FileCheck2 className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold">Plantilla enviada</span>
            </div>
            {content.text ? (
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                {content.text}
              </p>
            ) : (
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-primary)]">
                {content.template_name}
              </p>
            )}
            <p className="mt-0.5 text-[10px] text-amber-100/60">
              {content.text ? `${content.template_name} · ` : ""}Idioma: {content.language}
            </p>
          </div>
        );
      default:
        return (
          <p className="text-[13px] text-[var(--text-secondary)] italic">[{content.type}]</p>
        );
    }
  }

  return (
    <div className={cn("flex mb-1.5", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[65%] rounded-lg px-3 py-2 relative border",
          isOutbound && !isBot && "bg-[var(--bubble-outbound)] border-transparent text-white rounded-br-sm",
          !isOutbound && !isBot && "bg-[var(--bubble-inbound)] border-white/[0.06] text-foreground rounded-bl-sm",
          isBot && "bg-[var(--inbox-raised)] text-foreground border-white/[0.08] rounded-bl-sm"
        )}
      >
        {/* Bot indicator */}
        {isBot && (
          <div className="flex items-center gap-1 mb-1">
            <Bot className="icon-xs text-[var(--chart-4)]" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--chart-4)]">Bot</span>
          </div>
        )}

        {/* Agent name for outbound */}
        {isOutbound && !isBot && message.agent && (
          <p className="text-[10px] font-medium text-white/70 mb-0.5">{message.agent.name}</p>
        )}

        {/* Content */}
        {renderContent()}

        {/* Timestamp + status */}
        <div className={cn(
          "flex items-center gap-1 mt-1",
          isOutbound ? "justify-end" : "justify-start"
        )}>
          <span className={cn(
            "text-[10px] tabular-nums",
            isOutbound && !isBot ? "text-white/50" : "text-[var(--text-tertiary)]"
          )}>
            {format(new Date(message.created_at), "HH:mm")}
          </span>
          {isOutbound && statusIcons[message.status]}
        </div>
      </div>
    </div>
  );
}
