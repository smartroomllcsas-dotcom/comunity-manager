"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import type { Contact, Conversation } from "@/types/database";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Phone, Mail, Tag, MessageSquare, Clock } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const avatarColors = [
  "bg-blue-600", "bg-green-600", "bg-purple-600", "bg-orange-600",
  "bg-pink-600", "bg-cyan-600", "bg-red-600", "bg-yellow-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  open: { label: "Abierta", bg: "bg-green-500/20", text: "text-green-400" },
  resolved: { label: "Resuelta", bg: "bg-blue-500/20", text: "text-blue-400" },
  closed: { label: "Cerrada", bg: "bg-gray-500/20", text: "text-gray-400" },
};

export default function ContactDetailPage() {
  const params = useParams();
  const contactId = params.id as string;
  const supabase = createClient();

  const { data: contact } = useQuery<Contact>({
    queryKey: ["contact", contactId],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", contactId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["contact-conversations", contactId],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations")
        .select("*, assigned_agent:agents(name)").eq("contact_id", contactId).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (!contact) {
    return (
      <div className="min-h-full bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Cargando contacto...</span>
        </div>
      </div>
    );
  }

  const displayName = contact.name || "Sin nombre";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/contacts" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-white">Detalle del contacto</h1>
      </div>

      <div className="p-6 max-w-4xl">
        {/* Contact Header */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5 mb-6">
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-full ${getAvatarColor(displayName)} flex items-center justify-center text-white text-lg font-bold shrink-0`}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white">{displayName}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-[#8b949e]">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {contact.wa_id}
                </span>
                {contact.custom_fields?.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {contact.custom_fields.email}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 mt-2.5 flex-wrap">
                {contact.tags?.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Conversations */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2d333b] flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#8b949e]" />
            <h3 className="text-sm font-semibold text-white">Conversaciones</h3>
            <span className="text-xs text-[#8b949e]">({conversations?.length || 0})</span>
          </div>
          {conversations?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-10 w-10 text-[#2d333b] mb-3" />
              <p className="text-sm text-[#8b949e]">No hay conversaciones</p>
            </div>
          ) : (
            <div className="divide-y divide-[#2d333b]/50">
              {conversations?.map((conv) => {
                const sc = statusConfig[conv.status] || statusConfig.open;
                return (
                  <div key={conv.id} className="px-5 py-3 hover:bg-[#161b22] transition-colors flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{conv.last_message_preview || "Sin mensajes"}</p>
                      <p className="text-xs text-[#8b949e] mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(conv.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${sc.bg} ${sc.text}`}>
                      {sc.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
