"use client";
import { useState, useMemo } from "react";
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
  PanelLeftOpen,
  LogOut,
  Home,
  Target,
  Sparkles,
  GitBranch,
  FileText,
  Share2,
  Workflow,
  Inbox,
  CheckSquare,
  Map,
  Users2,
  Brain,
  Plug,
  Activity,
  TrendingUp,
  Star,
  DollarSign,
  Building2,
  BookOpen,
  Radio,
  PenTool,
  Wand2,
  CreditCard,
  Tag,
  Reply,
  Lock,
  Key,
  Hash,
  ClipboardList,
  Cpu,
  FlaskConical,
  ServerCog,
} from "lucide-react";
import { BrandSwitcher } from "@/components/brand/BrandSwitcher";
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

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
  accent?: boolean;
};

const CM_SECTIONS: NavSection[] = [
  {
    label: "Bandeja",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Bandeja de Entrada", icon: MessageSquare, badge: true },
      { href: "/broadcasts", label: "Difusiones", icon: Send },
      { href: "/chatbot", label: "Chatbot", icon: Bot },
      { href: "/composer", label: "Composer", icon: PenTool },
      { href: "/whatsapp/templates", label: "Plantillas WA", icon: FileText },
      { href: "/listening", label: "Escucha social", icon: Radio },
    ],
  },
  {
    label: "Datos",
    items: [
      { href: "/contacts", label: "Contactos", icon: Users },
      { href: "/settings/agents", label: "Equipo", icon: UserRoundCog },
      { href: "/settings/tags", label: "Etiquetas", icon: Tag },
      { href: "/settings/contact-fields", label: "Campos custom", icon: ClipboardList },
      { href: "/settings/channels", label: "Lead Ads", icon: Target },
      { href: "/es/os/ads", label: "Meta Ads", icon: Share2 },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { href: "/chatbot/ai", label: "Agentes IA", icon: BrainCircuit },
      { href: "/ai-tools", label: "AI Tools", icon: Wand2 },
      { href: "/analytics", label: "Analytics", icon: TrendingUp },
      { href: "/reports", label: "Reportes", icon: BarChart3 },
      { href: "/reports-cm", label: "Reportes CM", icon: BarChart3 },
    ],
  },
  {
    label: "Ajustes",
    items: [
      { href: "/settings/channels", label: "Canales", icon: Plug },
      { href: "/settings/whatsapp", label: "WhatsApp", icon: MessageSquare },
      { href: "/settings/templates", label: "Templates", icon: FileText },
      { href: "/settings/quick-replies", label: "Respuestas rápidas", icon: Reply },
      { href: "/settings/lifecycle", label: "Lifecycle", icon: Activity },
      { href: "/settings/closing-notes", label: "Notas de cierre", icon: FileText },
      { href: "/settings/teams", label: "Equipos", icon: Users2 },
      { href: "/settings/organization", label: "Organización", icon: Building2 },
      { href: "/settings/billing", label: "Facturación", icon: CreditCard },
      { href: "/settings/api", label: "API Keys", icon: Key },
      { href: "/settings/security", label: "Seguridad", icon: Lock },
    ],
  },
];

// Community OS — 5 grupos matching FounderOS-DEMO (NAV_OPERATE / NAV_AGENTS /
// NAV_INTELLIGENCE / NAV_SYSTEM / NAV_LIBRARY). Los labels y el orden replican
// `F:\Proyectos\FounderOS-DEMO\lib\nav.ts` — Personas queda bajo Variants por
// convención del sidebar upstream, y Goals se mantiene bajo Operate como
// concepto Community-Manager específico.
const OS_OPERATE: NavSection = {
  label: "OS · Operate",
  accent: true,
  items: [
    { href: "/es/os", label: "Home", icon: Home },
    { href: "/es/os/comms", label: "Comms", icon: Inbox },
    { href: "/es/os/funnel", label: "Funnel", icon: GitBranch },
    { href: "/es/os/workflows", label: "Workflows", icon: Workflow },
    { href: "/es/os/social", label: "Social", icon: Share2 },
    { href: "/es/os/content", label: "Content", icon: FileText },
    { href: "/es/os/finances", label: "Finances", icon: DollarSign },
    { href: "/es/os/goals", label: "Goals", icon: Target },
  ],
};

