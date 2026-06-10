"use client";

import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/database";
import type { ComponentType } from "react";
import { MessageCircle, Music2, Globe2, Send, MessageSquare } from "lucide-react";

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14 9h2.2V6.5H14V5.2c0-.7.5-1.2 1.2-1.2h1V1.5h-1.5C12.8 1.5 11 3.2 11 5.8V9H9v2.5h2V22h3V11.5h2.1L16.5 9H14Z" />
    </svg>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

type InboxChannelKind = "whatsapp" | "facebook" | "instagram" | "tiktok" | "telegram" | "webchat" | "custom";

const CHANNEL_META: Record<
  InboxChannelKind,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    badgeClass: string;
    iconClass: string;
  }
> = {
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    badgeClass: "bg-[#25D366]/15 text-[#25D366] border-[#25D366]/25",
    iconClass: "text-[#25D366]",
  },
  facebook: {
    label: "Facebook",
    icon: FacebookGlyph,
    badgeClass: "bg-[#1877F2]/15 text-[#58a6ff] border-[#1877F2]/25",
    iconClass: "text-[#58a6ff]",
  },
  instagram: {
    label: "Instagram",
    icon: InstagramGlyph,
    badgeClass: "bg-pink-500/15 text-pink-300 border-pink-500/25",
    iconClass: "text-pink-300",
  },
  tiktok: {
    label: "TikTok",
    icon: Music2,
    badgeClass: "bg-slate-500/15 text-slate-200 border-slate-500/25",
    iconClass: "text-slate-200",
  },
  telegram: {
    label: "Telegram",
    icon: Send,
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/25",
    iconClass: "text-sky-300",
  },
  webchat: {
    label: "Web",
    icon: Globe2,
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
    iconClass: "text-cyan-300",
  },
  custom: {
    label: "Canal",
    icon: MessageSquare,
    badgeClass: "bg-[#484f58]/15 text-[#c9d1d9] border-[#484f58]/25",
    iconClass: "text-[#c9d1d9]",
  },
};

function normalizeChannelKind(raw: string | null | undefined): InboxChannelKind | null {
  if (!raw) return null;
  const value = raw.toLowerCase();

  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("telegram")) return "telegram";
  if (value.includes("web")) return "webchat";

  return "custom";
}

export function getConversationChannelKind(conversation: Conversation): InboxChannelKind {
  const channelType = conversation.channel?.type;
  const metadata = conversation.metadata as Record<string, unknown> | null | undefined;
  const metadataCandidate =
    typeof metadata?.channel === "string"
      ? metadata.channel
      : typeof metadata?.channel_type === "string"
        ? metadata.channel_type
        : typeof metadata?.source === "string"
          ? metadata.source
          : null;

  return (
    normalizeChannelKind(channelType) ||
    normalizeChannelKind(metadataCandidate) ||
    (conversation.channel_id ? "custom" : "whatsapp")
  );
}

export function getConversationChannelMeta(conversation: Conversation) {
  return CHANNEL_META[getConversationChannelKind(conversation)];
}

interface ChannelBadgeProps {
  conversation: Conversation;
  compact?: boolean;
  className?: string;
}

export function ChannelBadge({ conversation, compact = false, className }: ChannelBadgeProps) {
  const meta = getConversationChannelMeta(conversation);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        meta.badgeClass,
        className
      )}
      title={`Canal: ${meta.label}`}
    >
      <Icon className={cn("h-3 w-3 shrink-0", meta.iconClass)} />
      {!compact && <span>{meta.label}</span>}
    </span>
  );
}

interface ChannelAvatarMarkProps {
  conversation: Conversation;
  className?: string;
}

export function ChannelAvatarMark({ conversation, className }: ChannelAvatarMarkProps) {
  const meta = getConversationChannelMeta(conversation);
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border border-[#161b22] flex items-center justify-center bg-[#0d1117]",
        meta.badgeClass,
        className
      )}
      title={`Canal: ${meta.label}`}
    >
      <Icon className={cn("h-2.5 w-2.5 shrink-0", meta.iconClass)} />
    </div>
  );
}
