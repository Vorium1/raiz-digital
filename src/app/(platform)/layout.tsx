import { MobileNavigation } from "@/components/mobile-navigation";
import { Sidebar } from "@/components/sidebar";
import { requirePlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";
import { getDashboardSnapshot } from "@/lib/repositories/dashboard";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = isDatabaseMode() ? await requirePlatformSession() : null;
  const snapshot = session ? await getDashboardSnapshot(session.tenantId, session.userId) : null;
  const pendingAnalyses = snapshot ? snapshot.awaitingReview + snapshot.inconsistent : undefined;
  return (
    <div className="app-shell">
      <Sidebar tenantName={session?.tenantName} userName={session?.name} role={session?.role} pendingAnalyses={pendingAnalyses} />
      <main id="conteudo-principal" className="main-content" tabIndex={-1}>{children}</main>
      <MobileNavigation />
    </div>
  );
}
