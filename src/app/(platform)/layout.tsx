import { MobileNavigation } from "@/components/mobile-navigation";
import { Sidebar } from "@/components/sidebar";
import { requirePlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = isDatabaseMode() ? await requirePlatformSession() : null;
  return (
    <div className="app-shell">
      <Sidebar tenantName={session?.tenantName} userName={session?.name} role={session?.role} />
      <main id="conteudo-principal" className="main-content" tabIndex={-1}>{children}</main>
      <MobileNavigation />
    </div>
  );
}
