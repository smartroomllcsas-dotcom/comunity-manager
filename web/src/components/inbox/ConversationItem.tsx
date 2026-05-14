"use client";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/database";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { Clock } from "lucide-react";

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

const avatarColors = [
  "bg-blue-600", "bg-emerald-600", "bg-purple-600", "bg-amber-600",
  "bg-rose-600", "bg-cyan-600", "bg-indigo-600", "bg-pink-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
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
  const initials = displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
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
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-semibold",
          getAvatarColor(displayName)
        )}>
          {initials}
        </div>
        {/* Assigned agent mini avatar */}
        {assignedAgent && (
          <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#2d333b] border border-[#161b22] flex items-center justify-center">
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
            {/* WhatsApp icon */}
            <svg className="h-3 w-3 shrink-0 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.96 11.96 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.347 0-4.518-.804-6.238-2.152l-.435-.348-2.934.984.984-2.934-.348-.435A9.955 9.955 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
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
