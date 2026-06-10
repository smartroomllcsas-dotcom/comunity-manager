"use client";

import type { Channel } from "@/types/database";
import { cn } from "@/lib/utils";
import { MessageCircle, Send, Music2, Globe2, Wifi } from "lucide-react";
import { useInboxStore } from "@/stores/inbox";

function WhatsAppIcon({ className }: { className?: string }) {
  return <MessageCircle className={className} />;
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14 9h2.2V6.5H14V5.2c0-.7.5-1.2 1.2-1.2h1V1.5h-1.5C12.8 1.5 11 3.2 11 5.8V9H9v2.5h2V22h3V11.5h2.1L16.5 9H14Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

function channelMeta(type: string) {
  switch (type) {
    case "whatsapp_business_api":
    case "whatsapp_cloud_api":
      return { label: "WhatsApp", icon: WhatsAppIcon, badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
    case "facebook_messenger":
      return { label: "Facebook", icon: FacebookIcon, badge: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
    case "instagram":
      return { label: "Instagram", icon: InstagramIcon, badge: "bg-pink-500/15 text-pink-300 border-pink-500/30" };
    case "tiktok":
      return { label: "TikTok", icon: Music2, badge: "bg-slate-500/15 text-slate-200 border-slate-500/30" };
    case "telegram":
      return { label: "Telegram", icon: Send, badge: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
    default:
      return { label: "Canal", icon: Globe2, badge: "bg-[#484f58]/15 text-[#c9d1d9] border-[#484f58]/30" };
  }
}

export function InboxChannelsBar({ channels }: { channels: Channel[] }) {
  const activeChannels = channels.filter((channel) => channel.status === "active");
  const channelFilter = useInboxStore((s) => s.channelFilter);
  const setChannelFilter = useInboxStore((s) => s.setChannelFilter);

  const filterOptions = [
    { value: "all", label: "Todos" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "facebook", label: "Facebook" },
    { value: "instagram", label: "Instagram" },
    { value: "tiktok", label: "TikTok" },
    { value: "telegram", label: "Telegram" },
    { value: "webchat", label: "Web" },
  ] as const;

  return (
    <div className="border-b border-[#2d333b] bg-[#0d1117]">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Canales conectados</h3>
            <p className="text-xs text-[#8b949e]">
              Gestiona conversaciones de WhatsApp, Facebook, Instagram y futuros canales desde un solo lugar.
            </p>
          </div>
          <span className="text-[11px] px-2 py-1 rounded-full border border-[#2d333b] bg-[#161b22] text-[#8b949e]">
            {activeChannels.length} activos
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {activeChannels.length > 0 ? (
            activeChannels.map((channel) => {
              const meta = channelMeta(channel.type);
              const Icon = meta.icon;
              return (
                <div
                  key={channel.id}
                  className="flex items-center gap-3 rounded-lg border border-[#2d333b] bg-[#161b22] px-3 py-2.5"
                >
                  <div className={cn("h-9 w-9 rounded-full border flex items-center justify-center", meta.badge)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{channel.name}</p>
                    <p className="text-[11px] text-[#8b949e] truncate">{meta.label}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full rounded-lg border border-dashed border-[#2d333b] bg-[#161b22] px-4 py-6 text-center">
              <p className="text-sm text-white">No hay canales activos conectados</p>
              <p className="text-xs text-[#8b949e] mt-1">
                Cuando conectes WhatsApp, Facebook o Instagram, aparecerán aquí automáticamente.
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setChannelFilter(option.value)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                channelFilter === option.value
                  ? "bg-[#388bfd]/15 text-[#58a6ff] border-[#388bfd]/30"
                  : "bg-[#161b22] text-[#8b949e] border-[#2d333b] hover:text-white hover:border-[#3d444d]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
