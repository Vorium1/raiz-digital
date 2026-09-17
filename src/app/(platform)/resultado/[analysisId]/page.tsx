import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { RealFieldMap } from "@/components/real-field-map";
import { ReportBrand } from "@/components/report-brand";
import { humanClassification } from "@/domain/simple-ux-labels";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPublishedReportSnapshot, type ReportSnapshotV2 } from "@/lib/repositories/reports";
import type { PremiumReportSnapshotV3 } from "@/lib/repositories/premium-report-publication";

export const metadata = { title: "Resultado" };

type Finding = {
  sampleCode?: string;
  parameterCode?: string;
  interpretable?: boolean;
  classification?: string;
  classificationRole?: "TARGET" | "AUXILIARY";
};

type Prescription = {
  summary?: string;
  diagnosis?: Array<{ parameterCode?: string; interpretation?: string }>;
  recommendations?: Array<{ inputType: string; quantity: number; unit: string; rationale?: string }>;
  managementPractices?: string[];
  missingInformation?: string[];
};

const PARAMETER_LABEL: Record<string, string> = {
  PH: "pH",
  P: "Fósforo",
  K: "Potássio",
  CA: "Cálcio",
  MG: "Magnésio",
  AL: "Alumínio",
  H_AL: "Acidez potencial",
  V: "Saturação por bases",
  MO: "Matéria orgânica",
  S: "Enxofre",
  B: "Boro",
  ZN: "Zinco",
  CU: "Cobre",
  MN: "Manganês",
  FE: "Ferro",
};

function parameterLabel(code: string | undefined) {
  if (!code) return "Parâmetro";
  return PARAMETER_LABEL[code.toUpperCase()] ?? code;
}

function isV3(value: unknown): value is PremiumReportSnapshotV3 {
  return Boolean(value && typeof value === "object" && (value as { reportSnapshotVersion?: number }).reportSnapshotVersion === 3);
}

function isV2(value: unknown): value is ReportSnapshotV2 {
  return Boolean(value && typeof value === "object" && (value as { reportSnapshotVersion?: number }).reportSnapshotVersion === 2);
}

