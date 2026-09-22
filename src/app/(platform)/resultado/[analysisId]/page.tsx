import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { SimplePublishResultButton } from "@/components/simple-publish-result-button";
import { RealFieldMap } from "@/components/real-field-map";
import { PublishedNdviMap } from "@/components/published-ndvi-map";
import { pointPositionKind } from "@/components/spatial-map-types";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { humanClassification } from "@/domain/simple-ux-labels";
import { recommendationInputLabel } from "@/domain/recommendation-display";
import { summarizeSimpleInterpretation } from "@/domain/simple-interpretation-summary";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPublishedReportSnapshot, type ReportSnapshotV2 } from "@/lib/repositories/reports";
import type { PremiumReportSnapshotV3 } from "@/lib/repositories/premium-report-publication";

export const metadata = { title: "Resultado" };

const TECHNICAL_DETAIL_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

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

function recommendationTotalForArea(
  recommendation: { inputType: string; quantity: number; unit: string },
  areaHa: number,
) {
  const normalizedUnit = recommendation.unit.trim().toLowerCase();
  if (normalizedUnit === "kg/ha") {
    return {
      quantity: recommendation.quantity * areaHa,
      unit: "kg",
      label: recommendationInputLabel(recommendation.inputType),
    };
  }
  if (normalizedUnit === "t/ha" || normalizedUnit === "ton/ha") {
    return {
      quantity: recommendation.quantity * areaHa,
      unit: "t",
      label: recommendation.inputType,
    };
  }
  return null;
}

function isV3(value: unknown): value is PremiumReportSnapshotV3 {
  return Boolean(value && typeof value === "object" && (value as { reportSnapshotVersion?: number }).reportSnapshotVersion === 3);
}

function formatSnapshotDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function isV2(value: unknown): value is ReportSnapshotV2 {
  return Boolean(value && typeof value === "object" && (value as { reportSnapshotVersion?: number }).reportSnapshotVersion === 2);
}

