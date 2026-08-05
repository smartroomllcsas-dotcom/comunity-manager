"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Send,
  Bot,
  BrainCircuit,
  BarChart3,
  Settings,
  User,
  Shield,
  UserRoundCog,
  PanelLeftClose,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Bandeja de Entrada", icon: MessageSquare, badge: true },
  { href: "/contacts", label: "Contactos", icon: Users },
  { href: "/settings/agents", label: "Equipo", icon: UserRoundCog },
  { href: "/broadcasts", label: "Difusiones", icon: Send },
  { href: "/chatbot", label: "Chatbot", icon: Bot },
  { href: "/chatbot/ai", label: "Agentes IA", icon: BrainCircuit },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
];

const bottomNav = [
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: currentAgent } = useCurrentAgent();
  const isSuperAdmin = currentAgent?.is_super_admin === true;
  const [expanded, setExpanded] = useState(false);

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "bg-[var(--surface-base)] flex flex-col h-screen shrink-0 border-r border-border overflow-hidden transition-[width] duration-200",
          expanded ? "w-[224px]" : "w-[56px]"
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center h-[56px] border-b border-border",
            expanded ? "justify-between px-3" : "justify-center"
          )}
        >
          {expanded ? (
            <>
              <Link
                href="/clients"
                className="flex min-w-0 items-center gap-2 rounded-lg text-foreground"
              >
                <img
                  src="/community-manager-logo.png"
                  alt="CommunityAgent"
                  className="w-9 h-9 shrink-0 rounded-lg object-cover border border-border bg-[var(--surface-interactive)]"
                />
                <span className="truncate text-sm font-semibold">CommunityAgent</span>
              </Link>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--surface-interactive)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                aria-label="Contraer menú"
              >
                <PanelLeftClose className="icon-md" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden border border-border bg-[var(--surface-interactive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              aria-label="Expandir menú"
            >
              <img
                src="/community-manager-logo.png"
                alt=""
                className="h-full w-full object-cover"
              />
              <span className="sr-only">Abrir menú</span>
            </button>
          )}
        </div>

        {/* Main navigation */}
        <nav
          className={cn(
            "flex-1 flex flex-col py-3 gap-1",
            expanded ? "items-stretch px-2" : "items-center"
          )}
        >
          {mainNav.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={
                    <Link
                      href={item.href}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-10 items-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        expanded ? "w-full justify-start gap-3 px-3" : "w-10 justify-center",
                        isActive
                          ? "bg-[var(--surface-interactive)] text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-[var(--surface-interactive)]/60"
                      )}
                    />
                  }
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                  )}
                  <item.icon className="icon-lg" aria-hidden="true" />
                  {expanded && (
                    <span className="truncate text-sm font-medium">{item.label}</span>
                  )}
                  {item.badge && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
                  )}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom navigation */}
        <div
          className={cn(
            "flex flex-col py-3 gap-1 border-t border-border",
            expanded ? "items-stretch px-2" : "items-center"
          )}
        >
          {bottomNav.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={
                    <Link
                      href={item.href}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-10 items-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        expanded ? "w-full justify-start gap-3 px-3" : "w-10 justify-center",
                        isActive
                          ? "bg-[var(--surface-interactive)] text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-[var(--surface-interactive)]/60"
                      )}
                    />
                  }
                >
                  <item.icon className="icon-lg" aria-hidden="true" />
                  {expanded && (
                    <span className="truncate text-sm font-medium">{item.label}</span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Super Admin link */}
          {isSuperAdmin && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/admin"
                    className={cn(
                      "relative flex h-10 items-center rounded-lg transition-all duration-150",
                      expanded ? "w-full justify-start gap-3 px-3" : "w-10 justify-center",
                      pathname.startsWith("/admin")
                        ? "bg-red-500/20 text-red-400"
                        : "text-[#7d8590] hover:text-red-400 hover:bg-red-500/10"
                    )}
                  />
                }
              >
                <Shield className="h-[20px] w-[20px]" />
                {expanded && <span className="text-sm font-medium">Administración</span>}
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Admin
              </TooltipContent>
            </Tooltip>
          )}

          {/* User avatar */}
          <Tooltip>
            <TooltipTrigger
              render={
                <div
                  className={cn(
                    "flex h-10 items-center rounded-lg cursor-pointer text-[#7d8590] hover:text-[#e6edf3]",
                    expanded ? "w-full justify-start px-3" : "w-10 justify-center"
                  )}
                />
              }
            >
                <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center">
                  <User className="h-3.5 w-3.5" />
                </div>
                {expanded && <span className="ml-2 text-sm font-medium">Perfil</span>}
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Perfil
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
