"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type Prescription = {
  summary: string;
  diagnosis: Array<{ parameterCode: string; value: number; unit: string; interpretation: string; rationale: string }>;
  recommendations: Array<{ inputType: string; quantity: number; unit: string; rationale: string }>;
  managementPractices: string[];
  missingInformation: string[];
  sources: Array<{ title: string; institution: string | null; url: string | null }>;
};

type Generation = {
  id: string;
  provider: string;
  model: string;
  status: "PENDING_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  reviewerNote: string | null;
  reviewedByName: string | null;
  createdAt: string;
  responsePayload: { prescription: Prescription; isRealLanguageModel: boolean };
};

type HistoryEntry = { id: string; status: string; createdAt: string; reviewedByName: string | null };
type Usage = { monthlyLimit: number; usedThisMonth: number };
type PkDoseReadiness = {
  ready: boolean;
  blockers: string[];
  normalized: { yieldGoalTonPerHa: number | null; cultivationYear: "PRIMEIRO" | "SEGUNDO" | null };
};
type UniformPkNutrientReadiness = {
  nutrient: "P2O5" | "K2O";
  ready: boolean;
  soilLevel: string | null;
  matchingCount: number;
  totalCount: number;
  basis: "SINGLE_SAMPLE" | "STRICT_PREDOMINANCE" | null;
  blockers: string[];
};
type UniformPkReadiness = {
  ready: boolean;
  cropCode: string | null;
  ruleId: string | null;
  ruleReady: boolean;
  blockers: string[];
  nutrients: Record<"P2O5" | "K2O", UniformPkNutrientReadiness>;
};
type DeterministicPkDoseDecision = {
  ready: boolean;
  blockers: string[];
  expected: null | {
    ruleId: string;
    nutrient: "P2O5" | "K2O";
    soilLevel: string;
    doseKgPerHa: number;
    minimumKgPerHa: number;
    maximumKgPerHa: number;
    isDiscretionaryRange: boolean;
    source: string;
  };
};
type Readiness = {
  allowed: boolean;
  reason: string | null;
  interpretationStatus: string | null;
  interpretationId: string | null;
  prescriptionFreshness?: { current: boolean; reason: string | null } | null;
  recommendationContext?: {
    cropSeasonId: string;
    yieldGoal: number | null;
    yieldGoalUnit: string | null;
    technologyLevel: string | null;
    cultivationOrderAfterSoilAnalysis: number | null;
    cropProfileCode: string | null;
    updatedAt: string;
    pkDoseReadiness: PkDoseReadiness;
    uniformPkReadiness: UniformPkReadiness;
    deterministicPkDoses: Record<"P2O5" | "K2O", DeterministicPkDoseDecision>;
  };
};

const STATUS_META: Record<string, { label: string; tone: "success" | "review" | "waiting" | "danger" }> = {
  PENDING_REVIEW: { label: "Aguardando revisão profissional", tone: "waiting" },
  APPROVED: { label: "Recomendação oficial aprovada", tone: "success" },
  CHANGES_REQUESTED: { label: "Ajuste solicitado", tone: "review" },
  REJECTED: { label: "Rejeitada", tone: "danger" },
};

const PK_BLOCKER_LABELS: Record<string, string> = {
  YIELD_GOAL_MISSING: "Informe a meta de produtividade da safra.",
  YIELD_GOAL_INVALID: "A meta de produtividade precisa ser maior que zero.",
  YIELD_UNIT_MISSING: "Informe a unidade da meta de produtividade.",
  YIELD_UNIT_UNSUPPORTED: "A unidade da meta ainda não possui conversão homologada para o motor de P/K.",
  POST_ANALYSIS_CULTIVATION_ORDER_MISSING: "Informe se esta é a 1ª ou 2ª cultura após a análise de solo.",
  POST_ANALYSIS_CULTIVATION_ORDER_UNSUPPORTED: "A regra P/K atual está homologada somente para 1º e 2º cultivo após a análise.",
};

