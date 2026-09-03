import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { PrintButton } from "@/components/print-button";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { requirePlatformSession } from "@/lib/auth/session";
import { getHistoricalEvolutionReportData } from "@/lib/repositories/reports";
import { getTenantBranding } from "@/lib/repositories/tenant-branding";

export const metadata = { title: "Relatório de evolução histórica" };

export default async function EvolutionReportPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  const session = await requirePlatformSession();
  const [data, branding] = await Promise.all([
    getHistoricalEvolutionReportData(session.tenantId, fieldId, session.userId),
    getTenantBranding(session.tenantId),
  ]);
  if (!data) notFound();
  const { field, seasons, analyses } = data;

  const parameterHistory = new Map<string, Array<{ date: string; season: string; classification: string }>>();
  for (const analysis of analyses) {
    const structured = analysis.structuredOutput as { interpretation?: Array<{ parameterCode: string; interpretable: boolean; classification?: string }> } | null;
    for (const item of structured?.interpretation ?? []) {
      if (!item.interpretable) continue;
      const list = parameterHistory.get(item.parameterCode) ?? [];
      list.push({ date: analysis.createdAt, season: analysis.seasonLabel, classification: item.classification ?? "" });
      parameterHistory.set(item.parameterCode, list);
    }
  }

  return (
    <>
      <Topbar eyebrow="Relatórios" title="Evolução histórica">
        <Link href="/relatorios" className="button ghost no-print">Voltar</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print"><span className="report-empty-note">Só compara classificações já homologadas — sem tendência estimada.</span><PrintButton/></div>
        <article className="report-doc">
          <header className="report-header">
            <ReportBrand branding={branding} />
            <div className="report-header-meta"><span>Gerado em</span><strong>{new Date().toLocaleString("pt-BR")}</strong></div>
          </header>
          <h1 className="report-title">Relatório de evolução histórica</h1>
          <p className="report-subtitle">{field.clientName} · {field.propertyName} · {field.fieldName}</p>

          <div className="report-meta-grid">
            <div><span>Talhão</span><strong>{field.fieldName} · {Number(field.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
            <div><span>Safras registradas</span><strong>{seasons.length}</strong></div>
            <div><span>Análises no período</span><strong>{analyses.length}</strong></div>
            <div><span>Parâmetros com histórico</span><strong>{parameterHistory.size}</strong></div>
          </div>

          <section className="report-section">
            <h2>Rotação de culturas</h2>
            {seasons.length ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  {seasons.map((season: any) => `${season.currentCrop || "cultura não informada"} ${season.seasonLabel}`).join("  →  ")}
                </p>
                <table className="report-table"><thead><tr><th>Ordem</th><th>Safra</th><th>Cultura</th></tr></thead>
                  <tbody>{seasons.map((season: any, index: number) => <tr key={season.id}><td>{index + 1}</td><td>{season.seasonLabel}</td><td>{season.currentCrop || "não informada"}</td></tr>)}</tbody>
                </table>
                <p className="report-empty-note" style={{ marginTop: 8 }}>Sequência real por ordem de cadastro — nenhuma safra é sobrescrita, cada sucessão fica rastreável para comparar evolução química, física e microbiológica entre ciclos.</p>
              </>
            ) : <p className="report-empty-note">Nenhuma safra cadastrada para este talhão.</p>}
          </section>

          {parameterHistory.size > 0 ? Array.from(parameterHistory.entries()).map(([parameter, history]) => (
            <section className="report-section" key={parameter}>
              <h2>{parameter}</h2>
              <table className="report-table"><thead><tr><th>Data</th><th>Safra</th><th>Classificação</th></tr></thead>
                <tbody>{history.map((entry, index) => <tr key={index}><td>{new Date(entry.date).toLocaleDateString("pt-BR")}</td><td>{entry.season}</td><td>{entry.classification}</td></tr>)}</tbody>
              </table>
            </section>
          )) : (
            <section className="report-section"><h2>Classificações homologadas</h2><p className="report-empty-note">Ainda não há interpretações homologadas suficientes para montar histórico comparável por parâmetro. A RAIZ não estima tendência sem dado real compatível.</p></section>
          )}
          <ReportSignature branding={branding} />
        </article>
      </div>
    </>
  );
}
