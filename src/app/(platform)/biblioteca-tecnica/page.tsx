import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro } from "@/components/ui";
import { TechnicalLibraryManager } from "@/components/technical-library-manager";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { DEFAULT_UNITS } from "@/domain/lab-import";

export const metadata = { title: "Biblioteca Técnica" };

const ALLOWED_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export default async function TechnicalLibraryPage() {
  if (!isDatabaseMode()) {
    return <><Topbar eyebrow="Administração · demonstração" title="Biblioteca Técnica"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo.</span></div><PageIntro title="Culturas, parâmetros e regras homologadas" description="Toda regra usada pelo motor determinístico é rastreável até aqui."/></div></>;
  }
  const session = await requirePlatformSession();
  if (!ALLOWED_ROLES.has(session.role)) {
    return <><Topbar eyebrow="Administração" title="Biblioteca Técnica"/><div className="content-wrap"><div className="data-card"><div className="empty-state"><Icon name="shield"/><strong>Acesso restrito</strong><small>Só administradores e agrônomos podem homologar a base técnica.</small></div></div></div></>;
  }
  return (
    <>
      <Topbar eyebrow="Administração" title="Biblioteca Técnica"/>
      <div className="content-wrap">
        <PageIntro title="Culturas, parâmetros e regras homologadas" description="Toda regra usada pelo motor determinístico é rastreável até aqui. Faixas de suficiência ficam em DRAFT até um agrônomo responsável homologar — nunca entram em uma interpretação real antes disso."/>
        <TechnicalLibraryManager referenceUnits={DEFAULT_UNITS}/>
      </div>
    </>
  );
}