const OS_AGENTS: NavSection = {
  label: "OS · Agents",
  accent: true,
  items: [
    { href: "/es/os/agents", label: "Agents", icon: Bot },
    { href: "/es/os/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/es/os/skills", label: "Skills", icon: Sparkles },
    { href: "/es/os/org", label: "Org Chart", icon: Building2 },
  ],
};

const OS_INTELLIGENCE: NavSection = {
  label: "OS · Intelligence",
  accent: true,
  items: [
    { href: "/es/os/brain", label: "G-Brain", icon: Brain },
    { href: "/es/os/intelligence", label: "Intelligence", icon: Cpu },
  ],
};

const OS_SYSTEM: NavSection = {
  label: "OS · System",
  accent: true,
  items: [
    { href: "/es/os/integrations", label: "Connections", icon: Plug },
    { href: "/es/os/roadmap", label: "Roadmap", icon: Map },
    { href: "/es/os/analytics", label: "Analytics", icon: TrendingUp },
    { href: "/es/os/reference", label: "Reference Model", icon: BookOpen },
    { href: "/es/os/observability", label: "Observability", icon: Activity },
    { href: "/es/os/system", label: "System", icon: ServerCog },
  ],
};

const OS_VARIANTS: NavSection = {
  label: "OS · Variants",
  accent: true,
  items: [
    { href: "/es/os/personas", label: "Personas", icon: Users2 },
    { href: "/es/os/variants", label: "Variants", icon: FlaskConical },
  ],
};

const OS_SECTIONS: NavSection[] = [
  OS_OPERATE,
  OS_AGENTS,
  OS_INTELLIGENCE,
  OS_SYSTEM,
  OS_VARIANTS,
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/settings", label: "Configuración", icon: Settings },
];

interface SidebarProps {
  showCommunityOs?: boolean;
}

