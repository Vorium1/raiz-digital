import { Icon } from "@/components/icon";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { ClassificationBadge } from "@/components/ui";
import { effectivePointCoordinates, pointPositionKind, type MapPoint } from "@/components/spatial-map-types";
import { buildProducerCommercialPlanSummary, type FrozenCommercialPlanSnapshot } from "@/domain/official-commercial-plan";
import { buildProducerResultSummary } from "@/domain/producer-result-summary";
import type { TenantBranding } from "@/lib/repositories/tenant-branding";

type StructuredFact = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
  source?: string;
};

type StructuredInterpretation = {
  sampleCode: string;
  parameterCode: string;
  interpretable: boolean;
  classification?: string;
  reason?: string;
};

type ReportContext = {
  code?: string | null;
  clientName?: string | null;
  propertyName?: string | null;
  fieldName?: string | null;
  areaHa?: number | null;
  seasonLabel?: string | null;
  currentCrop?: string | null;
  cultivar?: string | null;
  managementSystem?: string | null;
  soilTexture?: string | null;
  yieldGoal?: number | null;
  yieldGoalUnit?: string | null;
  laboratoryName?: string | null;
  municipality?: string | null;
  state?: string | null;
  confidenceScore?: number | null;
  confidenceLevel?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type Recommendation = {
  inputType?: string;
  quantity?: number;
  unit?: string;
  rationale?: string;
  timing?: string;
  applicationTiming?: string;
  stage?: string;
  when?: string;
  period?: string;
  via?: string;
  applicationMethod?: string;
  method?: string;
  placement?: string;
};

type Prescription = {
  summary?: string;
  recommendations?: Recommendation[];
  managementPractices?: string[];
  missingInformation?: string[];
  sources?: Array<{ title?: string; institution?: string }>;
};

type Props = {
  context: ReportContext;
  branding: TenantBranding;
  facts: StructuredFact[];
  interpretationRows: StructuredInterpretation[];
  points: MapPoint[];
  boundary: unknown | null;
  narrativeSummary?: string | null;
  prescription?: Prescription | null;
  interpretationStatus?: string | null;
  prescriptionStatus?: string | null;
  confidence?: { score: number; level: string } | null;
  viewingPublished: boolean;
  currentStatusLabel: string;
  generatedAt: string;
  interpretationRevision?: number | null;
  responsibleName?: string | null;
  technicalBase?: string | null;
  publishedByName?: string | null;
  publishedAt?: string | null;
  publishedHashPrefix?: string | null;
  commercialPlanSnapshot?: FrozenCommercialPlanSnapshot | null;
};

type ParameterSummary = {
  code: string;
  value: string;
  method: string;
  classification: string | null;
  pendingCode: "INSUFFICIENT_EVIDENCE" | "REQUIRES_AGRONOMIST_REVIEW" | null;
  pendingReason: string | null;
  sampleCount: number;
};

function numberPt(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits });
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function parameterSummaries(facts: StructuredFact[], rows: StructuredInterpretation[]): ParameterSummary[] {
  const order = new Map<string, number>();
  const codes: string[] = [];
  const register = (code: string) => {
    if (!order.has(code)) {
      order.set(code, order.size);
      codes.push(code);
    }
  };
  facts.forEach((fact) => register(fact.parameterCode));
  rows.forEach((row) => register(row.parameterCode));

  return codes.map((code) => {
    const parameterFacts = facts.filter((fact) => fact.parameterCode === code);
    const parameterRows = rows.filter((row) => row.parameterCode === code);
    const units = unique(parameterFacts.map((fact) => fact.unit));
    const methods = unique(parameterFacts.map((fact) => fact.method));
    const numericValues = parameterFacts.map((fact) => Number(fact.value)).filter(Number.isFinite);

    let value = "—";
    if (numericValues.length === 1) {
      value = numberPt(numericValues[0]) + (units[0] ? " " + units[0] : "");
    } else if (numericValues.length > 1 && units.length <= 1) {
      const minimum = Math.min(...numericValues);
      const maximum = Math.max(...numericValues);
      const average = numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length;
      const unit = units[0] ? " " + units[0] : "";
      value = numberPt(minimum) + "–" + numberPt(maximum) + unit + " · média " + numberPt(average) + unit;
    } else if (numericValues.length > 1) {
      value = numericValues.length + " resultados · " + units.join(" / ");
    }

    const labels = unique(parameterRows.filter((row) => row.interpretable).map((row) => row.classification));
    const pendingReasons = unique(parameterRows.filter((row) => !row.interpretable).map((row) => row.reason));
    const pendingReason = pendingReasons.length ? pendingReasons.join(" · ") : null;
    const requiresReview = Boolean(pendingReason && /agronom|revis|valid/i.test(pendingReason));

    return {
      code,
      value,
      method: methods.length === 1 ? methods[0] : methods.length > 1 ? "Métodos múltiplos" : "Método não informado",
      classification: labels.length === 1 ? labels[0] : labels.length > 1 ? "Variável: " + labels.join(" · ") : null,
      pendingCode: pendingReasons.length ? (requiresReview ? "REQUIRES_AGRONOMIST_REVIEW" : "INSUFFICIENT_EVIDENCE") : null,
      pendingReason,
      sampleCount: new Set(parameterFacts.map((fact) => fact.sampleCode)).size,
    };
  });
}

