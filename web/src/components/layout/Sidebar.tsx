"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { useAuth } from "@/components/AuthProvider";
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
  LogOut,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

interface SidebarProps {
  showCommunityOs?: boolean;
}

export function Sidebar({ showCommunityOs = false }: SidebarProps) {
  const pathname = usePathname();
  const { data: currentAgent } = useCurrentAgent();
  // El cierre de sesión pasa por AuthProvider: además de `signOut()` limpia la
  // cookie `cm_user_id` del Community Manager legacy y redirige. Llamar sólo a
  // `signOut()` dejaría esa cookie viva y el usuario seguiría autenticado en la
  // mitad legacy de la aplicación.
  const { logout } = useAuth();
  const router = useRouter();

  const agentName = (currentAgent?.name || "").trim();
  const initials = agentName
    ? agentName
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";
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

        {/* Community OS link — gated by flag (prop from Server layout) */}
        {showCommunityOs && (
          <div className={cn("py-2", expanded ? "px-2" : "flex justify-center")}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/es/os"
                    aria-label="Community OS"
                    aria-current={
                      pathname?.startsWith('/es/os') || pathname?.startsWith('/en/os')
                        ? 'page'
                        : undefined
                    }
                    className={cn(
                      "nav-item-community-os relative flex h-10 items-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(70%_0.14_250)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      expanded ? "w-full justify-start gap-3 px-3" : "w-10 justify-center"
                    )}
                  />
                }
              >
                {/* Star icon from mockup */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="icon-lg flex-shrink-0"
                  aria-hidden="true"
                  style={{ color: 'oklch(70% 0.14 250)' }}
                >
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6L12 2z" />
                </svg>
                {expanded && (
                  <>
                    <span className="truncate text-sm font-medium">Community OS</span>
                    <span className="pill-new-cm">NEW</span>
                  </>
                )}
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Community OS
              </TooltipContent>
            </Tooltip>
          </div>
        )}

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

          {/* Menú de usuario.
              Era un <div> sin onClick: se veía como un botón y no hacía nada.
              Ahora es un <button> real, así que entra en el orden de tabulación
              y responde a Enter y Espacio sin manejadores de teclado propios.
              El menú funciona igual con la barra expandida y contraída; sólo
              cambia el ancho y si se muestra la etiqueta. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="sidebar-user-menu"
              aria-label={
                agentName
                  ? `Menú de usuario: ${agentName}`
                  : "Menú de usuario"
              }
              className={cn(
                "flex h-10 items-center rounded-lg text-[#7d8590] transition-colors",
                "hover:text-[#e6edf3] hover:bg-[#21262d]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#388bfd] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1117]",
                expanded ? "w-full justify-start px-3" : "w-10 justify-center"
              )}
            >
              <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                {initials ? (
                  <span className="text-[11px] font-semibold text-[#e6edf3]">{initials}</span>
                ) : (
                  <User className="h-3.5 w-3.5" />
                )}
              </div>
              {expanded && (
                <span className="ml-2 truncate text-sm font-medium">
                  {agentName || "Perfil"}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="right"
              align="end"
              sideOffset={8}
              className="w-52 bg-[#1a1f2e] border-[#2d333b]"
            >
              <DropdownMenuItem
                data-testid="sidebar-view-profile"
                onClick={() => router.push("/settings/profile")}
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-white"
              >
                <User className="h-4 w-4 mr-2" />
                Ver perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#2d333b]" />
              <DropdownMenuItem
                data-testid="sidebar-logout"
                onClick={() => void logout()}
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-white"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
