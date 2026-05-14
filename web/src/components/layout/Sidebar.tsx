"use client";
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

  return (
    <TooltipProvider>
      <aside className="w-[56px] bg-[#0d1117] flex flex-col h-screen shrink-0 border-r border-[#2d333b]">
        {/* Logo */}
        <div className="flex items-center justify-center h-[56px] border-b border-[#2d333b]">
          <Link href="/inbox" className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#3b82f6] text-white font-bold text-sm">
            W
          </Link>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 flex flex-col items-center py-3 gap-1">
          {mainNav.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={
                    <Link
                      href={item.href}
                      className={cn(
                        "relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150",
                        isActive
                          ? "bg-[#1a1f2e] text-[#3b82f6]"
                          : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#1a1f2e]/60"
                      )}
                    />
                  }
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#3b82f6] rounded-r-full" />
                  )}
                  <item.icon className="h-[20px] w-[20px]" />
                  {item.badge && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#3b82f6]" />
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
        <div className="flex flex-col items-center py-3 gap-1 border-t border-[#2d333b]">
          {bottomNav.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={
                    <Link
                      href={item.href}
                      className={cn(
                        "relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150",
                        isActive
                          ? "bg-[#1a1f2e] text-[#3b82f6]"
                          : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#1a1f2e]/60"
                      )}
                    />
                  }
                >
                  <item.icon className="h-[20px] w-[20px]" />
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
                      "relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150",
                      pathname.startsWith("/admin")
                        ? "bg-red-500/20 text-red-400"
                        : "text-[#7d8590] hover:text-red-400 hover:bg-red-500/10"
                    )}
                  />
                }
              >
                <Shield className="h-[20px] w-[20px]" />
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
                <div className="flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer text-[#7d8590] hover:text-[#e6edf3]" />
              }
            >
              <div className="w-7 h-7 rounded-full bg-[#1e2433] border border-[#2d333b] flex items-center justify-center">
                <User className="h-3.5 w-3.5" />
              </div>
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
