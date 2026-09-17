import { Topbar } from "@/components/topbar";
import { NewAnalysisFlow } from "@/components/new-analysis-flow";
import { getAnalysisDepthById } from "@/domain/analysis-depths";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Enviar dados" };

export default async function NewAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string; nivel?: string }>;
}) {
  const params = await searchParams;
  const databaseMode = isDatabaseMode();

  // UX 2.0: o usuário não precisa escolher uma "profundidade" antes de enviar o material.
  // Começamos pelo nível seguro básico e a própria evidência disponível determina até onde o
  // diagnóstico consegue avançar. Rotas antigas com ?nivel= continuam compatíveis.
  const selectedDepth = getAnalysisDepthById(params.nivel ?? "interpretacao-rapida")
    ?? getAnalysisDepthById("interpretacao-rapida");

  if (!selectedDepth) return null;

  return (
    <>
      <Topbar eyebrow="Fluxo inteligente" title="Enviar dados">
        <span className="draft-indicator">
          A RAIZ conduz as próximas etapas · {databaseMode ? "PostgreSQL" : "demo"}
        </span>
      </Topbar>
      <div className="content-wrap ux2-intake-page">
        <section className="ux2-intake-intro">
          <div>
            <span className="eyebrow">PASSO 1 · ENTRADA</span>
            <h2>Comece pelo que você já tem.</h2>
            <p>Envie o laudo primeiro. Depois a RAIZ organiza o contexto, aponta o que realmente falta, executa a análise suportada e prepara o trabalho para a revisão técnica.</p>
          </div>
          <div className="ux2-intake-promise">
            <strong>Você envia</strong><span>→</span><strong>A RAIZ processa</strong><span>→</span><strong>O agrônomo revisa</strong>
          </div>
        </section>
        <NewAnalysisFlow
          initialStep={0}
          databaseMode={databaseMode}
          analysisDepthId={selectedDepth.id}
        />
      </div>
    </>
  );
}
