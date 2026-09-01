import { Topbar } from "@/components/topbar";
import { NewAnalysisFlow } from "@/components/new-analysis-flow";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Nova análise" };

export default async function NewAnalysisPage({ searchParams }: { searchParams: Promise<{ etapa?: string }> }) {
  const params = await searchParams;
  const initialStep = params.etapa === "laudo" ? 2 : 0;
  const databaseMode = isDatabaseMode();
  return <><Topbar eyebrow="Análises" title="Nova análise"><span className="draft-indicator">Fluxo técnico v0.4 · {databaseMode ? "PostgreSQL" : "demo"}</span></Topbar><div className="content-wrap"><NewAnalysisFlow initialStep={initialStep} databaseMode={databaseMode}/></div></>;
}
