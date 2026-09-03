import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { PublishReportButton } from "@/components/publish-report-button";
import { RealFieldMap } from "@/components/real-field-map";
import { StatusBadge } from "@/components/ui";
import { requirePlatformSession } from "@/lib/auth/session";
import { getFieldAnalysisReportData } from "@/lib/repositories/reports";
import { getLatestAgronomicNarrative } from "@/lib/repositories/ai-generations";
import { analysisStatusMeta } from "@/domain/analysis-ui";

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export const metadata = { title: "Relatório de análise por talhão" };

export default async function FieldAnalysisReportPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const session = await requirePlatformSession();
  const [data, narrative] = await Promise.all([
    getFieldAnalysisReportData(session.tenantId, analysisId, session.userId),
    getLatestAgronomicNarrative(session.tenantId, analysisId, session.userId),
  ]);
  if (!data) notFound();
  const { analysis, points, results, interpretation } = data;
  const meta = analysisStatusMeta(analysis.status);
  const structured = interpretation?.structuredOutput as { interpretation?: Array<{ sampleCode: string; parameterCode: string; interpretable: boolean; classification?: string; reason?: string }>; confidence?: { score: number; level: string } } | null;
  const collectedCount = points.filter((point: any) => point.collectedAt).length;

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Análise por talhão">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print">
          <span className="report-empty-note">Documento gerado a partir de dados reais persistidos — nenhum valor estimado.</span>
          <div style={{ display: "flex", gap: 10 }}>
            {interpretation && interpretation.status === "APPROVED" && REVIEW_ROLES.has(session.role) && <PublishReportButton interpretationId={interpretation.id}/>}
            <PrintButton/>
          </div>
        </div>

        <article className="report-doc">
          <header className="report-header">
            <Image src="/brand/logo-light.svg" alt="Raiz Digital" width={150} height={38}/>
            <div className="report-header-meta">
              <span>Gerado em</span><strong>{new Date().toLocaleString("pt-BR")}</strong>
              <span style={{ marginTop: 6 }}>Código</span><strong>{analysis.code}</strong>
            </div>
          </header>

          <h1 className="report-title">Relatório de análise por talhão</h1>
          <p className="report-subtitle">{analysis.clientName} · {analysis.propertyName} · {analysis.fieldName}</p>

          <div className="report-meta-grid">
            <div><span>Cliente</span><strong>{analysis.clientName}</strong></div>
            <div><span>Propriedade</span><strong>{analysis.propertyName}</strong></div>
            <div><span>Talhão</span><strong>{analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
            <div><span>Safra / cultura</span><strong>{analysis.seasonLabel} · {analysis.currentCrop || "não informada"}</strong></div>
            <div><span>Cultivar</span><strong>{analysis.cultivar || "—"}</strong></div>
            <div><span>Sistema de cultivo</span><strong>{analysis.managementSystem || "—"}</strong></div>
            <div><span>Textura do solo</span><strong>{analysis.soilTexture || "—"}</strong></div>
            <div><span>Meta produtiva</span><strong>{analysis.yieldGoal != null ? `${analysis.yieldGoal} ${analysis.yieldGoalUnit ?? ""}` : "—"}</strong></div>
            <div><span>Laboratório</span><strong>{analysis.laboratoryName || "Não identificado"}</strong></div>
            <div><span>Período</span><strong>{new Date(analysis.createdAt).toLocaleDateString("pt-BR")} – {new Date(analysis.updatedAt).toLocaleDateString("pt-BR")}</strong></div>
            <div><span>Status</span><strong><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></strong></div>
            <div><span>Confiabilidade</span><strong>{analysis.confidenceScore != null ? `${Math.round(Number(analysis.confidenceScore))}/100 (${analysis.confidenceLevel})` : "—"}</strong></div>
          </div>

          <section className="report-section">
            <h2>Pontos de amostragem ({points.length} — {collectedCount} coletados)</h2>
            {points.length ? (
              <table className="report-table">
                <thead><tr><th>Código</th><th>Coordenadas</th><th>Profundidade</th><th>Status</th></tr></thead>
                <tbody>{points.map((point: any) => (
                  <tr key={point.id}><td>{point.code}</td><td>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</td><td>{point.depthFromCm}–{point.depthToCm} cm</td><td>{point.collectedAt ? "Coletado" : "Pendente"}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="report-empty-note">Nenhum ponto vinculado a esta análise.</p>}
          </section>

          {points.length > 0 && (
            <section className="report-section no-print">
              <h2>Mapa real</h2>
              <RealFieldMap boundary={analysis.fieldBoundary} points={points.map((point: any) => ({ ...point, sequence: null, observedLatitude: null, observedLongitude: null, subsampleCount: null, accuracyM: null, gpsSource: null, notes: null, labResultCount: 0 }))} height={340}/>
            </section>
          )}

          <section className="report-section">
            <h2>Parâmetros laboratoriais</h2>
            {results.length ? (
              <table className="report-table">
                <thead><tr><th>Ponto</th><th>Parâmetro</th><th>Valor</th><th>Unidade</th><th>Método</th></tr></thead>
                <tbody>{results.map((result: any, index: number) => (
                  <tr key={index}><td>{result.sampleCode}</td><td>{result.parameterCode}</td><td>{result.value}</td><td>{result.unit}</td><td>{result.method}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="report-empty-note">Nenhum resultado laboratorial persistido ainda para esta análise.</p>}
          </section>

          <section className="report-section">
            <h2>Classificações homologadas</h2>
            {structured?.interpretation?.length ? (
              <table className="report-table">
                <thead><tr><th>Ponto</th><th>Parâmetro</th><th>Classificação</th></tr></thead>
                <tbody>{structured.interpretation.map((item, index) => (
                  <tr key={index}><td>{item.sampleCode}</td><td>{item.parameterCode}</td><td>{item.interpretable ? item.classification : <em>Não interpretável</em>}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="report-empty-note">Nenhuma interpretação calculada ainda — sem recomendação ou classificação inventada.</p>}
          </section>

          {narrative && (
            <section className="report-section narrative-report-section">
              <h2>Síntese assistida por IA</h2>
              <p className="report-empty-note" style={{ marginBottom: 10 }}>
                {narrative.responsePayload.isRealLanguageModel ? `Gerado por ${narrative.provider}.` : "Gerado por motor de texto local (sem custo) — reformata os fatos e a classificação já calculados, não é um modelo de linguagem real ainda."}
                {" "}Status: {narrative.status === "APPROVED" ? "aprovada por revisão profissional." : "aguardando ou pendente de revisão profissional — não é conclusão definitiva."}
              </p>
              <p style={{ fontSize: 12, fontWeight: 600 }}>{narrative.responsePayload.narrative.summary}</p>
              {narrative.responsePayload.narrative.observations.length > 0 && <ul style={{ fontSize: 11, paddingLeft: 18 }}>{narrative.responsePayload.narrative.observations.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul>}
            </section>
          )}

          {structured?.interpretation?.some((item) => !item.interpretable) && (
            <section className="report-section">
              <h2>Pendências</h2>
              <ul className="report-pendencies">
                {Array.from(new Set(structured.interpretation.filter((item) => !item.interpretable).map((item) => item.reason))).map((reason, index) => <li key={index}><Icon name="warning" size={12}/> {reason}</li>)}
              </ul>
            </section>
          )}

          <div className="report-signature">
            <div><span>Status de revisão</span>{interpretation ? (interpretation.status === "APPROVED" ? "Aprovada" : "Aguardando validação técnica") : "Sem interpretação registrada"}</div>
            <div><span>Responsável técnico</span>{interpretation?.approvedByName || interpretation?.reviewedByName || "—"}</div>
            <div><span>Base técnica</span>{interpretation?.cropProfileName || "—"}</div>
          </div>
        </article>
      </div>
    </>
  );
}
