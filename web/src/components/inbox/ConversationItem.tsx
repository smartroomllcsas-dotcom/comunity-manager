"use client";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./ContactAvatar";
import type { Conversation } from "@/types/database";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { Clock } from "lucide-react";
import { ChannelAvatarMark, ChannelBadge } from "./ChannelBadge";

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

function formatTimestamp(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Ayer";
  return format(date, "dd/MM", { locale: es });
}

export function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.wa_id || "Desconocido";
  const assignedAgent = conversation.assigned_agent;
  const isSnoozed = !!conversation.snoozed_until;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors relative group",
        isSelected
          ? "bg-[#1a1f2e] border-l-2 border-l-[#388bfd]"
          : "hover:bg-[#1a1f2e]/50 border-l-2 border-l-transparent"
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <ContactAvatar
          name={displayName}
          photoUrl={contact?.profile_picture_url}
          className="h-10 w-10 rounded-full text-xs"
          initialsClassName="text-[11px]"
        />
        <ChannelAvatarMark conversation={conversation} />
        {/* Assigned agent mini avatar */}
        {assignedAgent && (
          <div className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#2d333b] border border-[#161b22] flex items-center justify-center">
            <span className="text-[7px] font-bold text-[#8b949e]">
              {assignedAgent.name?.[0]?.toUpperCase() || "A"}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              "text-[13px] truncate",
              conversation.unread_count > 0 ? "font-semibold text-white" : "font-medium text-[#c9d1d9]"
            )}>
              {displayName}
            </span>
            <ChannelBadge conversation={conversation} compact />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isSnoozed && (
              <Clock className="h-3 w-3 text-blue-400" />
            )}
            <span className="text-[10px] text-[#484f58] tabular-nums">
              {formatTimestamp(conversation.updated_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-0.5 gap-2">
          <p className={cn(
            "text-xs truncate",
            conversation.unread_count > 0 ? "text-[#8b949e]" : "text-[#484f58]"
          )}>
            {conversation.last_message_preview || "Sin mensajes"}
          </p>
          {conversation.unread_count > 0 && (
            <span className="h-[18px] min-w-[18px] px-1 rounded-full bg-[#388bfd] text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
