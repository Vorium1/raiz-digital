import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { SimpleExistingAnalysisUpload } from "@/components/simple-existing-analysis-upload";
import { requirePlatformSession } from "@/lib/auth/session";
import { getAnalysisById } from "@/lib/repositories/analyses";

export const metadata = { title: "Enviar dados" };

export default async function ExistingAnalysisUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePlatformSession();
  const analysis = await getAnalysisById(session.tenantId, id, session.userId);
  if (!analysis) notFound();

  const analysisContext = ((analysis as any).analysisContext ?? {}) as { readiness?: { effectiveLayer?: number } };
  const hasAgronomicContext = Number(analysisContext.readiness?.effectiveLayer ?? 0) >= 2;

  return (
    <div className="simple-send-page">
      <div className="simple-send-back"><Link href={`/analise/${id}`}><Icon name="arrow" size={15}/> {(analysis as any).fieldName}</Link></div>
      <header className="simple-send-page-head">
        <span>ENVIAR DADOS</span>
        <h1>Envie o laudo desta área.</h1>
        <p>{(analysis as any).fieldName} · {(analysis as any).propertyName} · Safra {(analysis as any).seasonLabel}</p>
      </header>
      <SimpleExistingAnalysisUpload analysisId={id} hasAgronomicContext={hasAgronomicContext}/>
    </div>
  );
}
