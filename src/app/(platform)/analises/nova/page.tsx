import { Topbar } from "@/components/topbar";
import { NewAnalysisFlow } from "@/components/new-analysis-flow";
import { getAnalysisDepthById } from "@/domain/analysis-depths";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Receber dados" };

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
      <Topbar eyebrow="FLUXO INTELIGENTE · ETAPA 1" title="Receber dados">
        <span className="draft-indicator">
          A RAIZ organiza e processa depois do envio · {databaseMode ? "PostgreSQL" : "demo"}
        </span>
      </Topbar>
      <div className="content-wrap ux2-intake-page">
        <section className="ux2-intake-intro">
          <div>
            <span className="eyebrow">1 · RECEBER DADOS</span>
            <h2>Envie o que você já tem.</h2>
            <p>O trabalho começa pelos dados, não por um formulário técnico. A RAIZ lê o material, organiza o contexto necessário e conduz o restante do processamento.</p>
          </div>
          <div className="ux2-intake-promise">
            <strong>Você envia</strong><span>→</span><strong>A RAIZ organiza e processa</strong><span>→</span><strong>O agrônomo revisa no final</strong>
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
