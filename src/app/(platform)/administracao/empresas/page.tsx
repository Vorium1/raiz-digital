import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { PageIntro } from "@/components/ui";
import { PlatformTenantManager } from "@/components/platform-tenant-manager";
import { requirePlatformSession } from "@/lib/auth/session";
import { listPlatformTenants } from "@/lib/repositories/platform-admin";

export const metadata = { title: "Administração da plataforma" };

export default async function PlatformCompaniesPage() {
  const session = await requirePlatformSession();
  if (!session.isPlatformAdmin) notFound();
  const tenants = await listPlatformTenants();

  return (
    <>
      <Topbar eyebrow="RAIZ Digital" title="Administração da plataforma"/>
      <div className="content-wrap">
        <PageIntro
          title="Empresas e acessos"
          description="Administração global da RAIZ. Esta área gerencia tenants e administradores, sem abrir silenciosamente os dados operacionais de cada empresa."
        />
        <PlatformTenantManager initialTenants={tenants}/>
      </div>
    </>
  );
}
