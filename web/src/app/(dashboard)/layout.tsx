import AppShell from "@/components/AppShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ActiveBrandProvider } from "@/components/providers/ActiveBrandProvider";
import { communityOsFlag } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const showCommunityOs = await communityOsFlag();
  return (
    <QueryProvider>
      <ActiveBrandProvider>
        <AppShell showCommunityOs={showCommunityOs}>{children}</AppShell>
      </ActiveBrandProvider>
    </QueryProvider>
  );
}
