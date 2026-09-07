import AppShell from "@/components/AppShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ActiveBrandProvider } from "@/components/providers/ActiveBrandProvider";
import { Toaster } from "@/components/ui/sonner";
import { communityOsFlag } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const showCommunityOs = await communityOsFlag();
  return (
    <QueryProvider>
      <ActiveBrandProvider>
        <AppShell showCommunityOs={showCommunityOs}>{children}</AppShell>
        {/* Contenedor de avisos (toast). Sin él, ningún toast.success/error del
            panel se mostraba: los errores de envío, guardado, etc. eran invisibles. */}
        <Toaster position="top-right" closeButton />
      </ActiveBrandProvider>
    </QueryProvider>
  );
}