function toRing(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const longitude = Number(point[0]);
    const latitude = Number(point[1]);
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? [[longitude, latitude] as [number, number]] : [];
  });
}

function boundaryRings(boundary: unknown): Array<Array<[number, number]>> {
  if (!boundary || typeof boundary !== "object") return [];
  const geometry = boundary as { type?: string; coordinates?: unknown };
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map(toRing).filter((ring) => ring.length >= 3);
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.flatMap((polygon) =>
      Array.isArray(polygon) ? polygon.map(toRing).filter((ring) => ring.length >= 3) : [],
    );
  }
  return [];
}

function SpatialOverview({ boundary, points }: { boundary: unknown | null; points: MapPoint[] }) {
  const rings = boundaryRings(boundary);
  const effectivePoints = points.map((point) => ({ point, coordinates: effectivePointCoordinates(point) }));
  const allCoordinates: Array<[number, number]> = [
    ...rings.flat(),
    ...effectivePoints.map(({ coordinates }) => [coordinates.longitude, coordinates.latitude] as [number, number]),
  ];

  if (!allCoordinates.length) {
    return <div className="report-visual-map-empty">Sem geometria espacial congelada para exibir.</div>;
  }

  const longitudes = allCoordinates.map(([longitude]) => longitude);
  const latitudes = allCoordinates.map(([, latitude]) => latitude);
  let minLon = Math.min(...longitudes);
  let maxLon = Math.max(...longitudes);
  let minLat = Math.min(...latitudes);
  let maxLat = Math.max(...latitudes);
  if (minLon === maxLon) { minLon -= 0.0005; maxLon += 0.0005; }
  if (minLat === maxLat) { minLat -= 0.0005; maxLat += 0.0005; }

  const width = maxLon - minLon;
  const height = maxLat - minLat;
  const x = (longitude: number) => 6 + ((longitude - minLon) / width) * 88;
  const y = (latitude: number) => 64 - ((latitude - minLat) / height) * 56;

  return (
    <div className="report-visual-map">
      <svg viewBox="0 0 100 70" role="img" aria-label="Contorno do talhão e pontos de amostragem sem deslocamento de coordenadas">
        {rings.map((ring, index) => (
          <polygon
            key={index}
            points={ring.map(([longitude, latitude]) => x(longitude).toFixed(2) + "," + y(latitude).toFixed(2)).join(" ")}
            className={index === 0 ? "report-map-boundary primary" : "report-map-boundary"}
          />
        ))}
        {effectivePoints.map(({ point, coordinates }) => {
          const kind = pointPositionKind(point);
          return (
            <g key={point.id} className={"report-map-point " + kind.toLowerCase()}>
              <circle cx={x(coordinates.longitude)} cy={y(coordinates.latitude)} r="1.8" />
              <text x={x(coordinates.longitude) + 2.5} y={y(coordinates.latitude) - 1.7}>{point.code}</text>
            </g>
          );
        })}
      </svg>
      <div className="report-map-legend">
        <span><i className="observed" />Observada</span>
        <span><i className="audited_source" />Fonte auditada</span>
        <span><i className="planned" />Planejada/estimada</span>
      </div>
    </div>
  );
}

