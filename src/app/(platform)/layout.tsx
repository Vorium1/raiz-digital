import { MobileNavigation } from "@/components/mobile-navigation";
import { Sidebar } from "@/components/sidebar";
import { requirePlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  if (isDatabaseMode()) await requirePlatformSession();
  return (
    <div className="app-shell">
      <Sidebar />
      <main id="conteudo-principal" className="main-content" tabIndex={-1}>{children}</main>
      <MobileNavigation />
    </div>
  );
}
