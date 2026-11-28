import { AppShell } from "@/components/AppShell";
import { ElderProvider } from "@/lib/elder";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ElderProvider>
      <AppShell>{children}</AppShell>
    </ElderProvider>
  );
}