export default async function ResultadoPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const session = await requirePlatformSession();
  const canViewTechnical = TECHNICAL_DETAIL_ROLES.has(session.role);
  const published = await getPublishedReportSnapshot(session.tenantId, analysisId, session.userId);
  if (!published.found) notFound();

  if (published.hashVerified !== true || !published.snapshot) {
    return (
      <div className="simple-result-page">
        <div className="simple-result-back"><Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link></div>
        <section className="simple-result-integrity-error">
          <span><Icon name="warning" size={28}/></span>
          <div><h1>Não foi possível validar este resultado.</h1><p>Por segurança, a RAIZ não mostra uma versão oficial quando não consegue confirmar que o arquivo publicado está íntegro.</p></div>
          {canViewTechnical && <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`}>Ver detalhes técnicos</Link>}
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
          {canViewTechnical && <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`}>Abrir versão técnica publicada</Link>}
        </section>
      </div>
    );
  }

  const structured = (v3?.structuredOutput ?? v2?.structuredOutput ?? {}) as {
    interpretation?: Finding[];
    trace?: {
      cropProfileCode?: string;
      cropProfileVersion?: string;
      generatedAt?: string;
    };
  };
  const findingSummaries = summarizeSimpleInterpretation(structured.interpretation ?? []);
  const prescription = (v3?.approvedPrescription.responsePayload?.prescription ?? null) as Prescription | null;
  const reviewer = v3?.approvedPrescription.reviewedByName ?? published.report.publishedByName ?? null;
  const engineValidated = Boolean(
    v3?.approvedPrescription.provider === "raiz-deterministic-limited"
    && v3?.approvedPrescription.model === "agronomic-engine",
  );
  const validationLabel = engineValidated ? "Motor RAIZ" : reviewer;
  const branding = v3?.brandingSnapshot ?? v2!.brandingSnapshot;
  const publishedBoundary = v3?.publishedContext.fieldBoundary ?? null;
  const ndvi = v3?.ndviSnapshot ?? null;
  const publishedPoints = (v3?.pointsSnapshot ?? []).map((point) => ({
    id: point.id,
    code: point.code,
    sequence: null,
    latitude: point.latitude,
    longitude: point.longitude,
    observedLatitude: point.observedLatitude ?? null,
    observedLongitude: point.observedLongitude ?? null,
    collectedAt: point.collectedAt,
    depthFromCm: point.depthFromCm,
    depthToCm: point.depthToCm,
    subsampleCount: null,
    accuracyM: point.accuracyM ?? null,
    gpsSource: point.gpsSource,
    notes: null,
    labResultCount: 0,
  }));
  const plannedPointCount = publishedPoints.filter((point) => pointPositionKind(point) === "PLANNED").length;

  return (
    <div className="simple-result-page">
      <div className="simple-result-back no-print"><Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link></div>

      <article className="simple-result-document">
        <header className="simple-result-document-head">
          <ReportBrand branding={branding}/>
          <div className="simple-result-published"><Icon name="check" size={15}/><span><strong>Resultado oficial</strong><small>{new Date(published.report.publishedAt).toLocaleDateString("pt-BR")}</small></span></div>
        </header>

        <section className="simple-result-hero">
          <span>RESULTADO AGRONÔMICO</span>
          <h1>{context.fieldName}</h1>
          <p>{context.clientName} · {context.propertyName}</p>
          <div className="simple-result-context">
            <div><small>Área</small><strong>{Number(context.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
            <div><small>Safra</small><strong>{context.seasonLabel}</strong></div>
            <div><small>Cultura</small><strong>{context.currentCrop || context.nextCrop || context.cropProfileName || "Não informada"}</strong></div>
            {publishedPoints.length > 0 && <div><small>Pontos de coleta</small><strong>{publishedPoints.length}</strong></div>}
            {validationLabel && <div><small>Validação</small><strong>{validationLabel}</strong></div>}
          </div>
        </section>

        {Boolean(publishedBoundary) && (
          <section className="simple-result-map">
            <RealFieldMap boundary={publishedBoundary as any} points={publishedPoints} height={310} hint={publishedPoints.length ? `Área e ${publishedPoints.length} ponto(s) de coleta desta decisão` : "Área deste resultado"}/>
            {plannedPointCount > 0 && (
              <div className="simple-result-map-note">
                <Icon name="location" size={14}/>
                <span>{plannedPointCount === publishedPoints.length
                  ? "As posições dos pontos são aproximadas ou não possuem evidência observada congelada neste snapshot."
                  : "Alguns pontos usam posição planejada/estimada ou não possuem evidência observada congelada neste snapshot."}</span>
              </div>
            )}
          </section>
        )}

        {ndvi && (
          <section className="simple-result-section satellite">
            <div className="simple-result-section-head">
              <span>SATÉLITE</span>
              <h2>Vigor da área</h2>
              <p>Leitura NDVI congelada junto com esta decisão. A RAIZ não transforma esse índice em recomendação por si só.</p>
            </div>
            <div className="simple-result-ndvi-grid">
              <div><small>Data da leitura</small><strong>{formatSnapshotDate(ndvi.capturedAt)}</strong></div>
              <div><small>NDVI médio</small><strong>{ndvi.meanNdvi.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div><small>Faixa observada</small><strong>{ndvi.minNdvi.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}–{ndvi.maxNdvi.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div><small>Evidência visual</small><strong>{ndvi.rasterArchived ? "Imagem arquivada" : "Resumo disponível"}</strong></div>
            </div>
            {ndvi.rasterArchived && publishedBoundary && (
              <PublishedNdviMap fieldId={context.fieldId} capturedAt={ndvi.capturedAt} boundary={publishedBoundary as any}/>
            )}
          </section>
        )}

        {findingSummaries.length > 0 && (
          <section className="simple-result-section">
            <div className="simple-result-section-head">
              <span>O QUE ENCONTRAMOS</span>
              <h2>Como está a área</h2>
              <p>Resumo por parâmetro da decisão publicada. Não é interpolação nem mapa de fertilidade.</p>
            </div>
            <div className="simple-result-findings">
              {findingSummaries.map((summary) => {
                const headline = summary.uniformClassification
                  ? humanClassification(summary.uniformClassification)
                  : summary.predominantClassification
                    ? `Predomina ${humanClassification(summary.predominantClassification)}`
                    : "Varia entre os pontos";
                const breakdown = summary.classificationCounts
                  .map((item) => `${item.count} ${humanClassification(item.classification).toLowerCase()}`)
                  .join(" · ");
                return (
                  <div key={summary.parameterCode}>
                    <span>{parameterLabel(summary.parameterCode)}</span>
                    <strong>{headline}</strong>
                    <small>{breakdown}</small>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {prescription ? (
          <section className="simple-result-section recommendation">
            <div className="simple-result-section-head">
              <span>{(prescription.recommendations?.length ?? 0) > 0 ? "O QUE FAZER" : "CONCLUSÃO TÉCNICA"}</span>
              <h2>{(prescription.recommendations?.length ?? 0) > 0 ? (engineValidated ? "Recomendação validada pelo motor RAIZ" : "Recomendação validada") : (engineValidated ? "Conclusão validada pelo motor RAIZ" : "Conclusão técnica validada")}</h2>
              {prescription.summary && <p>{prescription.summary}</p>}
            </div>
            {(prescription.recommendations?.length ?? 0) === 0 && (
              <div className="simple-result-completed-limited">
                <Icon name="check" size={17}/>
                <span>
                  <strong>Relatório concluído com os dados disponíveis</strong>
                  <small>A RAIZ não estimou doses ou manejos que não tinham evidência suficiente. Isso não impede a conclusão deste resultado.</small>
                </span>
              </div>
            )}
            {(prescription.recommendations?.length ?? 0) > 0 && (
              <div className="simple-result-recommendations">
                {prescription.recommendations!.map((item, index) => {
                  const areaTotal = recommendationTotalForArea(item, Number(context.areaHa));
                  return (
                    <article key={`${item.inputType}-${index}`}>
                      <div>
                        <strong>{recommendationInputLabel(item.inputType)}</strong>
                        {item.rationale && <small>{item.rationale}</small>}
                        {areaTotal && (
                          <small>
                            Total para {Number(context.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha:{" "}
                            {areaTotal.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {areaTotal.unit} de {areaTotal.label}
                          </small>
                        )}
                      </div>
                      <b>{item.quantity.toLocaleString("pt-BR")} {item.unit}</b>
                    </article>
                  );
                })}
              </div>
            )}
            {(prescription.managementPractices?.length ?? 0) > 0 && (
              <div className="simple-result-management"><strong>Manejo</strong><ul>{prescription.managementPractices!.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
            )}
            {(prescription.missingInformation?.length ?? 0) > 0 && (
              <div className="simple-result-limitation"><Icon name="shield" size={17}/><span><strong>Critérios preservados pelo motor</strong><small>{prescription.missingInformation!.join(" · ")}</small></span></div>
            )}
          </section>
        ) : (
          <section className="simple-result-legacy-note"><Icon name="shield" size={18}/><span><strong>Recomendação não congelada neste formato antigo.</strong><small>A versão técnica publicada continua disponível sem completar informações com dados atuais.</small></span></section>
        )}

        <details className="simple-result-advanced">
          <summary><Icon name="shield" size={15}/> Como o RAIZ chegou a este resultado</summary>
          <section className="simple-result-section traceability">
            <div className="simple-result-section-head">
              <span>RASTREABILIDADE</span>
              <h2>Base técnica desta decisão</h2>
              <p>A versão oficial guarda a base agronômica e o motor usados neste resultado.</p>
            </div>
            <div className="simple-result-ndvi-grid">
              <div><small>Versão</small><strong>Rev. {v3?.revision ?? published.report.revision}</strong></div>
              <div>
                <small>Base agronômica</small>
                <strong>
                  {structured.trace?.cropProfileCode ?? context.currentCrop ?? context.cropProfileName ?? "Perfil corrente"}
                  {structured.trace?.cropProfileVersion ? ` · v${structured.trace.cropProfileVersion}` : ""}
                </strong>
              </div>
              <div><small>Motor</small><strong>{engineValidated ? "Motor RAIZ" : (v3?.approvedPrescription.model ?? "Motor registrado")}</strong></div>
              <div><small>Versão do motor</small><strong>{v3?.approvedPrescription.promptVersion ?? "Snapshot publicado"}</strong></div>
            </div>
          </section>
        </details>

        <section className="simple-result-signature">
          <ReportSignature branding={branding}/>
        </section>

        <footer className="simple-result-footer">
          <div><span><Icon name="shield" size={16}/> Validado e publicado</span><small>Este conteúdo vem da versão oficial congelada no momento da publicação.</small></div>
          <div className="no-print">
            <PrintButton/>
            {canViewTechnical && (
              <SimplePublishResultButton
                analysisId={analysisId}
                label="Atualizar laudo com dados atuais"
                busyLabel="Atualizando laudo…"
              />
            )}
            {canViewTechnical && <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`} className="simple-result-technical-link">Detalhes técnicos</Link>}
          </div>
        </footer>
      </article>
    </div>
  );
}
