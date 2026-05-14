"use client";
import { useState } from "react";
import { useContacts } from "@/hooks/useContacts";
import { Input } from "@/components/ui/input";
import { Search, Users } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

const avatarColors = [
  "bg-blue-600", "bg-green-600", "bg-purple-600", "bg-orange-600",
  "bg-pink-600", "bg-cyan-600", "bg-red-600", "bg-yellow-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

const tagColors = [
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-orange-500/20 text-orange-400 border-orange-500/30",
];

export function ContactsTable() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useContacts(search);
  const contacts = data?.contacts;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b949e]" />
        <Input
          placeholder="Buscar por nombre o número..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] focus:border-blue-500 h-9"
        />
      </div>
      <div className="bg-[#161b22] border border-[#2d333b] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2d333b]">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Nombre</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">WhatsApp</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Etiquetas</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Ultimo mensaje</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-[#8b949e]">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span>Cargando...</span>
                  </div>
                </td>
              </tr>
            ) : contacts?.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-[#8b949e]">
                  <div className="flex flex-col items-center gap-3">
                    <Users className="h-10 w-10 text-[#2d333b]" />
                    <span>No hay contactos</span>
                  </div>
                </td>
              </tr>
            ) : (
              contacts?.map((contact) => {
                const displayName = contact.name || "Sin nombre";
                const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <tr key={contact.id} className="border-b border-[#2d333b]/50 hover:bg-[#1a1f2e] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${contact.id}`} className="flex items-center gap-2.5 group">
                        <div className={`h-8 w-8 rounded-full ${getAvatarColor(displayName)} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
                          {initials}
                        </div>
                        <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                          {displayName}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b949e]">{contact.wa_id}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {contact.tags?.map((tag: string, idx: number) => (
                          <span key={tag} className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded border ${tagColors[idx % tagColors.length]}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#8b949e]">
                      {contact.last_message_at ? format(new Date(contact.last_message_at), "dd MMM yyyy", { locale: es }) : "---"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
