"use client";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusColors = {
  online: "bg-[#3fb950]",
  away: "bg-[#d29922]",
  offline: "bg-[#7d8590]",
};

const pageTitles: Record<string, string> = {
  "/dashboard": "Panel",
  "/inbox": "Bandeja de Entrada",
  "/contacts": "Contactos",
  "/broadcasts": "Difusiones",
  "/chatbot": "Chatbot",
  "/settings": "Configuración",
};

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(path)) return title;
  }
  return "Panel";
}

export function Header() {
  const { data: agent } = useCurrentAgent();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  async function handleStatusChange(status: "online" | "away" | "offline") {
    if (!agent) return;
    await supabase.from("agents").update({ status }).eq("id", agent.id);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/st/login");
  }

  return (
    <header className="h-12 border-b border-[#2d333b] bg-[#0d1117] flex items-center justify-between px-4 shrink-0">
      <h2 className="text-sm font-medium text-[#e6edf3]">
        {getPageTitle(pathname)}
      </h2>
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative flex items-center justify-center w-8 h-8 rounded-lg text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#1a1f2e] transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />
        </button>

        {/* User dropdown */}
        {agent && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 outline-none rounded-lg px-2 py-1 hover:bg-[#1a1f2e] transition-colors">
              <div className="relative">
                <Avatar className="h-7 w-7 bg-[#1e2433] border border-[#2d333b]">
                  <AvatarFallback className="text-[10px] bg-[#1e2433] text-[#e6edf3]">
                    {agent.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0d1117] ${statusColors[agent.status]}`}
                />
              </div>
              <span className="text-xs font-medium text-[#e6edf3] hidden lg:inline">
                {agent.name}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-[#1a1f2e] border-[#2d333b]">
              <DropdownMenuItem onClick={() => handleStatusChange("online")} className="text-[#e6edf3] hover:bg-[#0d1117] focus:bg-[#0d1117] focus:text-white">
                <span className="h-2 w-2 rounded-full bg-[#3fb950] mr-2" />
                En línea
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("away")} className="text-[#e6edf3] hover:bg-[#0d1117] focus:bg-[#0d1117] focus:text-white">
                <span className="h-2 w-2 rounded-full bg-[#d29922] mr-2" />
                Ausente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("offline")} className="text-[#e6edf3] hover:bg-[#0d1117] focus:bg-[#0d1117] focus:text-white">
                <span className="h-2 w-2 rounded-full bg-[#7d8590] mr-2" />
                Desconectado
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#2d333b]" />
              <DropdownMenuItem onClick={handleLogout} className="text-[#e6edf3] hover:bg-[#0d1117] focus:bg-[#0d1117] focus:text-white">
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
