import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { SimplePublishResultButton } from "@/components/simple-publish-result-button";
import { RealFieldMap } from "@/components/real-field-map";
import { PublishedNdviMap } from "@/components/published-ndvi-map";
import { PublishedParameterDashboard } from "@/components/published-parameter-dashboard";
import { PublishedRecommendationDashboard } from "@/components/published-recommendation-dashboard";
import { pointPositionKind } from "@/components/spatial-map-types";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { buildProducerResultSummary } from "@/domain/producer-result-summary";
import { buildProducerCommercialPlanSummary } from "@/domain/official-commercial-plan";
import { buildPublishedParameterDashboard } from "@/domain/published-result-dashboard";
import { buildPublishedRecommendationDashboard } from "@/domain/published-recommendation-dashboard";
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


function isV3(value: unknown): value is PremiumReportSnapshotV3 {
  return Boolean(value && typeof value === "object" && (value as { reportSnapshotVersion?: number }).reportSnapshotVersion === 3);
}

function formatSnapshotDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function producerFacingText(value: string) {
  return value
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/:\s*[.;]/g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
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
    facts?: Array<{
      sampleCode: string;
      parameterCode: string;
      value: number;
      unit: string;
      method?: string | null;
      source?: string | null;
    }>;
    interpretation?: Finding[];
    trace?: {
      cropProfileCode?: string;
      cropProfileVersion?: string;
      generatedAt?: string;
    };
  };
  const parameterDashboardRows = buildPublishedParameterDashboard({
    facts: structured.facts ?? [],
    interpretation: structured.interpretation ?? [],
  });
  const prescription = (v3?.approvedPrescription.responsePayload?.prescription ?? null) as Prescription | null;
  const recommendationGroups = prescription
    ? buildPublishedRecommendationDashboard({
        recommendations: prescription.recommendations ?? [],
        areaHa: Number(context.areaHa),
      })
    : [];
  const technicalOpinion = producerFacingText(prescription?.summary?.trim() || "") || null;
  const producerSummary = prescription
    ? buildProducerResultSummary({
        areaHa: Number(context.areaHa),
        recommendations: prescription.recommendations ?? [],
      })
    : null;
  const commercialSummary = v3?.commercialPlanSnapshot
    ? buildProducerCommercialPlanSummary(v3.commercialPlanSnapshot)
    : null;
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
  const laboratoryMethodCount = new Set(parameterDashboardRows.flatMap((row) => row.methods)).size;
  const officialRevision = v3?.revision ?? published.report.revision;
  const approvedActionCount = producerSummary?.rows.length ?? 0;

  return (
    <div className="simple-result-page">
      <div className="simple-result-back no-print"><Link href="/resultados"><Icon name="arrow" size={15}/> Resultados</Link></div>

      <article className="simple-result-document">
        <section className="report-v4-sheet report-v4-sheet-one" data-report-page="1">
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
            <RealFieldMap boundary={publishedBoundary as any} points={publishedPoints} height={220} hint={publishedPoints.length ? `Área e ${publishedPoints.length} ponto(s) de coleta desta decisão` : "Área deste resultado"}/>
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

        {parameterDashboardRows.length > 0 && (
          <section className="simple-result-section report-v4-diagnosis">
            <div className="simple-result-section-head">
              <span>DIAGNÓSTICO DO SOLO</span>
              <h2>O que a análise mostrou</h2>
              <p>Valores laboratoriais e interpretação por parâmetro. Cada card usa somente evidência congelada nesta versão oficial.</p>
            </div>
            <PublishedParameterDashboard rows={parameterDashboardRows}/>
          </section>
        )}

        </section>

        <section className="report-v4-sheet report-v4-sheet-two" data-report-page="2">
        {prescription ? (
          <section className="simple-result-section recommendation">
            <div className="simple-result-section-head">
              <span>{(prescription.recommendations?.length ?? 0) > 0 ? "O QUE FAZER" : "CONCLUSÃO TÉCNICA"}</span>
              <h2>{(prescription.recommendations?.length ?? 0) > 0 ? (engineValidated ? "Recomendação validada pelo motor RAIZ" : "Recomendação validada") : (engineValidated ? "Conclusão validada pelo motor RAIZ" : "Conclusão técnica validada")}</h2>
              <p>Doses e manejos abaixo são somente os que foram aprovados e congelados nesta decisão.</p>
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
              <>
                <div className="report-v4-action-summary">
                  <div><small>Área</small><strong>{Number(context.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
                  <div><small>Recomendações aprovadas</small><strong>{prescription.recommendations!.length}</strong></div>
                  <div><small>Blocos de manejo</small><strong>{recommendationGroups.length}</strong></div>
                  <div><small>Plano comercial</small><strong>{commercialSummary ? "Congelado" : "Não selecionado"}</strong></div>
                </div>
                <PublishedRecommendationDashboard
                  groups={recommendationGroups}
                  areaHa={Number(context.areaHa)}
                />
              </>
            )}
            {(prescription.managementPractices?.length ?? 0) > 0 && (
              <div className="report-v4-management">
                <strong>Manejo aprovado</strong>
                <div className="report-v4-management-grid">
                  {prescription.managementPractices!
                    .map(producerFacingText)
                    .filter(Boolean)
                    .map((item, index) => <span key={index}>{item}</span>)}
                </div>
              </div>
            )}
            {(prescription.missingInformation?.length ?? 0) > 0 && (
              <div className="simple-result-limitation">
                <Icon name="shield" size={17}/>
                <span>
                  <strong>Critérios preservados</strong>
                  <div className="report-v4-criteria-grid">
                    {prescription.missingInformation!
                      .map(producerFacingText)
                      .filter(Boolean)
                      .map((item, index) => <small key={index}>{item}</small>)}
                  </div>
                </span>
              </div>
            )}
          </section>
        ) : (
          <section className="simple-result-legacy-note"><Icon name="shield" size={18}/><span><strong>Recomendação não congelada neste formato antigo.</strong><small>A versão técnica publicada continua disponível sem completar informações com dados atuais.</small></span></section>
        )}

        <section className="simple-result-section report-v4-commercial">
          <div className="simple-result-section-head">
            <span>CONVERSÃO OPERACIONAL</span>
            <h2>Produto e custo</h2>
            <p>A necessidade agronômica só vira produto comercial quando um cenário foi escolhido e congelado junto com o laudo.</p>
          </div>
          {commercialSummary ? (
            <>
              <div className="report-v4-commercial-grid">
                {commercialSummary.rows.map((row, index) => (
                  <article key={`${row.productName}-${index}`}>
                    <div>
                      <strong>{row.productName}</strong>
                      <small>Dose do produto</small>
                      <b>{row.doseQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {row.doseUnit}</b>
                    </div>
                    <div>
                      <small>Total do talhão</small>
                      <b>{row.totalQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {row.totalUnit}</b>
                      <span>{row.pricePerTon != null
                        ? `${row.pricePerTon.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/t`
                        : "Preço não congelado"}</span>
                    </div>
                  </article>
                ))}
              </div>
              <div className="report-v4-commercial-total">
                <small>Custo do cenário</small>
                <strong>{commercialSummary.hasFrozenCost
                  ? `${commercialSummary.costPerHa!.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/ha · ${commercialSummary.totalCost!.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} no talhão`
                  : "Produto e quantidade congelados; custo indisponível sem preço suficiente."}</strong>
              </div>
            </>
          ) : (
            <div className="report-v4-commercial-empty">
              <strong>Sem produto comercial congelado</strong>
              <small>O laudo mantém a necessidade agronômica aprovada sem inventar formulação, quantidade de produto ou custo.</small>
            </div>
          )}
        </section>

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
              <PublishedNdviMap fieldId={context.fieldId} capturedAt={ndvi.capturedAt} boundary={publishedBoundary as any} height={190}/>
            )}
          </section>
        )}

        </section>

        <section className="report-v4-sheet report-v4-sheet-three" data-report-page="3">
        <section className="simple-result-section report-v4-final-overview">
          <div className="simple-result-section-head">
            <span>FECHAMENTO DO TALHÃO</span>
            <h2>Visão final desta decisão</h2>
            <p>Resumo direto do que entrou no laudo oficial e do que foi efetivamente liberado.</p>
          </div>
          <div className="report-v4-final-metrics">
            <div><small>Área</small><strong>{Number(context.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
            <div><small>Pontos considerados</small><strong>{publishedPoints.length || "—"}</strong></div>
            <div><small>Indicadores do solo</small><strong>{parameterDashboardRows.length}</strong></div>
            <div><small>Ações aprovadas</small><strong>{approvedActionCount}</strong></div>
          </div>
        </section>

        {producerSummary && (
          <section className="simple-result-section producer-summary">
            <div className="simple-result-section-head">
              <span>RESUMO FINAL</span>
              <h2>Resumo para o produtor</h2>
              <p>
                Para esta área de {producerSummary.areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha,
                veja abaixo somente o que já foi aprovado neste laudo.
              </p>
            </div>

            {producerSummary.hasUniformRecommendations ? (
              <div className="simple-result-producer-summary-list">
                {producerSummary.rows.map((row, index) => (
                  <article key={`${row.inputType}-${index}`}>
                    <div>
                      <strong>{row.label}</strong>
                      <small>
                        Dose aprovada: {row.doseQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {row.doseUnit}
                      </small>
                    </div>
                    <b>
                      {row.totalQuantity != null && row.totalUnit
                        ? `Total da área: ${row.totalQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${row.totalUnit}`
                        : "Usar a dose aprovada por hectare/unidade"}
                    </b>
                  </article>
                ))}
              </div>
            ) : (
              <div className="simple-result-producer-summary-empty">
                <strong>Nenhuma dose uniforme foi liberada para esta área.</strong>
                <small>O laudo continua concluído; o RAIZ apenas evitou transformar evidência insuficiente em uma quantidade inventada.</small>
              </div>
            )}

            {(producerSummary.showsNutrientEquivalentNote || producerSummary.showsLimeEquivalentNote) && (
              <div className="simple-result-producer-summary-note">
                {producerSummary.showsNutrientEquivalentNote && (
                  <p><strong>Nutrientes:</strong> N, P₂O₅, K₂O e S são quantidades equivalentes do nutriente. Isso não é, automaticamente, o peso do fertilizante comercial.</p>
                )}
                {producerSummary.showsLimeEquivalentNote && (
                  <p><strong>Calcário:</strong> PRNT 100% é uma necessidade equivalente. A quantidade do produto comercial depende do PRNT informado para o corretivo escolhido.</p>
                )}
              </div>
            )}

            <div className="simple-result-producer-summary-cost">
              <strong>Produto/custo comercial</strong>
              <span>{commercialSummary
                ? "O cenário comercial congelado está detalhado na página de recomendação e manejo."
                : "Nenhum cenário comercial foi congelado junto com esta decisão."}</span>
            </div>
          </section>
        )}

        {technicalOpinion && (
          <section className="simple-result-section report-v4-opinion">
            <div className="simple-result-section-head">
              <span>PARECER TÉCNICO</span>
              <h2>Conclusão</h2>
            </div>
            <p>{technicalOpinion}</p>
          </section>
        )}

        <section className="simple-result-section report-v4-trace">
          <div className="simple-result-section-head">
            <span>BASE DA DECISÃO</span>
            <h2>De onde veio este resultado</h2>
            <p>O laudo combina o que foi medido no laboratório, o contexto congelado e as regras agronômicas versionadas usadas na publicação.</p>
          </div>
          <div className="report-v4-trace-grid">
            <div><small>Versão oficial</small><strong>Rev. {officialRevision}</strong></div>
            <div><small>Métodos laboratoriais</small><strong>{laboratoryMethodCount || "Não informado"}</strong></div>
            <div>
              <small>Base agronômica</small>
              <strong>
                {structured.trace?.cropProfileCode ?? context.currentCrop ?? context.cropProfileName ?? "Perfil corrente"}
                {structured.trace?.cropProfileVersion ? ` · v${structured.trace.cropProfileVersion}` : ""}
              </strong>
            </div>
            <div><small>Validação</small><strong>{validationLabel || "Snapshot oficial"}</strong></div>
          </div>
        </section>

        <section className="simple-result-signature">
          {branding.responsibleName ? (
            <ReportSignature branding={branding}/>
          ) : (
            <div className="report-v4-signature-missing">
              <strong>Responsável técnico</strong>
              <small>Não informado no snapshot oficial desta publicação.</small>
            </div>
          )}
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
                initialCommercialPlanSnapshotId={v3?.commercialPlanSnapshot?.id ?? ""}
              />
            )}
            {canViewTechnical && <Link href={`/relatorios/talhao/${analysisId}?versao=publicada`} className="simple-result-technical-link">Detalhes técnicos</Link>}
          </div>
        </footer>
        </section>
      </article>
    </div>
  );
}
