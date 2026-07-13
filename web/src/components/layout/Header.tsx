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
  online: "bg-[var(--success)]",
  away: "bg-[var(--warning)]",
  offline: "bg-muted-foreground",
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
    router.push("/login");
  }

  return (
    <header className="h-12 border-b border-border bg-[var(--surface-base)] flex items-center justify-between px-4 shrink-0">
      <h1 className="text-sm font-medium text-foreground">{getPageTitle(pathname)}</h1>
      <div className="flex items-center gap-3">
        <button
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--surface-interactive)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Notificaciones"
        >
          <Bell className="icon-md" aria-hidden="true" />
          <span
            className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-primary ring-2 ring-[var(--surface-base)]"
            aria-hidden="true"
          />
        </button>

        {agent && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--surface-interactive)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`Menú de usuario (${agent.name}, estado ${agent.status})`}
            >
              <div className="relative">
                <Avatar className="h-7 w-7 bg-secondary border border-border">
                  <AvatarFallback className="text-[10px] bg-secondary text-foreground">
                    {agent.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-base)] ${statusColors[agent.status]}`}
                  aria-hidden="true"
                />
              </div>
              <span className="text-xs font-medium text-foreground hidden lg:inline">
                {agent.name}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 bg-[var(--surface-interactive)] border-border"
            >
              <DropdownMenuItem
                onClick={() => handleStatusChange("online")}
                className="text-foreground hover:bg-[var(--surface-base)] focus:bg-[var(--surface-base)] focus:text-foreground"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--success)] mr-2" aria-hidden="true" />
                En línea
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange("away")}
                className="text-foreground hover:bg-[var(--surface-base)] focus:bg-[var(--surface-base)] focus:text-foreground"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--warning)] mr-2" aria-hidden="true" />
                Ausente
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange("offline")}
                className="text-foreground hover:bg-[var(--surface-base)] focus:bg-[var(--surface-base)] focus:text-foreground"
              >
                <span className="h-2 w-2 rounded-full bg-muted-foreground mr-2" aria-hidden="true" />
                Desconectado
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-foreground hover:bg-[var(--surface-base)] focus:bg-[var(--surface-base)] focus:text-foreground"
              >
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
