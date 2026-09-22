import Link from "next/link";
import { Icon } from "@/components/icon";
import { requirePlatformSession } from "@/lib/auth/session";
import { listPublishedReports } from "@/lib/repositories/reports";
import { listAnalyses } from "@/lib/repositories/analyses";
import { getDecisionDeliveryStatuses } from "@/lib/repositories/decision-delivery-status";
import { SimpleResultsPreparation } from "@/components/simple-results-preparation";

export const metadata = { title: "Resultados" };

const REFRESH_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);
const PUBLISH_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export default async function ResultadosPage() {
  const session = await requirePlatformSession();
  const canRefresh = REFRESH_ROLES.has(session.role);
  const canPublishOfficial = PUBLISH_ROLES.has(session.role);
  const [published, analyses] = await Promise.all([
    listPublishedReports(session.tenantId, session.userId),
    listAnalyses(session.tenantId, session.userId),
  ]);
  const seenAnalyses = new Set<string>();
  const latestResults = published.filter((report: any) => {
    if (seenAnalyses.has(report.analysisId)) return false;
    seenAnalyses.add(report.analysisId);
    return true;
  });

  // Publicação é histórico imutável, não um bloqueio para o estado corrente. Uma análise pode ter
  // uma versão oficial já emitida e, depois de novo laudo/regra/contexto, voltar a precisar atualização,
  // revisão ou nova publicação. Por isso o estado de entrega é calculado para TODAS as análises.
  const deliveryRows = await getDecisionDeliveryStatuses(
    session.tenantId,
    analyses.map((analysis: any) => String(analysis.id)),
    session.userId,
  );
  const deliveryByAnalysis = new Map(deliveryRows.map((row) => [row.analysisId, row]));

  const stale = analyses
    .filter((analysis: any) => {
      const delivery = deliveryByAnalysis.get(String(analysis.id));
      return Boolean(analysis.latestInterpretationStatus) && delivery?.interpretationCurrent === false;
    })
    .map((analysis: any) => ({
      id: String(analysis.id),
      fieldName: String(analysis.fieldName),
      reason: deliveryByAnalysis.get(String(analysis.id))?.interpretationStaleReason ?? null,
    }));

  const publishReady = analyses.filter((analysis: any) => {
    const delivery = deliveryByAnalysis.get(String(analysis.id));
    return delivery?.interpretationCurrent === true
      && delivery.prescriptionCurrent === true
      && analysis.latestInterpretationStatus === "APPROVED"
      && delivery.prescriptionStatus === "APPROVED"
      && delivery.currentReportCount === 0;
  });

  const limited = analyses.filter((analysis: any) => {
    const delivery = deliveryByAnalysis.get(String(analysis.id));
    return delivery?.interpretationCurrent === true
      && analysis.latestInterpretationStatus === "CALCULATED";
  });

  const hasAnyState = latestResults.length + stale.length + publishReady.length + limited.length > 0;

  return (
    <div className="simple-home simple-results-page">
      <header className="simple-home-head">
        <div><span>RESULTADOS</span><h1>Resultados</h1><p>Veja os laudos oficiais, atualizações de base e resultados prontos para emissão.</p></div>
      </header>

      {latestResults.length > 0 && (
        <section className="simple-results-section">
          <div className="simple-results-section-head"><span>PUBLICADOS</span><h2>Resultados oficiais</h2><p>Versões oficiais já emitidas. Se houver dados mais novos, a mesma área também aparece abaixo com o estado atual.</p></div>
          <div className="simple-results-grid">
            {latestResults.map((report: any) => (
              <Link href={`/resultado/${report.analysisId}`} key={report.id} className="simple-result-card">
                <span className="simple-result-icon"><Icon name="file" size={24}/></span>
                <div>
                  <strong>{report.fieldName}</strong>
                  <small>{report.clientName} · {report.propertyName} · Safra {report.seasonLabel}</small>
                  <time>{new Date(report.publishedAt).toLocaleDateString("pt-BR")}</time>
                </div>
                <Icon name="arrow" size={17}/>
              </Link>
            ))}
          </div>
        </section>
      )}

      <SimpleResultsPreparation
        items={stale}
        canRefresh={canRefresh}
        canPublish={canPublishOfficial}
      />

      {publishReady.length > 0 && (
        <section className="simple-results-section">
          <div className="simple-results-section-head">
            <span>VALIDADOS PELO MOTOR</span>
            <h2>{canPublishOfficial ? "Prontos para gerar o laudo" : "Resultados validados"}</h2>
            <p>{canPublishOfficial
              ? "A base atual já passou pelos validadores determinísticos. Falta apenas emitir a nova versão oficial."
              : "A base atual já passou pelos validadores determinísticos. A emissão oficial fica disponível para o perfil responsável."}</p>
          </div>
          <div className="simple-results-grid">
            {publishReady.map((analysis: any) => (
              <Link href={`/analise/${analysis.id}`} key={analysis.id} className="simple-result-card publish-ready">
                <span className="simple-result-icon"><Icon name="check" size={23}/></span>
                <div><strong>{analysis.fieldName}</strong><small>{analysis.clientName} · {analysis.propertyName} · Safra {analysis.seasonLabel}</small><time>{canPublishOfficial ? "Validado pelo motor · gerar resultado" : "Validado pelo motor"}</time></div>
                <Icon name="arrow" size={17}/>
              </Link>
            ))}
          </div>
        </section>
      )}

      {limited.length > 0 && (
        <section className="simple-results-section">
          <div className="simple-results-section-head"><span>CONCLUÍDOS COM LIMITES</span><h2>O que já foi possível concluir</h2><p>Essas análises preservam as limitações técnicas sem pedir dados inexistentes.</p></div>
          <div className="simple-results-grid">
            {limited.map((analysis: any) => (
              <Link href={`/analise/${analysis.id}`} key={analysis.id} className="simple-result-card limited">
                <span className="simple-result-icon"><Icon name="shield" size={23}/></span>
                <div><strong>{analysis.fieldName}</strong><small>{analysis.clientName} · {analysis.propertyName} · Safra {analysis.seasonLabel}</small><time>Conclusão disponível com limites</time></div>
                <Icon name="arrow" size={17}/>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!hasAnyState && (
        <section className="simple-empty-state">
          <span><Icon name="file" size={28}/></span>
          <strong>Ainda não há análise para mostrar.</strong>
          <small>Envie um laudo e a RAIZ prepara a conclusão.</small>
          <Link href="/enviar">Enviar dados</Link>
        </section>
      )}
    </div>
  );
}
