import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro, StatusBadge } from "@/components/ui";
import { TechnicalLibraryManager } from "@/components/technical-library-manager";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getCropCatalogHomologationSummary } from "@/lib/repositories/agronomic-profiles";
import { DEFAULT_UNITS } from "@/domain/lab-import";
import { demoLibraryProfiles } from "@/lib/demo-data";

export const metadata = { title: "Biblioteca Técnica" };

const ALLOWED_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export default async function TechnicalLibraryPage() {
  if (!isDatabaseMode()) {
    return <><Topbar eyebrow="Administração · demonstração" title="Biblioteca Técnica"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo — exemplo ilustrativo.</span></div><PageIntro title="Culturas, parâmetros e regras homologadas" description="Toda regra usada pelo motor determinístico é rastreável até aqui. Faixas de suficiência ficam em DRAFT até um agrônomo responsável homologar — nunca entram em uma interpretação real antes disso."/>
      <section className="card">
        <div className="field-ops-section-head compact"><div><span className="eyebrow">CATÁLOGO · EXEMPLO</span><h2>Culturas cadastradas ({demoLibraryProfiles.length})</h2></div></div>
        <div className="report-table-wrap"><table className="report-table">
          <thead><tr><th>Cultura</th><th>Grupo</th><th>Parâmetros</th><th>Status</th></tr></thead>
          <tbody>{demoLibraryProfiles.map((profile) => (
            <tr key={profile.crop}>
              <td>{profile.crop}</td>
              <td>{profile.group === "VERÃO" ? "Verão" : "Inverno"}</td>
              <td>{profile.parameters}</td>
              <td><StatusBadge tone={profile.status === "ACTIVE" ? "success" : "waiting"}>{profile.status === "ACTIVE" ? "Homologada" : "Rascunho"}</StatusBadge></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </div></>;
  }
  const session = await requirePlatformSession();
  if (!ALLOWED_ROLES.has(session.role)) {
    return <><Topbar eyebrow="Administração" title="Biblioteca Técnica"/><div className="content-wrap"><div className="data-card"><div className="empty-state"><Icon name="shield"/><strong>Acesso restrito</strong><small>Só administradores e agrônomos podem homologar a base técnica.</small></div></div></div></>;
  }
  const summary = await getCropCatalogHomologationSummary(session.tenantId, session.userId);
  return (
    <>
      <Topbar eyebrow="Administração" title="Biblioteca Técnica"/>
      <div className="content-wrap">
        {/* Antes o título dizia "regras homologadas" de forma fixa, sem contagem real -- dava a entender
            que o catálogo inteiro já estava homologado (bug real confirmado na auditoria, item I). Agora
            mostra a proporção real ACTIVE/total, calculada agora mesmo. */}
        <PageIntro title="Culturas, parâmetros e regras" description={`${summary.activeCrops} de ${summary.totalCrops} cultura(s) e ${summary.activeParameters} de ${summary.totalParameters} parâmetro(s) já homologados (ACTIVE). O resto fica em DRAFT e nunca entra numa interpretação real até um agrônomo responsável homologar.`}/>
        <TechnicalLibraryManager referenceUnits={DEFAULT_UNITS} canCurate={session.isPlatformCurator}/>
      </div>
    </>
  );
}