export function Sidebar({ showCommunityOs = false }: SidebarProps) {
  const pathname = usePathname();
  const { data: currentAgent } = useCurrentAgent();
  const { logout } = useAuth();
  const router = useRouter();

  const sections = useMemo<NavSection[]>(
    () => (showCommunityOs ? [...CM_SECTIONS, ...OS_SECTIONS] : CM_SECTIONS),
    [showCommunityOs]
  );

  const agentName = (currentAgent?.name || "").trim();
  const initials = agentName
    ? agentName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";
  const isSuperAdmin = currentAgent?.is_super_admin === true;
  const [expanded, setExpanded] = useState(true);

  const isActive = (href: string) => {
    if (href === "/es/os") return pathname === "/es/os" || pathname === "/en/os";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "bg-[var(--surface-base)] flex flex-col h-screen shrink-0 border-r border-border overflow-hidden transition-[width] duration-200",
          expanded ? "w-[240px]" : "w-[56px]"
        )}
      >
        {/* Logo + collapse toggle */}
        <div
          className={cn(
            "flex items-center h-[56px] border-b border-border shrink-0",
            expanded ? "justify-between px-3" : "justify-center"
          )}
        >
          {expanded ? (
            <>
              <Link href="/clients" className="flex min-w-0 items-center gap-2 rounded-lg text-foreground">
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
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden border border-border bg-[var(--surface-interactive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              aria-label="Expandir menú"
            >
              <img src="/community-manager-logo.png" alt="" className="h-full w-full object-cover" />
              <span className="sr-only">Abrir menú</span>
            </button>
          )}
        </div>

        {/* Scrollable nav */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto py-3",
            expanded ? "px-2" : "px-0",
            "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
          )}
        >
          {sections.map((section, sIdx) => (
            <div key={section.label} className={cn(sIdx > 0 && "mt-2.5")}>
              {expanded && (
                <div
                  className={cn(
                    "px-2 mb-1 text-[9.5px] font-semibold uppercase tracking-wider",
                    section.accent
                      ? "text-[oklch(70%_0.14_250)] flex items-center gap-1.5"
                      : "text-muted-foreground/70"
                  )}
                >
                  {section.accent && <Star className="h-3 w-3 fill-current" />}
                  {section.label}
                  {section.accent && (
                    <span className="ml-auto rounded-full bg-[oklch(70%_0.14_250)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[oklch(80%_0.14_250)] leading-none">
                      NEW
                    </span>
                  )}
                </div>
              )}
              <div className={cn("flex flex-col gap-0.5", expanded ? "" : "items-center")}>
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger
                        render={
                          <Link
                            href={item.href}
                            aria-label={item.label}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "relative flex h-[30px] items-center rounded-md text-[13px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                              expanded ? "w-full justify-start gap-2.5 px-2" : "w-9 justify-center",
                              active
                                ? section.accent
                                  ? "bg-[oklch(70%_0.14_250)]/15 text-[oklch(80%_0.14_250)]"
                                  : "bg-[var(--surface-interactive)] text-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-[var(--surface-interactive)]/60"
                            )}
                          />
                        }
                      >
                        {active && (
                          <span
                            className={cn(
                              "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full",
                              section.accent ? "bg-[oklch(70%_0.14_250)]" : "bg-primary"
                            )}
                          />
                        )}
                        <item.icon className="h-[16px] w-[16px] shrink-0" aria-hidden="true" />
                        {expanded && <span className="truncate">{item.label}</span>}
                        {item.badge && (
                          <span
                            className={cn(
                              "absolute h-1.5 w-1.5 rounded-full bg-primary",
                              expanded ? "right-2 top-1/2 -translate-y-1/2" : "right-1 top-1"
                            )}
                          />
                        )}
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: settings, admin, user */}
        <div
          className={cn(
            "flex flex-col py-2 gap-0.5 border-t border-border shrink-0",
            expanded ? "px-2" : "items-center"
          )}
        >
          {expanded && (
            <div className="px-1 pb-1">
              <BrandSwitcher />
            </div>
          )}
          {BOTTOM_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={
                    <Link
                      href={item.href}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-[30px] items-center rounded-md text-[13px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                        expanded ? "w-full justify-start gap-2.5 px-2" : "w-9 justify-center",
                        active
                          ? "bg-[var(--surface-interactive)] text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-[var(--surface-interactive)]/60"
                      )}
                    />
                  }
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  {expanded && <span className="truncate">{item.label}</span>}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {isSuperAdmin && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/admin"
                    className={cn(
                      "flex h-9 items-center rounded-md text-sm transition-colors",
                      expanded ? "w-full justify-start gap-2.5 px-2" : "w-9 justify-center",
                      pathname.startsWith("/admin")
                        ? "bg-red-500/20 text-red-400"
                        : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                    )}
                  />
                }
              >
                <Shield className="h-[18px] w-[18px] shrink-0" />
                {expanded && <span className="truncate">Administración</span>}
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Admin
              </TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="sidebar-user-menu"
              aria-label={agentName ? `Menú de usuario: ${agentName}` : "Menú de usuario"}
              className={cn(
                "flex h-10 items-center rounded-md text-muted-foreground transition-colors mt-1",
                "hover:text-foreground hover:bg-[var(--surface-interactive)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                expanded ? "w-full justify-start px-2" : "w-9 justify-center"
              )}
            >
              <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                {initials ? (
                  <span className="text-[11px] font-semibold text-foreground">{initials}</span>
                ) : (
                  <User className="h-3.5 w-3.5" />
                )}
              </div>
              {expanded && <span className="ml-2 truncate text-sm font-medium">{agentName || "Perfil"}</span>}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-52 bg-[#1a1f2e] border-[#2d333b]">
              <DropdownMenuItem
                data-testid="sidebar-view-profile"
                onClick={() => router.push("/settings/profile")}
                className="text-foreground focus:bg-[var(--surface-interactive)] focus:text-foreground"
              >
                <User className="h-4 w-4 mr-2" />
                Ver perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                data-testid="sidebar-logout"
                onClick={() => void logout()}
                className="text-foreground focus:bg-[var(--surface-interactive)] focus:text-foreground"
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
