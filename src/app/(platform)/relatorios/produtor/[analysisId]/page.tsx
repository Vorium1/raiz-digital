import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PrintButton } from "@/components/print-button";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { requirePlatformSession } from "@/lib/auth/session";
import { getFieldAnalysisReportData } from "@/lib/repositories/reports";
import { getTenantBranding } from "@/lib/repositories/tenant-branding";

export const metadata = { title: "Resumo ao produtor" };

/**
 * Resumo ao produtor (Fase 3, Bloco E) — apresentação simples do que já está disponível, template
 * determinístico (nenhuma IA gera texto aqui, pedido explícito do briefing): o que foi observado, o que
 * foi interpretado, o que foi aprovado, o que ainda precisa ser investigado, próximos passos. Mesma
 * fonte real do relatório técnico (`getFieldAnalysisReportData`), só reapresentada sem jargão técnico.
 */
export default async function ProducerSummaryReportPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const session = await requirePlatformSession();
  const [data, branding] = await Promise.all([
    getFieldAnalysisReportData(session.tenantId, analysisId, session.userId),
    getTenantBranding(session.tenantId),
  ]);
  if (!data) notFound();
  const { analysis, points, results, interpretation } = data;
  const structured = interpretation?.structuredOutput as { interpretation?: Array<{ sampleCode: string; parameterCode: string; interpretable: boolean; classification?: string; reason?: string }> } | null;
  const collectedCount = points.filter((p: any) => p.collectedAt).length;
  const interpretableItems = structured?.interpretation?.filter((i) => i.interpretable) ?? [];
  const blockedItems = structured?.interpretation?.filter((i) => !i.interpretable) ?? [];
  const uniqueBlockReasons = Array.from(new Set(blockedItems.map((i) => (i as any).reason).filter(Boolean)));
  const isApproved = interpretation?.status === "APPROVED";

  let nextSteps: string[] = [];
  if (!interpretation) nextSteps = ["Aguardar o cálculo da interpretação técnica."];
  else if (interpretation.status !== "APPROVED" && uniqueBlockReasons.length > 0) nextSteps = ["Resolver as pendências técnicas listadas abaixo antes de interpretar todos os parâmetros."];
  else if (interpretation.status === "IN_REVIEW") nextSteps = ["Aguardar revisão de um profissional responsável."];
  else if (interpretation.status === "APPROVED") nextSteps = ["Nenhuma pendência técnica — acompanhar as próximas coletas/safras."];

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Resumo ao produtor">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print"><span className="report-empty-note">Rascunho — resumo simples gerado por modelo fixo (sem IA), a partir do estado atual.</span><PrintButton/></div>
        <article className="report-doc report-doc-simple">
          <header className="report-header">
            <ReportBrand branding={branding} />
            <div className="report-header-meta"><span>Gerado em</span><strong>{new Date().toLocaleString("pt-BR")}</strong></div>
          </header>
          <h1 className="report-title">Resumo da análise do seu talhão</h1>
          <p className="report-subtitle">{analysis.propertyName} · {analysis.fieldName} · Safra {analysis.seasonLabel}</p>

          <section className="report-section">
            <h2>O que foi observado</h2>
            <p style={{ fontSize: 12, lineHeight: 1.8 }}>
              Foram coletados <strong>{collectedCount} de {points.length}</strong> pontos de amostragem neste talhão, com <strong>{results.length}</strong> resultado(s) de laboratório registrado(s).
            </p>
          </section>

          <section className="report-section">
            <h2>O que foi interpretado</h2>
            {interpretableItems.length > 0 ? (
              <p style={{ fontSize: 12, lineHeight: 1.8 }}><strong>{interpretableItems.length}</strong> resultado(s) já têm uma classificação técnica, feita por um cálculo automático seguindo regras já validadas pela sua consultoria/agrônomo.</p>
            ) : <p className="report-empty-note">Nenhum resultado pôde ser classificado ainda — ver os motivos em &quot;O que ainda precisa ser investigado&quot; abaixo.</p>}
          </section>

          <section className="report-section">
            <h2>O que foi aprovado</h2>
            {isApproved ? (
              <p style={{ fontSize: 12, lineHeight: 1.8 }}>Um profissional responsável já revisou e aprovou esta interpretação{interpretation?.approvedByName ? ` (${interpretation.approvedByName})` : ""} em {interpretation?.approvedAt ? new Date(interpretation.approvedAt).toLocaleDateString("pt-BR") : "data não registrada"}.</p>
            ) : <p className="report-empty-note">Ainda não há aprovação de um profissional responsável para esta análise — o que está aqui é um cálculo técnico, não uma conclusão final.</p>}
          </section>

          <section className="report-section">
            <h2>O que ainda precisa ser investigado</h2>
            {uniqueBlockReasons.length > 0 ? (
              <ul className="report-pendencies">{uniqueBlockReasons.map((reason, i) => <li key={i}><Icon name="warning" size={12}/> {reason}</li>)}</ul>
            ) : <p className="report-empty-note">Nenhuma pendência técnica identificada nos dados atuais.</p>}
          </section>

          <section className="report-section">
            <h2>Próximos passos</h2>
            <ul className="report-pendencies">{nextSteps.map((step, i) => <li key={i}><Icon name="chevron" size={12}/> {step}</li>)}</ul>
          </section>

          <ReportSignature branding={branding} />
        </article>
      </div>
    </>
  );
}
