import AppShell from "@/components/AppShell";
import { QueryProvider } from "@/components/providers/QueryProvider";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AppShell>{children}</AppShell>
    </QueryProvider>
  );
}