function firstText(item: Recommendation, keys: Array<keyof Recommendation>) {
  for (const key of keys) {
    const value = textValue(item[key]);
    if (value) return value;
  }
  return null;
}

function producerRow(item: Recommendation, areaHa: number | null) {
  if (
    typeof item.inputType !== "string"
    || typeof item.quantity !== "number"
    || !Number.isFinite(item.quantity)
    || typeof item.unit !== "string"
  ) return null;
  return buildProducerResultSummary({
    areaHa: areaHa ?? 0,
    recommendations: [{ inputType: item.inputType, quantity: item.quantity, unit: item.unit }],
  }).rows[0] ?? null;
}

function ReportPageHeader({ branding, page, title, code }: { branding: TenantBranding; page: number; title: string; code?: string | null }) {
  return (
    <header className="report-visual-page-header">
      <ReportBrand branding={branding} />
      <div>
        <span>Página {page}/3</span>
        <strong>{title}</strong>
        <small>{code || "Relatório RAIZ"}</small>
      </div>
    </header>
  );
}

export function FinalVisualReport(props: Props) {
  const summaries = parameterSummaries(props.facts, props.interpretationRows);
  const prescription = props.prescription ?? null;
  const recommendations = prescription?.recommendations ?? [];
  const management = prescription?.managementPractices ?? [];
  const missingInformation = prescription?.missingInformation ?? [];
  const pending = summaries.filter((item) => item.pendingCode);
  const commercial = props.commercialPlanSnapshot ? buildProducerCommercialPlanSummary(props.commercialPlanSnapshot) : null;
  const areaHa = typeof props.context.areaHa === "number" ? props.context.areaHa : null;
  const observedCount = props.points.filter((point) => pointPositionKind(point) === "OBSERVED").length;
  const auditedCount = props.points.filter((point) => pointPositionKind(point) === "AUDITED_SOURCE").length;
  const plannedCount = props.points.filter((point) => pointPositionKind(point) === "PLANNED").length;
  const collectedCount = props.points.filter((point) => Boolean(point.collectedAt)).length;
  const depthLabels = unique(props.points.map((point) => point.depthFromCm + "–" + point.depthToCm + " cm"));
  const producerSummary = prescription?.summary || props.narrativeSummary || "Sem síntese técnica aprovada disponível para este documento.";
  const sourceLabels = (prescription?.sources ?? [])
    .map((source) => [source.title, source.institution].filter(Boolean).join(" — "))
    .filter(Boolean);

  return (
    <article className="report-doc report-final-pages">
      <section className="report-a4-page">
        <ReportPageHeader branding={props.branding} page={1} title="Diagnóstico visual" code={props.context.code} />

        <div className="report-visual-title-row">
          <div>
            <span className="report-visual-kicker">RELATÓRIO TÉCNICO DE DECISÃO AGRONÔMICA</span>
            <h1>{props.context.fieldName || "Talhão"} · {props.context.currentCrop || "Cultura não informada"}</h1>
            <p>{props.context.clientName || "Cliente não informado"} · {props.context.propertyName || "Propriedade não informada"}{props.context.municipality ? " · " + props.context.municipality + (props.context.state ? "/" + props.context.state : "") : ""}</p>
          </div>
          <div className="report-visual-status-card">
            <span>Situação</span>
            <strong>{props.viewingPublished ? "Publicado" : props.currentStatusLabel}</strong>
            <small>{props.viewingPublished ? "snapshot imutável verificado" : "versão atual / rascunho"}</small>
          </div>
        </div>

        <div className="report-visual-context-grid">
          <div><span>Área</span><strong>{areaHa != null ? numberPt(areaHa) + " ha" : "—"}</strong></div>
          <div><span>Safra</span><strong>{props.context.seasonLabel || "—"}</strong></div>
          <div><span>Meta produtiva</span><strong>{props.context.yieldGoal != null ? numberPt(Number(props.context.yieldGoal)) + " " + (props.context.yieldGoalUnit || "") : "—"}</strong></div>
          <div><span>Laboratório</span><strong>{props.context.laboratoryName || "Não identificado"}</strong></div>
          <div><span>Textura</span><strong>{props.context.soilTexture || "—"}</strong></div>
          <div><span>Confiabilidade</span><strong>{props.confidence ? Math.round(props.confidence.score) + "/100 · " + props.confidence.level : props.context.confidenceScore != null ? Math.round(Number(props.context.confidenceScore)) + "/100" : "—"}</strong></div>
        </div>

        <div className="report-diagnostic-layout">
          <section className="report-visual-panel report-map-panel">
            <div className="report-visual-section-head">
              <div><span>AMOSTRAGEM</span><h2>Talhão e pontos</h2></div>
              <strong>{props.points.length} pontos</strong>
            </div>
            <SpatialOverview boundary={props.boundary} points={props.points} />
            <div className="report-sampling-stats">
              <span><strong>{collectedCount}</strong> coletados</span>
              <span><strong>{observedCount}</strong> observados</span>
              <span><strong>{auditedCount}</strong> fonte auditada</span>
              <span><strong>{plannedCount}</strong> planejados</span>
            </div>
            <p className="report-visual-note">Profundidade: {depthLabels.length ? depthLabels.join(" · ") : "não informada"}. O mapa usa as coordenadas efetivas registradas; nenhum ponto é deslocado para caber no talhão.</p>
          </section>

          <section className="report-visual-panel">
            <div className="report-visual-section-head">
              <div><span>DIAGNÓSTICO</span><h2>Indicadores e nutrientes</h2></div>
              <strong>{summaries.length} parâmetros</strong>
            </div>
            <div className="report-parameter-grid">
              {summaries.map((item) => (
                <div className={"report-parameter-card " + (item.pendingCode ? "pending" : "")} key={item.code}>
                  <div className="report-parameter-head"><strong>{item.code}</strong><small>{item.sampleCount || "—"} ponto(s)</small></div>
                  <b>{item.value}</b>
                  <span>{item.classification ? <ClassificationBadge label={item.classification} /> : item.pendingCode || "Sem faixa homologada"}</span>
                  <small>{item.method}</small>
                  {item.pendingReason && <em title={item.pendingReason}>{item.pendingReason}</em>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="report-a4-page">
        <ReportPageHeader branding={props.branding} page={2} title="Recomendação e manejo" code={props.context.code} />

        <div className="report-page-heading">
          <span>PLANO DE MANEJO</span>
          <h2>O que fazer, quanto aplicar e por quê</h2>
          <p>{prescription?.summary || "A recomendação numérica só aparece quando existe evidência suficiente e revisão compatível com o estado atual da análise."}</p>
        </div>

        <div className="report-target-strip">
          <div><span>Cultura</span><strong>{props.context.currentCrop || "—"}</strong></div>
          <div><span>Meta produtiva</span><strong>{props.context.yieldGoal != null ? numberPt(Number(props.context.yieldGoal)) + " " + (props.context.yieldGoalUnit || "") : "—"}</strong></div>
          <div><span>Sistema</span><strong>{props.context.managementSystem || "—"}</strong></div>
          <div><span>Status técnico</span><strong>{props.prescriptionStatus === "APPROVED" ? "Recomendação aprovada" : props.prescriptionStatus === "PENDING_REVIEW" ? "Em revisão" : "Sem recomendação aprovada"}</strong></div>
        </div>

        <section className="report-visual-panel report-recommendation-panel">
          <div className="report-visual-section-head">
            <div><span>RECOMENDAÇÕES</span><h2>Necessidade agronômica</h2></div>
            <strong>{recommendations.length} item(ns)</strong>
          </div>
          {recommendations.length ? (
            <div className="report-recommendation-table-wrap">
              <table className="report-recommendation-table">
                <thead><tr><th>Insumo/nutriente</th><th>Dose</th><th>Total do talhão</th><th>Época / via</th><th>Justificativa</th></tr></thead>
                <tbody>
                  {recommendations.map((item, index) => {
                    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : null;
                    const operational = producerRow(item, areaHa);
                    const timing = firstText(item, ["timing", "applicationTiming", "stage", "when", "period"]);
                    const via = firstText(item, ["via", "applicationMethod", "placement"]);
                    return (
                      <tr key={(item.inputType || "item") + "-" + index}>
                        <td><strong>{item.inputType || "Não identificado"}</strong></td>
                        <td>{quantity != null ? numberPt(quantity) + " " + (item.unit || "") : "INSUFFICIENT_EVIDENCE"}</td>
                        <td>{operational?.totalQuantity != null && operational.totalUnit ? numberPt(operational.totalQuantity) + " " + operational.totalUnit : "—"}</td>
                        <td>{[timing, via].filter(Boolean).join(" · ") || "Não congelado na recomendação"}</td>
                        <td>{item.rationale || "Sem justificativa textual adicional."}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="report-evidence-warning"><Icon name="shield" size={14}/><span><strong>Sem dose inventada.</strong> Nenhuma dose numérica sustentada está disponível nesta versão. A ausência fica explícita e não bloqueia o restante do parecer.</span></div>
          )}
        </section>

        <div className="report-management-grid">
          <section className="report-visual-panel">
            <div className="report-visual-section-head"><div><span>PRIORIDADES</span><h2>Manejo</h2></div></div>
            {management.length ? <ol className="report-priority-list">{management.map((item, index) => <li key={index}><b>{index + 1}</b><span>{item}</span></li>)}</ol> : <p className="report-visual-note">Nenhuma prática adicional foi congelada nesta recomendação.</p>}
          </section>

          <section className="report-visual-panel">
            <div className="report-visual-section-head"><div><span>PRODUTO / CUSTO</span><h2>Cenário comercial congelado</h2></div></div>
            {commercial ? (
              <>
                <div className="report-commercial-rows">
                  {commercial.rows.map((row, index) => (
                    <div key={row.productName + index}>
                      <strong>{row.productName}</strong>
                      <span>{numberPt(row.doseQuantity)} {row.doseUnit}</span>
                      <span>Total: {numberPt(row.totalQuantity)} {row.totalUnit}</span>
                      <span>{row.pricePerTon != null ? "Preço congelado: " + row.pricePerTon.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) + "/t" : "Preço não congelado"}</span>
                    </div>
                  ))}
                </div>
                <div className="report-commercial-total">
                  <span>Custo/ha</span><strong>{commercial.costPerHa != null ? commercial.costPerHa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</strong>
                  <span>Total</span><strong>{commercial.totalCost != null ? commercial.totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</strong>
                </div>
              </>
            ) : (
              <p className="report-visual-note">Produto comercial e custo não aparecem aqui porque não existe cenário comercial congelado no snapshot oficial desta versão.</p>
            )}
          </section>
        </div>

        {missingInformation.length > 0 && (
          <section className="report-evidence-strip">
            <strong>Limites preservados</strong>
            <span>{missingInformation.join(" · ")}</span>
          </section>
        )}
      </section>

      <section className="report-a4-page">
        <ReportPageHeader branding={props.branding} page={3} title="Fechamento para o produtor" code={props.context.code} />

        <div className="report-page-heading producer">
          <span>RESUMO FINAL</span>
          <h2>O que importa para executar no talhão</h2>
          <p>{producerSummary}</p>
        </div>

        <section className="report-producer-action-card">
          <div className="report-visual-section-head">
            <div><span>QUANTIDADES</span><h2>Resumo de aplicação</h2></div>
            <strong>{areaHa != null ? numberPt(areaHa) + " ha" : "área não informada"}</strong>
          </div>
          {recommendations.length ? (
            <div className="report-producer-actions">
              {recommendations.map((item, index) => {
                const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : null;
                const operational = producerRow(item, areaHa);
                return (
                  <div key={(item.inputType || "item") + index}>
                    <span>{operational?.label || item.inputType || "Insumo"}</span>
                    <strong>{quantity != null ? numberPt(quantity) + " " + (item.unit || "") : "Sem dose sustentada"}</strong>
                    <small>{operational?.totalQuantity != null && operational.totalUnit ? "Total do talhão: " + numberPt(operational.totalQuantity) + " " + operational.totalUnit : "Total não calculado: unidade não expressa por hectare."}</small>
                  </div>
                );
              })}
            </div>
          ) : <div className="report-evidence-warning"><Icon name="warning" size={14}/><span>Não há dose numérica sustentada nesta versão. O parecer permanece emitido com as limitações técnicas registradas.</span></div>}
        </section>

        <div className="report-closing-grid">
          <section className="report-visual-panel">
            <div className="report-visual-section-head"><div><span>ORDEM DE AÇÃO</span><h2>Prioridades</h2></div></div>
            {management.length ? <ol className="report-priority-list">{management.slice(0, 6).map((item, index) => <li key={index}><b>{index + 1}</b><span>{item}</span></li>)}</ol> : <p className="report-visual-note">Sem prioridades adicionais registradas.</p>}
          </section>

          <section className="report-visual-panel">
            <div className="report-visual-section-head"><div><span>PARECER</span><h2>Conclusão técnica curta</h2></div></div>
            <p className="report-technical-opinion">{producerSummary}</p>
            {pending.length > 0 && (
              <div className="report-pending-compact">
                <strong>Pontos sem evidência suficiente</strong>
                {pending.map((item) => <span key={item.code}><b>{item.code}</b> · {item.pendingCode}{item.pendingReason ? " — " + item.pendingReason : ""}</span>)}
              </div>
            )}
          </section>
        </div>

        <section className="report-traceability">
          <div className="report-visual-section-head"><div><span>RASTREABILIDADE</span><h2>Origem da decisão</h2></div></div>
          <div className="report-trace-grid">
            <div><span>Documento</span><strong>{props.viewingPublished ? "Snapshot oficial imutável" : "Versão atual / rascunho"}</strong></div>
            <div><span>Revisão da interpretação</span><strong>{props.interpretationRevision ?? "—"}</strong></div>
            <div><span>Base técnica</span><strong>{props.technicalBase || "—"}</strong></div>
            <div><span>Responsável técnico</span><strong>{props.responsibleName || "—"}</strong></div>
            <div><span>Gerado/publicado em</span><strong>{props.publishedAt || props.generatedAt}</strong></div>
            <div><span>Integridade</span><strong>{props.viewingPublished ? "Hash verificado" + (props.publishedHashPrefix ? " · " + props.publishedHashPrefix + "…" : "") : "Ainda não publicado"}</strong></div>
          </div>
          {sourceLabels.length > 0 && <p className="report-source-line"><strong>Base técnica citada:</strong> {sourceLabels.join("; ")}</p>}
          {props.viewingPublished && props.publishedByName && <p className="report-source-line"><strong>Publicado por:</strong> {props.publishedByName}</p>}
        </section>

        <div className="report-final-signature">
          <ReportSignature branding={props.branding} />
        </div>
      </section>
    </article>
  );
}
