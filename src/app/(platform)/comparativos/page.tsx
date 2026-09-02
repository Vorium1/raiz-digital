import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro } from "@/components/ui";
import { ComparisonExplorer } from "@/components/comparison-explorer";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Comparativos" };

export default function ComparativesPage() {
  if (!isDatabaseMode()) {
    return <><Topbar eyebrow="Inteligência · demonstração" title="Comparativos"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo.</span></div><PageIntro title="Comparar talhões, safras, pontos e propriedades" description="Só compara classificações já homologadas — sem inferência."/></div></>;
  }
  return (
    <>
      <Topbar eyebrow="Inteligência" title="Comparativos"/>
      <div className="content-wrap">
        <PageIntro title="Comparar talhões, safras, pontos e propriedades" description="Usa somente classificações já homologadas pelo motor determinístico — sem interpretação inventada para preencher lacuna."/>
        <ComparisonExplorer/>
      </div>
    </>
  );
}
