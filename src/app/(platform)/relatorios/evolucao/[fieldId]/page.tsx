import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { PrintButton } from "@/components/print-button";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { ClassificationBadge } from "@/components/ui";
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
  const { field, seasons, analyses, yieldHistory, adherence, reanalysis } = data;

  const adherenceStatusLabel: Record<string, string> = { OK: "Seguiu a recomendação", UNDER: "Aplicou abaixo do recomendado", OVER: "Aplicou acima do recomendado", NOT_APPLIED: "Não aplicou" };

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

          {reanalysis.due ? (
            <p className="report-empty-note" style={{ background: "#fff4e5", padding: "10px 12px", borderRadius: 8, fontWeight: 600 }}>
              Reanálise recomendada: já se passaram {reanalysis.monthsSinceLastAnalysis} meses desde a última análise deste talhão — a regra técnica carregada (fonte: Trigo Safra 2026) recomenda reanalisar o solo no máximo a cada 3 anos.
            </p>
          ) : null}

          <section className="report-section">
            <h2>Produtividade registrada</h2>
            {yieldHistory.length ? (
              <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Safra</th><th>Cultura</th><th>Cultivar</th><th>Produtividade</th><th>Origem</th></tr></thead>
                <tbody>{yieldHistory.map((row: any) => <tr key={row.id}><td>{row.seasonLabel}</td><td>{row.crop}</td><td>{row.cultivar || "—"}</td><td>{row.yieldValue.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {row.yieldUnit}</td><td>{row.source || "—"}</td></tr>)}</tbody>
              </table></div>
            ) : <p className="report-empty-note">Nenhuma produtividade registrada para este talhão ainda.</p>}
          </section>

          <section className="report-section">
            <h2>Aderência à recomendação de insumos</h2>
            {adherence.length ? (
              <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Análise</th><th>Insumo</th><th>Recomendado</th><th>Aplicado</th><th>Situação</th></tr></thead>
                <tbody>{adherence.map((row: any, index: number) => {
                  const analysis = analyses.find((a: any) => a.id === row.analysisId);
                  return (
                    <tr key={index}>
                      <td>{analysis?.code ?? row.analysisId} {analysis ? `(${new Date(analysis.createdAt).toLocaleDateString("pt-BR")})` : ""}</td>
                      <td>{row.inputType}</td>
                      <td>{row.recommendedQuantity}{row.unit}</td>
                      <td>{row.appliedQuantity != null ? `${row.appliedQuantity.toFixed(2)}${row.unit}` : "—"}</td>
                      <td>{adherenceStatusLabel[row.status]}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            ) : <p className="report-empty-note">Nenhuma recomendação de insumo registrada para este talhão ainda.</p>}
            {/* Antes esta nota afirmava uma relação causal ("produtividade não corresponde ao esperado por
                falta de adesão") sem nenhum modelo estatístico por trás -- achado real numa revisão
                independente. Corrigido pra descrever só o que a tabela É (comparação documental entre
                recomendado e aplicado), sem atribuir causa a nenhum resultado de produtividade. */}
            <p className="report-empty-note" style={{ marginTop: 8 }}>Comparação documental entre a última recomendação técnica de cada análise e o total realmente aplicado em campo — registro de rastreabilidade, não uma explicação de causa para nenhum resultado de produtividade.</p>
          </section>

          <section className="report-section">
            <h2>Rotação de culturas</h2>
            {seasons.length ? (
              <>
                {/* Antes o título e a legenda desta seção afirmavam "sequência real" -- mas a ordem vem de
                    `created_at` (quando a linha foi cadastrada no sistema), não de uma data agronômica real
                    de plantio (crop_seasons não guarda essa data). Cadastro fora de ordem (ex.: usuário
                    registrando uma safra antiga depois) produziria uma sequência errada aqui sem nenhum
                    aviso. Achado real numa revisão independente -- corrigido pra nunca afirmar mais
                    certeza do que o dado garante. */}
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  {seasons.map((season: any) => `${season.currentCrop || "cultura não informada"} ${season.seasonLabel}`).join("  →  ")}
                </p>
                <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Ordem de cadastro</th><th>Safra</th><th>Cultura</th></tr></thead>
                  <tbody>{seasons.map((season: any, index: number) => <tr key={season.id}><td>{index + 1}</td><td>{season.seasonLabel}</td><td>{season.currentCrop || "não informada"}</td></tr>)}</tbody>
                </table></div>
                <p className="report-empty-note" style={{ marginTop: 8 }}>Ordem de cadastro no sistema — nenhuma safra é sobrescrita, cada uma fica rastreável, mas esta ordem não comprova a sequência agronômica real de plantio. Confira o rótulo de cada safra (ex.: "2025/26") para confirmar a ordem real.</p>
              </>
            ) : <p className="report-empty-note">Nenhuma safra cadastrada para este talhão.</p>}
          </section>

          {parameterHistory.size > 0 ? Array.from(parameterHistory.entries()).map(([parameter, history]) => (
            <section className="report-section" key={parameter}>
              <h2>{parameter}</h2>
              <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Data</th><th>Safra</th><th>Classificação</th></tr></thead>
                <tbody>{history.map((entry, index) => <tr key={index}><td>{new Date(entry.date).toLocaleDateString("pt-BR")}</td><td>{entry.season}</td><td>{entry.classification ? <ClassificationBadge label={entry.classification}/> : "—"}</td></tr>)}</tbody>
              </table></div>
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
