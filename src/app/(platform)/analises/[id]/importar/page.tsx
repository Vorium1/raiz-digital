import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { ExistingAnalysisImporter } from "@/components/existing-analysis-importer";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getAnalysisById } from "@/lib/repositories/analyses";

export const metadata = { title: "Importar laudo" };

function hasAgronomicContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const readiness = (value as { readiness?: unknown }).readiness;
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) return false;
  const effectiveLayer = (readiness as { effectiveLayer?: unknown }).effectiveLayer;
  return typeof effectiveLayer === "number" && Number.isFinite(effectiveLayer) && effectiveLayer >= 2;
}

export default async function ExistingAnalysisImportPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseMode()) notFound();

  const { id } = await params;
  const session = await requirePlatformSession();
  const analysis = await getAnalysisById(session.tenantId, id, session.userId);
  if (!analysis) notFound();

  return (
    <>
      <Topbar eyebrow="Análises" title={`Importar laudo · ${analysis.code}`}>
        <Link href={`/analises/${analysis.id}`} className="button secondary"><Icon name="arrow" size={16}/>Voltar à análise</Link>
      </Topbar>
      <div className="content-wrap">
        <ExistingAnalysisImporter
          analysisId={analysis.id}
          analysisCode={analysis.code}
          clientName={analysis.clientName}
          propertyName={analysis.propertyName}
          fieldName={analysis.fieldName}
          seasonLabel={analysis.seasonLabel}
          laboratoryName={analysis.laboratoryName}
          hasAgronomicContext={hasAgronomicContext(analysis.analysisContext)}
        />
      </div>
    </>
  );
}
