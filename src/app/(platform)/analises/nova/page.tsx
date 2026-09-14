import { Topbar } from "@/components/topbar";
import { NewAnalysisFlow } from "@/components/new-analysis-flow";
import {
  AnalysisDepthSelector,
  AnalysisDepthSummary,
} from "@/components/analysis-depth-selector";
import { getAnalysisDepthById } from "@/domain/analysis-depths";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Nova análise" };

export default async function NewAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string; nivel?: string }>;
}) {
  const params = await searchParams;
  const initialStep = params.etapa === "laudo" ? 2 : 0;
  const databaseMode = isDatabaseMode();

  // Mantém compatibilidade com atalhos antigos que abrem diretamente a etapa de laudo.
  // Sem atalho, a primeira tela passa a ser a escolha explícita da profundidade desejada.
  const selectedDepth = getAnalysisDepthById(
    params.nivel ?? (params.etapa === "laudo" ? "interpretacao-rapida" : undefined),
  );

  if (!selectedDepth) {
    return (
      <>
        <Topbar eyebrow="Análises" title="Nova análise">
          <span className="draft-indicator">
            Profundidade do diagnóstico · {databaseMode ? "PostgreSQL" : "demo"}
          </span>
        </Topbar>
        <div className="content-wrap">
          <AnalysisDepthSelector />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar eyebrow="Análises" title="Nova análise">
        <span className="draft-indicator">
          {selectedDepth.title} · {databaseMode ? "PostgreSQL" : "demo"}
        </span>
      </Topbar>
      <div className="content-wrap">
        <AnalysisDepthSummary depth={selectedDepth} />
        <NewAnalysisFlow initialStep={initialStep} databaseMode={databaseMode} />
      </div>
    </>
  );
}
