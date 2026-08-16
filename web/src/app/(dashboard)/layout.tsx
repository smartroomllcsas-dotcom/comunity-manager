import AppShell from "@/components/AppShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { communityOsFlag } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const showCommunityOs = await communityOsFlag();
  console.log('[dashboard.layout] communityOsFlag →', showCommunityOs);
  return (
    <QueryProvider>
      <AppShell showCommunityOs={showCommunityOs}>{children}</AppShell>
    </QueryProvider>
  );
}