const UNIFORM_PK_BLOCKER_LABELS: Record<string, string> = {
  PK_CROP_CODE_MISSING: "A cultura homologada da safra não está definida.",
  PK_CROP_RULE_NOT_IMPLEMENTED: "A cultura ainda não possui tabela determinística P/K liberada para aplicação uniforme.",
  P_NO_CLASSIFIED_OBSERVATION: "Não há classificação válida de fósforo para sustentar dose uniforme.",
  K_NO_CLASSIFIED_OBSERVATION: "Não há classificação válida de potássio para sustentar dose uniforme.",
  P_NO_STRICT_PREDOMINANCE: "Fósforo sem predominância estrita entre os pontos: não usar maioria simples ou média para uma dose uniforme.",
  K_NO_STRICT_PREDOMINANCE: "Potássio sem predominância estrita entre os pontos: não usar maioria simples ou média para uma dose uniforme.",
  P_SAMPLE_CLASSIFICATION_AMBIGUOUS: "Há ponto com classificação ambígua de fósforo.",
  K_SAMPLE_CLASSIFICATION_AMBIGUOUS: "Há ponto com classificação ambígua de potássio.",
  P_CLASSIFICATION_UNSUPPORTED_FOR_DOSE: "A classe de fósforo não é suportada pela tabela de dose ativa.",
  K_CLASSIFICATION_UNSUPPORTED_FOR_DOSE: "A classe de potássio não é suportada pela tabela de dose ativa.",
};

function blockerLabel(code: string) {
  return UNIFORM_PK_BLOCKER_LABELS[code] ?? code;
}

function doseLabel(decision: DeterministicPkDoseDecision | undefined) {
  const expected = decision?.expected;
  if (!expected) return "dose bloqueada";
  if (expected.isDiscretionaryRange) {
    return `${expected.minimumKgPerHa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}–${expected.maximumKgPerHa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg/ha`;
  }
  return `${expected.doseKgPerHa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg/ha`;
}

