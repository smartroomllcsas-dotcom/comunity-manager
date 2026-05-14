"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { QueryProvider } from "@/components/providers/QueryProvider";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Receipt,
  PackageOpen,
  Server,
  Shield,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const adminNav = [
  { href: "/admin", label: "Panel", icon: LayoutDashboard },
  { href: "/admin/organizations", label: "Organizaciones", icon: Building2 },
  { href: "/admin/subscriptions", label: "Suscripciones", icon: CreditCard },
  { href: "/admin/payments", label: "Pagos", icon: Receipt },
  { href: "/admin/plans", label: "Planes", icon: PackageOpen },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/st/login");
        return;
      }
      const { data: agent } = await supabase
        .from("agents")
        .select("is_super_admin")
        .eq("id", user.id)
        .single();
      if (!agent?.is_super_admin) {
        router.replace("/dashboard");
        return;
      }
      setAuthorized(true);
      setLoading(false);
    }
    checkAdmin();
  }, [router]);

  if (loading || !authorized) {
    return (
      <div className="min-h-screen bg-[#080b12] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Verificando permisos...</span>
        </div>
      </div>
    );
  }

  return (
    <QueryProvider>
      <div className="flex h-screen overflow-hidden bg-[#080b12]">
        {/* Admin Sidebar */}
        <TooltipProvider>
          <aside className="w-[56px] bg-[#0a0d14] flex flex-col h-screen shrink-0 border-r border-[#1e2433]">
            {/* Logo */}
            <div className="flex items-center justify-center h-[56px] border-b border-[#1e2433]">
              <Link href="/admin" className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-600 text-white">
                <Shield className="h-5 w-5" />
              </Link>
            </div>

            {/* Nav */}
            <nav className="flex-1 flex flex-col items-center py-3 gap-1">
              {adminNav.map((item) => {
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger
                      render={
                        <Link
                          href={item.href}
                          className={cn(
                            "relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150",
                            isActive
                              ? "bg-[#1a1f2e] text-red-400"
                              : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#1a1f2e]/60"
                          )}
                        />
                      }
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-red-500 rounded-r-full" />
                      )}
                      <item.icon className="h-[20px] w-[20px]" />
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>

            {/* Back to app */}
            <div className="flex flex-col items-center py-3 gap-1 border-t border-[#1e2433]">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href="/dashboard"
                      className="flex items-center justify-center w-10 h-10 rounded-lg text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#1a1f2e]/60 transition-all"
                    />
                  }
                >
                  <Server className="h-[20px] w-[20px]" />
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Volver a la App
                </TooltipContent>
              </Tooltip>
            </div>
          </aside>
        </TooltipProvider>

        {/* Main content */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="h-[56px] border-b border-[#1e2433] bg-[#0a0d14] flex items-center px-6">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-400" />
              <span className="text-sm font-semibold text-red-400">Super Admin</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-[#080b12]">{children}</main>
        </div>
      </div>
    </QueryProvider>
  );
}