export default async function ResultadoPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const session = await requirePlatformSession();
  const published = await getPublishedReportSnapshot(session.tenantId, analysisId, session.userId);
  if (!published.found) notFound();

  if (published.hashVerified !== true || !published.snapshot) {
    return (
      <div className="simple-result-page">
        <div className="simple-result-back"><Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link></div>
        <section className="simple-result-integrity-error">
          <span><Icon name="warning" size={28}/></span>
          <div><h1>Não foi possível validar este resultado.</h1><p>Por segurança, a RAIZ não mostra uma versão oficial quando não consegue confirmar que o arquivo publicado está íntegro.</p></div>
          <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`}>Ver detalhes técnicos</Link>
        </section>
      </div>
    );
  }

  const snapshot: unknown = published.snapshot;
  const v3 = isV3(snapshot) ? snapshot : null;
  const v2 = isV2(snapshot) ? snapshot : null;
  const context = v3?.publishedContext ?? v2?.publishedContext ?? null;

  if (!context) {
    return (
      <div className="simple-result-page">
        <div className="simple-result-back"><Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link></div>
        <section className="simple-result-integrity-error legacy">
          <span><Icon name="file" size={28}/></span>
          <div><h1>Resultado de uma versão anterior.</h1><p>Este documento foi publicado antes do formato atual e não contém contexto suficiente para montar a visualização simples sem misturar dados novos.</p></div>
          <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`}>Abrir versão técnica publicada</Link>
        </section>
      </div>
    );
  }

  const structured = (v3?.structuredOutput ?? v2?.structuredOutput ?? {}) as { interpretation?: Finding[] };
  const findings = (structured.interpretation ?? [])
    .filter((item) => item.classificationRole !== "AUXILIARY" && item.interpretable && item.classification)
    .slice(0, 8);
  const prescription = (v3?.approvedPrescription.responsePayload?.prescription ?? null) as Prescription | null;
  const reviewer = v3?.approvedPrescription.reviewedByName ?? published.report.publishedByName ?? null;
  const publishedBoundary = v3?.publishedContext.fieldBoundary ?? null;

  return (
    <div className="simple-result-page">
      <div className="simple-result-back no-print"><Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link></div>

      <article className="simple-result-document">
        <header className="simple-result-document-head">
          <ReportBrand branding={v3?.brandingSnapshot ?? v2!.brandingSnapshot}/>
          <div className="simple-result-published"><Icon name="check" size={15}/><span><strong>Resultado oficial</strong><small>{new Date(published.report.publishedAt).toLocaleDateString("pt-BR")}</small></span></div>
        </header>

        <section className="simple-result-hero">
          <span>RESULTADO AGRONÔMICO</span>
          <h1>{context.fieldName}</h1>
          <p>{context.clientName} · {context.propertyName}</p>
          <div className="simple-result-context">
            <div><small>Área</small><strong>{Number(context.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
            <div><small>Safra</small><strong>{context.seasonLabel}</strong></div>
            <div><small>Cultura</small><strong>{context.currentCrop || "Não informada"}</strong></div>
            {reviewer && <div><small>Responsável pela revisão</small><strong>{reviewer}</strong></div>}
          </div>
        </section>

        {Boolean(publishedBoundary) && (
          <section className="simple-result-map">
            <RealFieldMap boundary={publishedBoundary as any} points={[]} height={310} hint="Área deste resultado"/>
          </section>
        )}

        {findings.length > 0 && (
          <section className="simple-result-section">
            <div className="simple-result-section-head"><span>O QUE ENCONTRAMOS</span><h2>Principais resultados</h2></div>
            <div className="simple-result-findings">
              {findings.map((item, index) => (
                <div key={`${item.sampleCode ?? "amostra"}-${item.parameterCode ?? index}-${index}`}>
                  <span>{parameterLabel(item.parameterCode)}</span>
                  <strong>{humanClassification(item.classification)}</strong>
                  {item.sampleCode && <small>Amostra {item.sampleCode}</small>}
                </div>
              ))}
            </div>
          </section>
        )}

        {prescription ? (
          <section className="simple-result-section recommendation">
            <div className="simple-result-section-head">
              <span>{(prescription.recommendations?.length ?? 0) > 0 ? "O QUE FAZER" : "CONCLUSÃO TÉCNICA"}</span>
              <h2>{(prescription.recommendations?.length ?? 0) > 0 ? "Recomendação aprovada" : "Conclusão técnica aprovada"}</h2>
              {prescription.summary && <p>{prescription.summary}</p>}
            </div>
            {(prescription.recommendations?.length ?? 0) > 0 && (
              <div className="simple-result-recommendations">
                {prescription.recommendations!.map((item, index) => (
                  <article key={`${item.inputType}-${index}`}>
                    <div><strong>{item.inputType}</strong>{item.rationale && <small>{item.rationale}</small>}</div>
                    <b>{item.quantity.toLocaleString("pt-BR")} {item.unit}</b>
                  </article>
                ))}
              </div>
            )}
            {(prescription.managementPractices?.length ?? 0) > 0 && (
              <div className="simple-result-management"><strong>Manejo</strong><ul>{prescription.managementPractices!.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
            )}
            {(prescription.missingInformation?.length ?? 0) > 0 && (
              <div className="simple-result-limitation"><Icon name="warning" size={17}/><span><strong>Limitações registradas na revisão</strong><small>{prescription.missingInformation!.join(" · ")}</small></span></div>
            )}
          </section>
        ) : (
          <section className="simple-result-legacy-note"><Icon name="shield" size={18}/><span><strong>Recomendação não congelada neste formato antigo.</strong><small>A versão técnica publicada continua disponível sem completar informações com dados atuais.</small></span></section>
        )}

        <footer className="simple-result-footer">
          <div><span><Icon name="shield" size={16}/> Revisado e publicado</span><small>Este conteúdo vem da versão oficial congelada no momento da publicação.</small></div>
          <div className="no-print"><PrintButton/><Link href={`/relatorios/talhao/${analysisId}?versao=publicada`} className="simple-result-technical-link">Detalhes técnicos</Link></div>
        </footer>
      </article>
    </div>
  );
}
