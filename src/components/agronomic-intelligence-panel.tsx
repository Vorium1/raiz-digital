"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { StatusBadge, ClassificationBadge } from "@/components/ui";
import { AgronomicNarrativePanel } from "@/components/agronomic-narrative-panel";
import { AgronomicPrescriptionPanel } from "@/components/agronomic-prescription-panel";
import { RealFieldMap, type MapPoint } from "@/components/real-field-map";
import { FieldNdviPanel } from "@/components/field-ndvi-panel";
import { interpretationStatusMeta } from "@/domain/interpretation-status";
import { computeParameterPredominance } from "@/domain/parameter-predominance";
import { classificationColor } from "@/lib/classification-colors";

type ParameterInterpretation =
  | { sampleCode: string; parameterCode: string; classificationRole?: "TARGET" | "AUXILIARY"; interpretable: true; classification: string; matchedParameter: { id: string; criticality: string | null } }
  | { sampleCode: string; parameterCode: string; classificationRole?: "TARGET" | "AUXILIARY"; interpretable: false; reason: string; code: string };

type Fact = { sampleCode: string; parameterCode: string; value: number; unit: string; method: string; source?: "MEASURED" | "CALCULATED" };

type StructuredOutput = {
  facts: Fact[];
  interpretation: ParameterInterpretation[];
  confidence: { score: number; level: string; dimensions: Array<{ key: string; label: string; score: number; weight: number }> };
  trace: { cropProfileCode: string | null; cropProfileVersion: string | null; generatedAt: string };
};

type Interpretation = {
  id: string;
  revision: number;
  status: string;
  notInterpretableReason: string | null;
  structuredOutput: StructuredOutput | null;
  createdAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
};

type HistoryEntry = { id: string; revision: number; status: string; createdAt: string; reviewedByName: string | null; reviewedAt: string | null; approvedByName: string | null; approvedAt: string | null };

type MapLayerResponse = { fieldBoundary: unknown; points: MapPoint[]; availableParameters: string[] };

