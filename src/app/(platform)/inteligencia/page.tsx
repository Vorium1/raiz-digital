import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { EmptyState, PageIntro, StatusBadge } from "@/components/ui";
import { IntelligenceQueueFilters } from "@/components/intelligence-queue-filters";
import { AssistantEntryButton } from "@/components/assistant-entry-button";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { getIntelligenceQueue, getIntelligenceFilterOptions } from "@/lib/repositories/interpretations";
import { demoInterpretationsLog } from "@/lib/demo-data";
import { interpretationStatusMeta, interpretationQueueBucket, QUEUE_BUCKET_META, type QueueBucket } from "@/domain/interpretation-status";
import { formatRelativeOrDate } from "@/domain/analysis-ui";

export const metadata = { title: "Inteligência Agronômica" };

const STATUS_META = interpretationStatusMeta;

function nextActionFor(bucket: QueueBucket, analysisId: string): { label: string; href: string } {
  if (bucket === "BLOQUEADA") return { label: "Resolver o impedimento", href: `/analises/${analysisId}` };
  if (bucket === "APROVADA") return { label: "Ver interpretação aprovada", href: `/analises/${analysisId}` };
  return { label: "Revisar e decidir (aprovar ou devolver)", href: `/analises/${analysisId}` };
}

export default async function AgronomicIntelligenceHubPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isDatabaseMode()) {
    return <><Topbar eyebrow="Inteligência · demonstração" title="Inteligência Agronômica"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo — exemplos ilustrativos.</span></div><PageIntro title="Fila de trabalho técnico" description="Situações que precisam de investigação ou revisão — uma linha por análise, sempre com a revisão mais recente."/>
      <section className="card"><div className="report-table-wrap"><table className="report-table">
        <thead><tr><th>Análise</th><th>Cliente / talhão</th><th>Safra / cultura</th><th>Base técnica</th><th>Confiabilidade</th><th>Status</th><th>Calculado em</th></tr></thead>
        <tbody>{demoInterpretationsLog.map((item) => {
          const meta = STATUS_META(item.status);
          return (
            <tr key={`${item.code}-${item.revision}`}>
              <td><Link href={`/analises/${item.code}`}>{item.code}</Link> · rev {item.revision}</td>
              <td>{item.client} · {item.field}</td>
              <td>{item.season} · {item.crop}</td>
              <td>{item.cropProfile}</td>
              <td>{item.confidence}</td>
              <td><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></td>
              <td>{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
            </tr>
          );
        })}</tbody>
      </table></div></section>
    </div></>;
  }

  const params = await searchParams;
  const session = await requirePlatformSession();
  const [rows, filterOptions] = await Promise.all([
    getIntelligenceQueue(session.tenantId, {
      clientId: params.clientId, propertyId: params.propertyId, fieldId: params.fieldId, seasonId: params.seasonId,
    }, session.userId),
    getIntelligenceFilterOptions(session.tenantId, session.userId),
  ]);

  // Bloco A: cada linha já é a revisão ATUAL da análise (getIntelligenceQueue agrupa por analysisId) --
  // aqui só classifica em um dos 4 grupos reais (nunca inventa um 5º) e aplica os 2 filtros derivados.
  const withBucket = rows.map((row: any) => ({ ...row, bucket: interpretationQueueBucket(row) as QueueBucket }));
  const filtered = withBucket.filter((row) => {
    if (params.interpretationState === "BLOQUEADA" && row.bucket !== "BLOQUEADA") return false;
    if (params.interpretationState === "INTERPRETAVEL" && row.bucket === "BLOQUEADA") return false;
    if (params.reviewState && row.bucket !== params.reviewState) return false;
    return true;
  });

  const counts: Record<QueueBucket, number> = { BLOQUEADA: 0, AGUARDANDO_REVISAO: 0, REVISAO_EM_ANDAMENTO: 0, APROVADA: 0 };
  for (const row of withBucket) counts[row.bucket as QueueBucket]++;

  return (
    <>
      <Topbar eyebrow="Inteligência" title="Inteligência Agronômica"><AssistantEntryButton label="Pergunte sobre a fila"/></Topbar>
      <div className="content-wrap">
        <PageIntro title="Fila de trabalho técnico" description="Situações que precisam de investigação ou revisão — uma linha por análise, sempre com sua revisão mais recente. Versões anteriores continuam acessíveis dentro de cada item, nunca listadas como problemas separados."/>

        <div className="intelligence-bucket-summary">
          {(Object.keys(QUEUE_BUCKET_META) as QueueBucket[]).map((bucket) => (
            <div key={bucket} className={`intelligence-bucket-chip tone-${QUEUE_BUCKET_META[bucket].tone}`}>
              <strong>{counts[bucket]}</strong><span>{QUEUE_BUCKET_META[bucket].label}</span>
            </div>
          ))}
        </div>

        <IntelligenceQueueFilters options={filterOptions}/>

        <section className="card">
          {filtered.length ? (
            <div className="intelligence-queue-list">
              {filtered.map((item) => {
                const bucketMeta = QUEUE_BUCKET_META[item.bucket as QueueBucket];
                const action = nextActionFor(item.bucket as QueueBucket, item.analysisId);
                const responsible = item.bucket === "APROVADA" ? item.approvedByName : item.reviewedByName;
                return (
                  <Link key={item.id} href={`/analises/${item.analysisId}`} className="intelligence-queue-row">
                    <div className="intelligence-queue-context">
                      <strong>{item.clientName} · {item.fieldName}</strong>
                      <small>{item.propertyName} · Safra {item.seasonLabel}{item.currentCrop ? ` · ${item.currentCrop}` : ""} · Análise {item.analysisCode}</small>
                    </div>
                    <div className="intelligence-queue-status">
                      <StatusBadge tone={bucketMeta.tone}>{bucketMeta.label}</StatusBadge>
                      {item.revisionCount > 1 && <small className="intelligence-queue-revcount"><Icon name="history" size={11}/>{item.revisionCount} versões</small>}
                    </div>
                    <div className="intelligence-queue-conclusion">
                      {item.bucket === "BLOQUEADA" ? item.notInterpretableReason : (item.cropProfileName ? `Base técnica: ${item.cropProfileName}` : "—")}
                    </div>
                    <div className="intelligence-queue-meta">
                      <span>{formatRelativeOrDate(item.createdAt)}</span>
                      {responsible && <span className="intelligence-queue-responsible"><Icon name="users" size={11}/>{responsible}</span>}
                    </div>
                    <div className="intelligence-queue-action">{action.label}<Icon name="chevron" size={14}/></div>
                  </Link>
                );
              })}
            </div>
          ) : <EmptyState icon="leaf" title={withBucket.length ? "Nenhum item corresponde aos filtros" : "Nenhuma interpretação calculada ainda"} description={withBucket.length ? "Ajuste ou limpe os filtros acima." : "Rode o motor determinístico numa análise para começar o registro."} action={{ href: "/analises", label: "Ver análises" }}/>}
        </section>
      </div>
    </>
  );
}