export function AgronomicPrescriptionPanel({ analysisId, hasLabResults, canRun, canReview }: { analysisId: string; hasLabResults: boolean; canRun: boolean; canReview: boolean }) {
  const [latest, setLatest] = useState<Generation | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextYieldGoal, setContextYieldGoal] = useState("");
  const [contextCultivationOrder, setContextCultivationOrder] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function load() {
    const response = await fetch(`/api/analyses/${analysisId}/agronomic-prescription`);
    const data = await response.json().catch(() => ({}));
    setLatest(data.latest ?? null);
    setHistory(data.history ?? []);
    setUsage(data.usage ?? null);
    setReadiness(data.readiness ?? null);
  }

  useEffect(() => { void load(); }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const context = readiness?.recommendationContext;
    if (!context) return;
    setContextYieldGoal(context.yieldGoal == null ? "" : String(context.yieldGoal));
    setContextCultivationOrder(context.cultivationOrderAfterSoilAnalysis == null ? "" : String(context.cultivationOrderAfterSoilAnalysis));
  }, [readiness]);

  async function saveRecommendationContext() {
    const context = readiness?.recommendationContext;
    if (!context) return;
    const yieldGoal = Number(contextYieldGoal);
    const cultivationOrderAfterSoilAnalysis = Number(contextCultivationOrder);
    if (!Number.isFinite(yieldGoal) || yieldGoal <= 0) {
      setMessage({ tone: "danger", text: "Informe uma meta produtiva válida em t/ha." });
      return;
    }
    if (![1, 2].includes(cultivationOrderAfterSoilAnalysis)) {
      setMessage({ tone: "danger", text: "Informe se esta é a 1ª ou 2ª cultura após a análise de solo." });
      return;
    }

    setContextBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/crop-seasons/${context.cropSeasonId}/recommendation-context`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ yieldGoal, yieldGoalUnit: "t/ha", cultivationOrderAfterSoilAnalysis }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar contexto agronômico.");
      setMessage({ tone: "success", text: "Contexto agronômico salvo. A prontidão de P/K foi recalculada sem inferências." });
      await load();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao salvar contexto agronômico." });
    } finally {
      setContextBusy(false);
    }
  }

  async function generate() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/agronomic-prescription`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao gerar recomendação.");
      setMessage({ tone: "success", text: "Recomendação assistida gerada — aguardando revisão profissional." });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao gerar recomendação." }); }
    finally { setBusy(false); }
  }

  async function review(decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    if (!latest) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/agronomic-prescriptions/${latest.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao registrar revisão.");
      setNote("");
      const promoted = data.generation?.promotedRecommendations ?? 0;
      setMessage({ tone: "success", text: decision === "APPROVED" ? `Recomendação aprovada${promoted > 0 ? ` — ${promoted} item(ns) oficial(is) registrado(s)` : ""}.` : decision === "CHANGES_REQUESTED" ? "Ajuste solicitado." : "Recomendação rejeitada." });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao registrar revisão." }); }
    finally { setBusy(false); }
  }

  if (!hasLabResults) return null;
  if (latest === undefined) return <div className="agro-loading"><Icon name="clock" size={13}/>Carregando recomendação assistida…</div>;

  const monthlyLimitReached = Boolean(usage && usage.usedThisMonth >= usage.monthlyLimit);
  const readyToGenerate = readiness?.allowed === true;
  const recommendationContext = readiness?.recommendationContext;
  const pkReadiness = recommendationContext?.pkDoseReadiness;
  const uniformPkReadiness = recommendationContext?.uniformPkReadiness;
  const prescriptionStale = Boolean(latest && readiness?.prescriptionFreshness?.current === false);
  const statusMeta = prescriptionStale
    ? { label: "Desatualizada — contexto mudou", tone: "review" as const }
    : latest ? (STATUS_META[latest.status] ?? { label: latest.status, tone: "waiting" as const }) : null;

  return (
    <section className="narrative-panel">
      <div className="narrative-panel-head">
        <div><span className="eyebrow">RECOMENDAÇÃO ASSISTIDA RAIZ</span><h3>Da interpretação aprovada ao plano de manejo</h3></div>
        {latest && statusMeta && <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>}
      </div>

      <p className="report-empty-note" style={{ margin: "0 0 10px" }}>A RAIZ só libera esta etapa depois de uma interpretação determinística aprovada. Toda recomendação gerada continua exigindo revisão profissional antes de virar recomendação oficial.</p>

      {usage && <p className="report-empty-note" style={{ margin: "0 0 10px" }}>Uso assistido da empresa: {usage.usedThisMonth}/{usage.monthlyLimit} gerações neste mês.</p>}

      {recommendationContext && (
        <div className={`narrative-block ${pkReadiness?.ready && uniformPkReadiness?.ready ? "" : "attention"}`} style={{ marginBottom: 12 }}>
          <h4>{pkReadiness?.ready ? <Icon name="check" size={12}/> : <Icon name="warning" size={12}/>} Contexto para dose de P e K</h4>
          <p style={{ marginBottom: 8 }}>
            Meta: <strong>{recommendationContext.yieldGoal ?? "não informada"}{recommendationContext.yieldGoalUnit ? ` ${recommendationContext.yieldGoalUnit}` : ""}</strong>
            {" · "}cultivo após a análise: <strong>{recommendationContext.cultivationOrderAfterSoilAnalysis ? `${recommendationContext.cultivationOrderAfterSoilAnalysis}º` : "não informado"}</strong>
            {recommendationContext.cropProfileCode ? <> · cultura/regra: <strong>{recommendationContext.cropProfileCode}</strong></> : null}
            {recommendationContext.technologyLevel ? <> · nível tecnológico: <strong>{recommendationContext.technologyLevel}</strong></> : null}
          </p>
          {pkReadiness?.ready ? (
            <p className="report-empty-note" style={{ margin: 0 }}>Contexto mínimo disponível para o motor determinístico de P/K. O nível tecnológico é apenas contexto de cenário e não altera a dose sozinho.</p>
          ) : (
            <><p className="report-empty-note" style={{ margin: "0 0 6px" }}>P/K quantitativo permanece bloqueado até fechar os campos abaixo. Outras recomendações tecnicamente sustentadas podem continuar sendo analisadas.</p><ul>{(pkReadiness?.blockers ?? []).map((blocker) => <li key={blocker}>{PK_BLOCKER_LABELS[blocker] ?? blocker}</li>)}</ul></>
          )}

          {uniformPkReadiness && (
            <div className="review-grid" style={{ marginTop: 10 }}>
              {(["P2O5", "K2O"] as const).map((nutrient) => {
                const state = uniformPkReadiness.nutrients[nutrient];
                const dose = recommendationContext.deterministicPkDoses[nutrient];
                return <div className="review-summary" key={nutrient}>
                  <span>{nutrient} · aplicação uniforme</span>
                  <strong>{state.ready && uniformPkReadiness.ruleReady ? `${state.soilLevel ?? "—"} · ${doseLabel(dose)}` : "Bloqueado"}</strong>
                  {state.ready ? <small>{state.basis === "SINGLE_SAMPLE" ? "Base: amostra representativa única." : `Predominância estrita: ${state.matchingCount}/${state.totalCount} pontos concordantes.`}</small> : state.blockers.map((blocker) => <small key={blocker}>{blockerLabel(blocker)}</small>)}
                  {state.ready && uniformPkReadiness.ruleId ? <small>Regra versionada: {uniformPkReadiness.ruleId}. A quantidade oficial é recalculada no servidor.</small> : null}
                </div>;
              })}
            </div>
          )}

          {uniformPkReadiness && !uniformPkReadiness.ruleReady && <p className="report-empty-note" style={{ marginTop: 8 }}>{uniformPkReadiness.blockers.filter((code) => code.startsWith("PK_")).map(blockerLabel).join(" ")}</p>}

          {canRun && (
            <details style={{ marginTop: 10 }} open={!pkReadiness?.ready}>
              <summary>Preencher/atualizar contexto de P/K</summary>
              <div className="narrative-review-form" style={{ marginTop: 10 }}>
                <div className="review-grid">
                  <label className="review-summary"><span>Meta produtiva</span><input type="number" min="0.1" step="0.1" inputMode="decimal" value={contextYieldGoal} onChange={(event) => setContextYieldGoal(event.target.value)} placeholder="Ex.: 4.2"/><small>t/ha · sem conversão implícita de sc/ha</small></label>
                  <label className="review-summary"><span>Cultivo após a análise</span><select value={contextCultivationOrder} onChange={(event) => setContextCultivationOrder(event.target.value)}><option value="">Selecione</option><option value="1">1º cultivo</option><option value="2">2º cultivo</option></select><small>Não é o mesmo que anos de cultivo da área.</small></label>
                </div>
                <div className="narrative-review-actions"><button className="button secondary" disabled={contextBusy} onClick={() => void saveRecommendationContext()}>{contextBusy ? "Salvando…" : "Salvar contexto agronômico"}</button></div>
              </div>
            </details>
          )}
        </div>
      )}

      <div className="narrative-provider-note" style={{ marginBottom: 10 }}>
        <Icon name="layers" size={13}/>
        Taxa variável é sob solicitação: não é gerada automaticamente nesta análise. O fluxo espacial exige limite do talhão, coordenadas confiáveis e política técnica homologada.
      </div>

      {prescriptionStale && (
        <div className="agro-message danger"><Icon name="warning" size={14}/><span>{readiness?.prescriptionFreshness?.reason ?? "O contexto da safra mudou depois desta geração."} A versão anterior permanece no histórico, mas não deve ser tratada como recomendação corrente.</span></div>
      )}

      {message && <div className={`agro-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={14}/><span>{message.text}</span></div>}

      {!latest ? (
        <div className="pending-engine" style={{ margin: 0 }}>
          <Icon name={readyToGenerate ? "sparkles" : "shield"} size={22}/>
          <div>
            <p>{readyToGenerate ? "Interpretação aprovada. A análise está pronta para gerar uma proposta de manejo rastreável." : readiness?.reason ?? "A recomendação será liberada após a aprovação técnica da interpretação."}</p>
            {canRun && <button className="button secondary" disabled={busy || monthlyLimitReached || !readyToGenerate} onClick={() => void generate()}>{busy ? "Gerando…" : monthlyLimitReached ? "Limite mensal atingido" : readyToGenerate ? "Gerar recomendação assistida" : "Aguardando aprovação técnica"}</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="narrative-provider-note">
            <Icon name="shield" size={13}/>
            Evidências da análise + fontes técnicas homologadas · geração rastreada · revisão profissional obrigatória.
          </div>

          <p className="narrative-summary">{latest.responsePayload.prescription.summary}</p>

          {latest.responsePayload.prescription.diagnosis.length > 0 && (
            <div className="narrative-block">
              <h4>Diagnóstico por parâmetro</h4>
              <ul>{latest.responsePayload.prescription.diagnosis.map((item, i) => <li key={i}><strong>{item.parameterCode}</strong> — {item.value} {item.unit} · {item.interpretation}<br/><small>{item.rationale}</small></li>)}</ul>
            </div>
          )}

          {latest.responsePayload.prescription.recommendations.length > 0 ? (
            <div className="narrative-block">
              <h4>Plano de manejo proposto</h4>
              <ul>{latest.responsePayload.prescription.recommendations.map((item, i) => <li key={i}><strong>{item.inputType}</strong> — {item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {item.unit}<br/><small>{item.rationale}</small></li>)}</ul>
            </div>
          ) : (
            <div className="narrative-block attention"><h4><Icon name="warning" size={12}/> Sem dose inventada</h4><p>As fontes disponíveis não sustentaram uma dose numérica para esta geração. A RAIZ manteve a lacuna explícita em vez de fabricar uma recomendação.</p></div>
          )}

          {latest.responsePayload.prescription.managementPractices.length > 0 && (
            <div className="narrative-block"><h4>Práticas de manejo</h4><ul>{latest.responsePayload.prescription.managementPractices.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}

          {latest.responsePayload.prescription.missingInformation.length > 0 && (
            <div className="narrative-block attention"><h4><Icon name="warning" size={12}/> Informação necessária para fechar a decisão</h4><ul>{latest.responsePayload.prescription.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}

          {latest.responsePayload.prescription.sources.length > 0 && (
            <div className="narrative-block muted"><h4>Base técnica utilizada</h4><ul>{latest.responsePayload.prescription.sources.map((item, i) => <li key={i}>{item.title}{item.institution ? ` — ${item.institution}` : ""}{item.url ? <> · <a href={item.url} target="_blank" rel="noreferrer">fonte</a></> : ""}</li>)}</ul></div>
          )}

          {latest.reviewerNote && <p className="narrative-reviewer-note"><strong>Observação do revisor{latest.reviewedByName ? ` (${latest.reviewedByName})` : ""}:</strong> {latest.reviewerNote}</p>}

          {prescriptionStale && canRun && (
            <button className="button secondary" disabled={busy || monthlyLimitReached || !readyToGenerate} onClick={() => void generate()}>{busy ? "Gerando…" : monthlyLimitReached ? "Limite mensal atingido" : readyToGenerate ? "Gerar nova versão com contexto atual" : "Interpretação precisa estar aprovada"}</button>
          )}

          {canReview && latest.status === "PENDING_REVIEW" && !prescriptionStale && (
            <div className="narrative-review-form">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observação técnica (opcional)" rows={2}/>
              <div className="narrative-review-actions">
                <button className="button primary" disabled={busy} onClick={() => void review("APPROVED")}>Aprovar e assinar</button>
                <button className="button secondary" disabled={busy} onClick={() => void review("CHANGES_REQUESTED")}>Solicitar ajuste</button>
                <button className="button ghost" disabled={busy} onClick={() => void review("REJECTED")}>Rejeitar</button>
              </div>
            </div>
          )}

          {canRun && latest.status === "CHANGES_REQUESTED" && !prescriptionStale && <button className="button ghost" disabled={busy || monthlyLimitReached || !readyToGenerate} onClick={() => void generate()}>{busy ? "Gerando…" : monthlyLimitReached ? "Limite mensal atingido" : readyToGenerate ? "Gerar nova versão" : "Interpretação precisa estar aprovada"}</button>}

          {history.length > 1 && (
            <details className="agro-history"><summary>Histórico de recomendações ({history.length})</summary>
              <ul>{history.map((item) => <li key={item.id}>{STATUS_META[item.status]?.label ?? item.status} · {new Date(item.createdAt).toLocaleString("pt-BR")}{item.reviewedByName ? ` · ${item.reviewedByName}` : ""}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
