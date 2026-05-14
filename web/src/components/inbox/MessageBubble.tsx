"use client";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/database";
import { Check, CheckCheck, Bot, Image as ImageIcon, FileText, MapPin } from "lucide-react";
import { format } from "date-fns";

interface MessageBubbleProps {
  message: Message;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: null,
  sent: <Check className="h-3 w-3 text-[#484f58]" />,
  delivered: <CheckCheck className="h-3 w-3 text-[#484f58]" />,
  read: <CheckCheck className="h-3 w-3 text-[#58a6ff]" />,
  failed: <span className="text-red-400 text-[10px] font-medium">Error</span>,
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const isBot = message.is_bot;

  function renderContent() {
    const content = message.content;
    switch (content.type) {
      case "text":
        return <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{content.text}</p>;
      case "image":
        return (
          <div>
            <div className="rounded-md overflow-hidden bg-[#0d1117] border border-[#2d333b] mb-1">
              {content.url ? (
                <img src={content.url} alt="Imagen" className="max-w-[240px] max-h-[200px] object-cover" />
              ) : (
                <div className="flex items-center justify-center gap-2 p-6 text-[#484f58]">
                  <ImageIcon className="h-5 w-5" />
                  <span className="text-xs">Imagen</span>
                </div>
              )}
            </div>
            {content.caption && (
              <p className="text-[13px] leading-relaxed mt-1">{content.caption}</p>
            )}
          </div>
        );
      case "document":
        return (
          <div className="flex items-center gap-2 bg-[#0d1117] border border-[#2d333b] rounded-md px-3 py-2">
            <FileText className="h-4 w-4 text-[#58a6ff] shrink-0" />
            <span className="text-xs text-[#c9d1d9] truncate">{content.filename}</span>
          </div>
        );
      case "location":
        return (
          <div className="flex items-center gap-2 bg-[#0d1117] border border-[#2d333b] rounded-md px-3 py-2">
            <MapPin className="h-4 w-4 text-[#f97583] shrink-0" />
            <span className="text-xs text-[#c9d1d9]">
              {content.name || `${content.latitude}, ${content.longitude}`}
            </span>
          </div>
        );
      default:
        return (
          <p className="text-[13px] text-[#8b949e] italic">[{content.type}]</p>
        );
    }
  }

  return (
    <div className={cn("flex mb-1.5", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[65%] rounded-xl px-3 py-2 relative",
          isOutbound && !isBot && "bg-[#4f46e5] text-white rounded-br-sm",
          !isOutbound && !isBot && "bg-[#2d333b] text-[#e6edf3] rounded-bl-sm",
          isBot && "bg-[#1a1f2e] text-[#e6edf3] border border-[#2d333b] rounded-bl-sm"
        )}
      >
        {/* Bot indicator */}
        {isBot && (
          <div className="flex items-center gap-1 mb-1">
            <Bot className="h-3 w-3 text-[#a371f7]" />
            <span className="text-[10px] font-medium text-[#a371f7]">Bot</span>
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
            "text-[10px]",
            isOutbound && !isBot ? "text-white/50" : "text-[#484f58]"
          )}>
            {format(new Date(message.created_at), "HH:mm")}
          </span>
          {isOutbound && statusIcons[message.status]}
        </div>
      </div>
    </div>
  );
}
