import Link from "next/link";
import { Icon } from "@/components/icon";
import { requirePlatformSession } from "@/lib/auth/session";
import { listPublishedReports } from "@/lib/repositories/reports";

export const metadata = { title: "Resultados" };

export default async function ResultadosPage() {
  const session = await requirePlatformSession();
  const published = await listPublishedReports(session.tenantId, session.userId);
  const seenAnalyses = new Set<string>();
  const latestResults = published.filter((report: any) => {
    if (seenAnalyses.has(report.analysisId)) return false;
    seenAnalyses.add(report.analysisId);
    return true;
  });

  return (
    <div className="simple-home simple-results-page">
      <header className="simple-home-head">
        <div><span>RESULTADOS</span><h1>Resultados prontos</h1><p>Abra o que já foi revisado e publicado.</p></div>
      </header>

      {latestResults.length > 0 ? (
        <section className="simple-results-grid">
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
        </section>
      ) : (
        <section className="simple-empty-state">
          <span><Icon name="file" size={28}/></span>
          <strong>Nenhum resultado publicado ainda.</strong>
          <small>Quando uma revisão for aprovada e publicada, o resultado aparece aqui automaticamente.</small>
          <Link href="/enviar">Enviar dados</Link>
        </section>
      )}
    </div>
  );
}