export function AgronomicIntelligencePanel({
  analysisId, fieldId, collectionOrderId, canRun, canReview,
}: { analysisId: string; fieldId: string | null; collectionOrderId: string | null; canRun: boolean; canReview: boolean }) {
  const [latest, setLatest] = useState<Interpretation | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [layer, setLayer] = useState<MapLayerResponse | null>(null);
  const [layerLoading, setLayerLoading] = useState(false);
  const [selectedParameter, setSelectedParameter] = useState("");
  const [showSatellite, setShowSatellite] = useState(false);
  const [ndviDate, setNdviDate] = useState<string | null>(null);
  const [showAllImpediments, setShowAllImpediments] = useState(false);

  async function load() {
    const response = await fetch(`/api/analyses/${analysisId}/interpretation`);
    const data = await response.json().catch(() => ({}));
    setLatest(data.latest ?? null);
    setHistory(data.history ?? []);
  }

  useEffect(() => { void load(); }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!collectionOrderId) { setLayer(null); return; }
    setLayerLoading(true);
    const query = selectedParameter ? `?parameter=${encodeURIComponent(selectedParameter)}` : "";
    void fetch(`/api/collection-orders/${collectionOrderId}/map-layer${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: MapLayerResponse) => { setLayer(data); setLayerLoading(false); if (!selectedParameter && data.availableParameters?.length) setSelectedParameter(data.availableParameters[0]); })
      .catch(() => setLayerLoading(false));
  }, [collectionOrderId, selectedParameter]);

  // Nota de compatibilidade (Bloco C): só busca a DATA da leitura de satélite mais recente, pra avisar a
  // diferença de dias em relação à coleta de solo -- nunca sugere relação de causa entre as duas.
  useEffect(() => {
    if (!fieldId) return;
    void fetch(`/api/fields/${fieldId}/ndvi`, { cache: "no-store" }).then((r) => r.json()).then((data) => setNdviDate(data.latest?.capturedAt ?? null)).catch(() => {});
  }, [fieldId]);

  async function runEngine() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/interpret`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao interpretar.");
      setMessage({ tone: "success", text: "Motor determinístico executado." });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao interpretar." }); }
    finally { setBusy(false); }
  }

  async function review(approve: boolean) {
    if (!latest) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/interpretations/${latest.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao registrar revisão.");
      setMessage({ tone: "success", text: approve ? "Interpretação aprovada." : "Devolvida para revisão." });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao registrar revisão." }); }
    finally { setBusy(false); }
  }

  const colorFor = useMemo(() => (point: MapPoint) => {
    if (!point.interpretable) return { stroke: "#9AA79F", fill: "#C9D1CC", fillOpacity: point.labResultCount > 0 ? 0.55 : 0.3 };
    const color = classificationColor(point.classification ?? null);
    return { stroke: color, fill: color, fillOpacity: 0.85 };
  }, []);
  const legend = useMemo(() => {
    const present = new Set((layer?.points ?? []).map((p) => p.classification).filter(Boolean) as string[]);
    const entries = Array.from(present).map((label) => ({ label, color: classificationColor(label) }));
    entries.push({ label: "Sem classificação", color: "#9AA79F" });
    return entries;
  }, [layer]);

  const predominances = useMemo(() => (latest?.structuredOutput ? computeParameterPredominance(latest.structuredOutput.interpretation) : []), [latest]);

  // Bloco D: se existe uma revisão anterior APROVADA e a revisão atual não é a mesma (dado novo depois da
  // aprovação), isso precisa ficar visível -- nunca deixar a aprovação antiga parecer que cobre o dado novo.
  const previousApproval = latest ? history.find((h) => h.status === "APPROVED" && h.revision !== latest.revision) : undefined;

  const latestCollectedAt = useMemo(() => {
    const dates = (layer?.points ?? []).map((p) => p.collectedAt).filter(Boolean) as string[];
    return dates.length ? dates.sort().reverse()[0] : null;
  }, [layer]);
  const ndviGapDays = ndviDate && latestCollectedAt ? Math.round(Math.abs(new Date(ndviDate).getTime() - new Date(latestCollectedAt).getTime()) / 86_400_000) : null;

  if (latest === undefined) return <div className="agro-loading"><Icon name="clock" size={15}/>Carregando inteligência agronômica…</div>;

  if (!latest) {
    return (
      <div className="pending-engine">
        <Icon name="shield" size={24}/>
        <div>
          <span className="eyebrow">SEM RECOMENDAÇÃO INVENTADA</span>
          <h3>Nenhuma interpretação foi calculada ainda.</h3>
          <p>O motor determinístico lê somente dado persistido: resultados de laboratório reais e o perfil de cultura vinculado à safra. Se faltar contexto, o resultado é explicitamente “não interpretável” — nunca um número aproximado.</p>
          {canRun && <button className="button secondary" disabled={busy} onClick={() => void runEngine()}>{busy ? "Calculando…" : "Rodar motor determinístico"}</button>}
        </div>
      </div>
    );
  }

  const facts = latest.structuredOutput?.facts ?? [];
  const interpretation = latest.structuredOutput?.interpretation ?? [];

  // Fechamento técnico (auditoria Cabeda, 2026-09-11, revisão): a tela mostrava só `notInterpretableReason`
  // (`pendencies[0]`, sempre o mesmo -- normalmente o parâmetro que vem primeiro em ordem alfabética),
  // nunca o retrato real: quantos dos resultados desta análise foram de fato cobertos, e o motivo de CADA
  // um dos que não foram. Os dados já existiam em `structuredOutput.interpretation` (uma linha por
  // ponto×parâmetro) -- só nunca tinham sido agregados/mostrados.
  //
  // Revisão (item 2): "resultado não interpretado" deixou de ser uma categoria só -- agora são 3 reais,
  // vindas do `classificationRole` que o motor grava (`?? "TARGET"` trata revisão antiga, calculada antes
  // deste campo existir, do mesmo jeito que sempre foi tratada):
  //   - CLASSIFICADO: interpretable === true (sempre TARGET, por construção do motor).
  //   - AGUARDANDO HOMOLOGAÇÃO/COBERTURA: TARGET, mas não interpretable (parâmetro que DEVERIA classificar,
  //     mas falta homologação/método/unidade/condição/etc.) -- uma pendência real.
  //   - AUXILIAR: classificationRole === "AUXILIARY" -- dado auxiliar/insumo de cálculo que NUNCA teria
  //     faixa própria por desenho da fonte técnica (ex.: CLAY só condição de P) -- nunca uma pendência,
  //     nunca mostrado como impedimento. "Interpretação parcial" só compara classificados contra o total
  //     de alvos reais (classificados + aguardando) -- um dado auxiliar nunca faz a cobertura parecer
  //     menor do que é.
  const roleOf = (item: ParameterInterpretation) => item.classificationRole ?? "TARGET";
  const classifiedResultCount = interpretation.filter((item) => item.interpretable).length;
  const pendingResultCount = interpretation.filter((item) => !item.interpretable && roleOf(item) === "TARGET").length;
  const auxiliaryResultCount = interpretation.filter((item) => roleOf(item) === "AUXILIARY").length;
  const targetTotalCount = classifiedResultCount + pendingResultCount;

  const parameterCodeSummary = (() => {
    const byCode = new Map<string, { role: "TARGET" | "AUXILIARY"; anyInterpretable: boolean }>();
    for (const item of interpretation) {
      const role = roleOf(item);
      const existing = byCode.get(item.parameterCode);
      if (existing) existing.anyInterpretable = existing.anyInterpretable || item.interpretable;
      else byCode.set(item.parameterCode, { role, anyInterpretable: item.interpretable });
    }
    return byCode;
  })();
  const classifiedParamCodes = [...parameterCodeSummary.entries()].filter(([, v]) => v.role === "TARGET" && v.anyInterpretable).map(([code]) => code).sort();
  const pendingParamCodes = [...parameterCodeSummary.entries()].filter(([, v]) => v.role === "TARGET" && !v.anyInterpretable).map(([code]) => code).sort();
  const auxiliaryParamCodes = [...parameterCodeSummary.entries()].filter(([, v]) => v.role === "AUXILIARY").map(([code]) => code).sort();

  const impedimentGroups = (() => {
    const groups = new Map<string, { code: string; parameterCode: string; reason: string; count: number }>();
    for (const item of interpretation) {
      // Item 2: um dado AUXILIAR nunca entra na lista de impedimentos -- não é um erro nem uma pendência.
      if (item.interpretable || roleOf(item) === "AUXILIARY") continue;
      const key = `${item.code}::${item.parameterCode}`;
      const existing = groups.get(key);
      if (existing) existing.count += 1;
      else groups.set(key, { code: item.code, parameterCode: item.parameterCode, reason: item.reason, count: 1 });
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  })();
  const globalImpedimentGroups = impedimentGroups.filter((g) => g.code === "NO_CROP_PROFILE");
  const parameterImpedimentGroups = impedimentGroups.filter((g) => g.code !== "NO_CROP_PROFILE");

  return (
    <div className="cockpit">
      {message && <div className={`agro-message ${message.tone}`} style={{ gridColumn: "1 / -1" }}><Icon name={message.tone === "success" ? "check" : "warning"} size={15}/><span>{message.text}</span></div>}

      {/* Região 1 (Bloco B): evidência selecionada -- mapa real, pontos, ligação com satélite/histórico/comparativos. */}
      <div className="cockpit-region cockpit-evidence">
        <div className="field-ops-section-head compact"><div><span className="eyebrow">EVIDÊNCIA</span><h2>Onde e como o dado foi coletado</h2></div></div>
        {!collectionOrderId ? (
          <p className="report-empty-note" style={{ padding: 16 }}>Esta análise não está vinculada a uma ordem de coleta georreferenciada — sem coordenadas reais pra mostrar no mapa.</p>
        ) : (
          <>
            {(layer?.availableParameters?.length ?? 0) > 0 && (
              <label className="cockpit-parameter-select"><span>Parâmetro no mapa</span>
                <select value={selectedParameter} onChange={(e) => setSelectedParameter(e.target.value)}>
                  {layer!.availableParameters.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
            )}
            {layerLoading ? <div className="agro-loading"><Icon name="clock" size={14}/>Carregando pontos…</div>
              : layer ? <RealFieldMap boundary={layer.fieldBoundary as any} points={layer.points} height={300} colorFor={colorFor} legend={legend} hint="Clique num ponto pra ver método e origem"/>
              : <p className="report-empty-note" style={{ padding: 16 }}>Sem pontos pra mostrar.</p>}
          </>
        )}

        <div className="cockpit-investigation-links">
          {fieldId && <Link href={`/relatorios/evolucao/${fieldId}`} className="button ghost small"><Icon name="history" size={13}/>Histórico compatível</Link>}
          {fieldId && <Link href={`/comparativos?mode=fields&a=${fieldId}`} className="button ghost small"><Icon name="layers" size={13}/>Abrir comparação</Link>}
          {fieldId && <Link href={`/talhoes/${fieldId}`} className="button ghost small"><Icon name="sparkles" size={13}/>Talhão 360°</Link>}
          {fieldId && <button type="button" className={`button ghost small ${showSatellite ? "active" : ""}`} onClick={() => setShowSatellite((v) => !v)}><Icon name="map" size={13}/>{showSatellite ? "Ocultar satélite" : "Consultar satélite"}</button>}
        </div>

        {showSatellite && fieldId && (
          <>
            {ndviGapDays != null && (
              <p className="cockpit-compat-note"><Icon name="warning" size={12}/>Leitura de satélite mais recente e coleta de solo mais recente têm {ndviGapDays} {ndviGapDays === 1 ? "dia" : "dias"} de diferença — naturezas de dado diferentes (sensoriamento remoto agregado × amostra física pontual); a proximidade de data não implica relação de causa entre os dois.</p>
            )}
            <FieldNdviPanel fieldId={fieldId}/>
          </>
        )}
      </div>

      {/* Região 2 (Bloco B): leitura técnica e situação da revisão, organizada nas 6 categorias. */}
      <div className="cockpit-region cockpit-technical">
        <div className="cockpit-revision-badge">
          <StatusBadge tone={interpretationStatusMeta(latest.status).tone}>{interpretationStatusMeta(latest.status).label}</StatusBadge>
          <span>Revisão #{latest.revision} · {new Date(latest.createdAt).toLocaleString("pt-BR")}</span>
        </div>

        {previousApproval && (
          <div className="cockpit-stale-approval">
            <Icon name="warning" size={15}/>
            <span>Existe uma revisão anterior <strong>aprovada</strong> (#{previousApproval.revision}, {previousApproval.approvedAt ? new Date(previousApproval.approvedAt).toLocaleDateString("pt-BR") : "data não registrada"}{previousApproval.approvedByName ? ` por ${previousApproval.approvedByName}` : ""}), mas os dados foram recalculados depois (revisão atual #{latest.revision}, {latest.status === "APPROVED" ? "já reaprovada" : "ainda sem aprovação"}). A aprovação anterior não cobre automaticamente este dado novo.</span>
          </div>
        )}

        {/* 1. DADO */}
        <section className="cockpit-category">
          <h3><span className="cockpit-category-number">1</span>Dado</h3>
          {facts.length === 0 ? <p className="report-empty-note">Nenhum resultado laboratorial persistido para esta análise.</p> : (
            <div className="agro-table-wrap"><table className="agro-table">
              <thead><tr><th>Ponto</th><th>Parâmetro</th><th>Resultado</th><th>Método</th><th>Origem</th></tr></thead>
              <tbody>{facts.map((fact, i) => (
                <tr key={i}>
                  <td>{fact.sampleCode}</td><td>{fact.parameterCode}</td><td>{fact.value} {fact.unit}</td><td>{fact.method}</td>
                  <td>{fact.source === "MEASURED" ? "Medição de laboratório" : fact.source === "CALCULATED" ? "Calculado (derivado)" : "Não registrada (dado anterior a esta rastreabilidade)"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        {/* 2. INTERPRETAÇÃO */}
        <section className="cockpit-category">
          <h3><span className="cockpit-category-number">2</span>Interpretação</h3>
          <div className="agro-summary-row">
            {latest.structuredOutput?.confidence && <div className="agro-stat"><span>Confiabilidade da interpretação</span><strong>{latest.structuredOutput.confidence.score}/100</strong><small>{latest.structuredOutput.confidence.level}</small></div>}
            <div className="agro-stat"><span>Base técnica</span><strong>{latest.structuredOutput?.trace.cropProfileCode ?? "—"}</strong><small>{latest.structuredOutput?.trace.cropProfileVersion ? `v${latest.structuredOutput.trace.cropProfileVersion}` : "sem cultura vinculada"}</small></div>
          </div>
          {(classifiedResultCount + pendingResultCount + auxiliaryResultCount) > 0 && (
            <>
              <div className={`agro-message ${classifiedResultCount === 0 && targetTotalCount > 0 ? "danger" : classifiedResultCount < targetTotalCount ? "waiting" : "success"}`}>
                <Icon name={classifiedResultCount === 0 && targetTotalCount > 0 ? "warning" : classifiedResultCount < targetTotalCount ? "clock" : "check"} size={15}/>
                <span>
                  {targetTotalCount === 0
                    ? "Nenhum parâmetro-alvo de classificação nesta análise."
                    : classifiedResultCount === 0
                      ? `0 de ${targetTotalCount} resultados interpretados.`
                      : classifiedResultCount < targetTotalCount
                        ? `Interpretação parcial — ${classifiedResultCount}/${targetTotalCount} resultados cobertos.`
                        : `${classifiedResultCount}/${targetTotalCount} resultados interpretados.`}
                  {globalImpedimentGroups.length > 0 && ` ${globalImpedimentGroups[0].reason}`}
                </span>
              </div>
              {/* Item 2 do fechamento técnico (auditoria Cabeda): 3 categorias reais, nunca só
                  "interpretável/não" -- um dado auxiliar nunca é mostrado como erro/pendência. */}
              <div className="agro-role-summary">
                <span className="agro-role-chip agro-role-classified">{classifiedParamCodes.length} parâmetro{classifiedParamCodes.length === 1 ? "" : "s"} classificado{classifiedParamCodes.length === 1 ? "" : "s"} ({classifiedResultCount} resultado{classifiedResultCount === 1 ? "" : "s"})</span>
                <span className="agro-role-chip agro-role-pending">{pendingParamCodes.length} aguardando homologação ({pendingResultCount} resultado{pendingResultCount === 1 ? "" : "s"})</span>
                <span className="agro-role-chip agro-role-auxiliary">{auxiliaryParamCodes.length} dado{auxiliaryParamCodes.length === 1 ? "" : "s"} auxiliar{auxiliaryParamCodes.length === 1 ? "" : "es"} ({auxiliaryResultCount} resultado{auxiliaryResultCount === 1 ? "" : "s"})</span>
              </div>
              {auxiliaryParamCodes.length > 0 && (
                <p className="agro-auxiliary-note">
                  Dado auxiliar (insumo/contexto de cálculo, nunca alvo de classificação estática nesta metodologia): {auxiliaryParamCodes.join(", ")}. Não é pendência.
                </p>
              )}
            </>
          )}
          {impedimentGroups.length > 0 && (
            <div className="agro-impediments">
              <button type="button" className="button ghost small" onClick={() => setShowAllImpediments((v) => !v)}>
                {showAllImpediments ? "Ocultar impedimentos" : "Ver todos os impedimentos"} ({impedimentGroups.reduce((sum, g) => sum + g.count, 0)})
              </button>
              {showAllImpediments && (
                <ul className="agro-impediments-list">
                  {globalImpedimentGroups.length > 0 && (
                    <li className="agro-impediment-global"><strong>Impedimento global</strong> — {globalImpedimentGroups[0].reason}</li>
                  )}
                  {parameterImpedimentGroups.map((g) => (
                    <li key={`${g.code}::${g.parameterCode}`}>
                      <span className="agro-impediment-count">{g.count}×</span> <code>{g.code}</code> — <strong>{g.parameterCode}</strong>: {g.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {interpretation.length > 0 && (
            <div className="agro-table-wrap"><table className="agro-table">
              <thead><tr><th>Ponto</th><th>Parâmetro</th><th>Resultado</th><th>Classificação</th></tr></thead>
              <tbody>{interpretation.map((item, index) => {
                const fact = facts.find((f) => f.sampleCode === item.sampleCode && f.parameterCode === item.parameterCode);
                return (
                  <tr key={index}>
                    <td>{item.sampleCode}</td><td>{item.parameterCode}</td><td>{fact ? `${fact.value} ${fact.unit}` : "—"}</td>
                    <td>{item.interpretable ? <ClassificationBadge label={item.classification}/> : roleOf(item) === "AUXILIARY" ? <StatusBadge tone="info"><span title={item.reason}>Auxiliar</span></StatusBadge> : <StatusBadge tone="waiting"><span title={item.reason}>Não interpretável</span></StatusBadge>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
          <AgronomicNarrativePanel analysisId={analysisId} hasClassifications={Boolean(interpretation.length)} canRun={canRun} canReview={canReview}/>
        </section>

        {/* 3. PADRÃO -- corrigido no fechamento técnico da Fase 3: isto é contagem/proporção de
            classificação (predominância observada), NUNCA análise espacial (não lê coordenada,
            proximidade nem vizinhança dos pontos). Nunca chamar de "padrão espacial" na UI. */}
        <section className="cockpit-category">
          <h3><span className="cockpit-category-number">3</span>Padrão</h3>
          <p className="cockpit-category-subtitle">Predominância de classificação observada nesta coleta — contagem e proporção, sem análise de geografia/vizinhança entre os pontos.</p>
          {predominances.length === 0 ? (
            <p className="report-empty-note">Nenhuma predominância observada nos dados desta coleta — só é reportada quando a mesma classificação aparece em mais da metade dos pontos avaliados de um parâmetro, com pelo menos 3 pontos concordantes; uma ou duas observações isoladas não caracterizam predominância.</p>
          ) : (
            <ul className="cockpit-pattern-list">
              {predominances.map((p) => (
                <li key={p.parameterCode}>
                  <strong>{p.parameterCode}</strong>: <ClassificationBadge label={p.classification}/> em {p.matchingCount} de {p.totalCount} pontos avaliados desta coleta ({p.observationCodes.join(", ")}).
                  <small> Predominância de classificação nesta coleta — não é análise espacial (não usa coordenada/vizinhança) nem comparação entre safras/datas diferentes. Um padrão espacial de verdade exigiria geografia dos pontos e um método espacial validado, não implementado aqui.</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 4. HIPÓTESE */}
        <section className="cockpit-category">
          <h3><span className="cockpit-category-number">4</span>Hipótese</h3>
          <p className="report-empty-note">Esta instância ainda não tem um mecanismo técnico definido para gerar hipóteses diagnósticas rastreáveis (explicação causal investigável, com evidências e o que falta verificar). A síntese em linguagem simples na categoria "Interpretação" acima reformula os fatos já classificados — não é uma hipótese sobre causa.</p>
        </section>

        {/* 5. RECOMENDAÇÃO */}
        <section className="cockpit-category">
          <h3><span className="cockpit-category-number">5</span>Recomendação</h3>
          <AgronomicPrescriptionPanel analysisId={analysisId} hasLabResults={Boolean(facts.length)} canRun={canRun} canReview={canReview}/>
        </section>

        {/* 6. VALIDAÇÃO PROFISSIONAL */}
        <section className="cockpit-category">
          <h3><span className="cockpit-category-number">6</span>Validação profissional</h3>
          <dl className="cockpit-validation-list">
            <div><dt>Situação</dt><dd><StatusBadge tone={interpretationStatusMeta(latest.status).tone}>{interpretationStatusMeta(latest.status).label}</StatusBadge></dd></div>
            {latest.reviewedByName && <div><dt>Revisado por</dt><dd>{latest.reviewedByName}{latest.reviewedAt ? ` · ${new Date(latest.reviewedAt).toLocaleString("pt-BR")}` : ""}</dd></div>}
            {latest.approvedByName && <div><dt>Aprovado por</dt><dd>{latest.approvedByName}{latest.approvedAt ? ` · ${new Date(latest.approvedAt).toLocaleString("pt-BR")}` : ""}</dd></div>}
            <div><dt>Versão</dt><dd>Revisão #{latest.revision}</dd></div>
          </dl>
          <div className="agro-actions">
            {canRun && <button className="button ghost" disabled={busy} onClick={() => void runEngine()}>{busy ? "Recalculando…" : "Recalcular"}</button>}
            {canReview && latest.status === "IN_REVIEW" && <button className="button primary" disabled={busy} onClick={() => void review(true)}>Aprovar interpretação</button>}
            {canReview && latest.status === "IN_REVIEW" && latest.reviewedByName && <button className="button ghost" disabled={busy} onClick={() => void review(false)}>Registrar nova devolução</button>}
            {latest.status === "APPROVED" && <StatusBadge tone="success"><Icon name="check" size={12}/>Aprovada</StatusBadge>}
          </div>
          {history.length > 1 && (
            <details className="agro-history">
              <summary>Histórico de revisões ({history.length})</summary>
              <ul>{history.map((item) => (
                <li key={item.id}>#{item.revision} · {interpretationStatusMeta(item.status).label} · {new Date(item.createdAt).toLocaleString("pt-BR")}{item.approvedByName ? ` · aprovado por ${item.approvedByName}` : item.reviewedByName ? ` · revisado por ${item.reviewedByName}` : ""}</li>
              ))}</ul>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
