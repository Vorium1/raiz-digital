"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { ParameterComparisonTable } from "@/components/comparison-explorer";
import styles from "./historical-comparison-explorer.module.css";

type FieldOption = { id: string; name: string };
type Candidate = {
  id: string;
  code: string;
  fieldId: string;
  fieldName: string;
  seasonLabel: string;
  collectionOrderId: string;
  collectionOrderCode: string;
  createdAt: string;
  firstCollectedAt: string | null;
  lastCollectedAt: string | null;
  evidenceAt: string;
  evidenceDateSource: "COLLECTION" | "ANALYSIS_CREATED_AT";
};

type HistoryResult = {
  field: { id: string; name: string };
  labelA: string;
  labelB: string;
  analysisA: Candidate;
  analysisB: Candidate;
  inputOrderReversed: boolean;
  rows: any[];
  spatialContext: {
    sameField: true;
    pointCountA: number;
    pointCountB: number;
    exactPointLayoutMatch: boolean;
    note: string;
  };
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Não registrada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

function candidateLabel(candidate: Candidate) {
  const source = candidate.evidenceDateSource === "COLLECTION" ? "coleta" : "cadastro";
  return `${formatDate(candidate.evidenceAt)} · ${candidate.seasonLabel} · ${candidate.code} · ${source}`;
}

export function HistoricalComparisonExplorer() {
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [fieldId, setFieldId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analysisA, setAnalysisA] = useState("");
  const [analysisB, setAnalysisB] = useState("");
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/context", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar os talhões.");
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const nextFields = (payload.fields ?? []) as FieldOption[];
        setFields(nextFields);
        setFieldId((current) => current || nextFields[0]?.id || "");
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Falha ao carregar talhões.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!fieldId) {
      setCandidates([]);
      setAnalysisA("");
      setAnalysisB("");
      setResult(null);
      setLoadingCandidates(false);
      return;
    }
    const controller = new AbortController();
    setLoadingCandidates(true);
    setError("");
    setResult(null);
    void fetch(`/api/comparisons/history?fieldId=${encodeURIComponent(fieldId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o histórico do talhão.");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const next = (payload.analyses ?? []) as Candidate[];
        setCandidates(next);
        setAnalysisB(next[0]?.id ?? "");
        setAnalysisA(next[1]?.id ?? "");
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Falha ao carregar histórico.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCandidates(false);
      });
    return () => controller.abort();
  }, [fieldId]);

  useEffect(() => {
    if (!analysisA || !analysisB || analysisA === analysisB) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    setLoadingComparison(true);
    setError("");
    void fetch(`/api/comparisons?mode=history&a=${encodeURIComponent(analysisA)}&b=${encodeURIComponent(analysisB)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível comparar as duas evidências.");
        return payload as HistoryResult;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setResult(payload);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setResult(null);
          setError(caught instanceof Error ? caught.message : "Falha ao comparar histórico.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingComparison(false);
      });
    return () => controller.abort();
  }, [analysisA, analysisB]);

  const selectedField = useMemo(() => fields.find((field) => field.id === fieldId) ?? null, [fields, fieldId]);

  if (loadingCandidates && fields.length === 0) {
    return <div className={styles.empty}><Icon name="clock" size={18}/><span>Carregando histórico real…</span></div>;
  }

  if (fields.length === 0) {
    return <div className={styles.empty}><Icon name="history" size={22}/><strong>Nenhum talhão disponível para histórico.</strong></div>;
  }

  return (
    <section className={styles.shell} aria-label="Histórico comparável real" data-testid="historical-comparison-explorer">
      <div className={styles.toolbar}>
        <label>
          <span>Talhão</span>
          <select value={fieldId} onChange={(event) => setFieldId(event.target.value)}>
            {fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
          </select>
        </label>
        <div className={styles.rule}>
          <Icon name="shield" size={14}/>
          <span>O histórico compara somente coletas distintas do mesmo talhão. Delta = B − A; sinal não significa melhora/piora.</span>
        </div>
      </div>

      {error && <div className="agro-message danger"><Icon name="warning" size={15}/><span>{error}</span></div>}

      {loadingCandidates ? (
        <div className={styles.empty}><Icon name="clock" size={18}/><span>Carregando evidências de {selectedField?.name ?? "talhão"}…</span></div>
      ) : candidates.length < 2 ? (
        <div className={styles.empty}>
          <Icon name="history" size={22}/>
          <strong>Histórico ainda sem duas coletas reais comparáveis.</strong>
          <small>É necessário ter pelo menos duas coletas distintas com resultados laboratoriais numéricos neste mesmo talhão.</small>
        </div>
      ) : (
        <>
          <div className={styles.pickers}>
            <label>
              <span>Evidência A</span>
              <select value={analysisA} onChange={(event) => setAnalysisA(event.target.value)}>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id} disabled={candidate.id === analysisB}>{candidateLabel(candidate)}</option>
                ))}
              </select>
            </label>
            <Icon name="arrow" size={18}/>
            <label>
              <span>Evidência B</span>
              <select value={analysisB} onChange={(event) => setAnalysisB(event.target.value)}>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id} disabled={candidate.id === analysisA}>{candidateLabel(candidate)}</option>
                ))}
              </select>
            </label>
          </div>

          {loadingComparison && <div className={styles.empty}><Icon name="clock" size={16}/><span>Validando unidade, método, amostra e profundidade…</span></div>}

          {result && !loadingComparison && (
            <div className={styles.result}>
              {result.inputOrderReversed && (
                <p className={styles.orderNote}><Icon name="history" size={13}/>A RAIZ normalizou a ordem: a evidência mais antiga aparece como A e a mais recente como B.</p>
              )}

              <div className={styles.evidenceCards}>
                <article>
                  <span>A · mais antiga</span>
                  <strong>{result.analysisA.code}</strong>
                  <small>{result.analysisA.seasonLabel} · {formatDate(result.analysisA.evidenceAt)}</small>
                  <em>{result.analysisA.collectionOrderCode} · {result.analysisA.evidenceDateSource === "COLLECTION" ? "data de coleta" : "data de cadastro; coleta sem data"}</em>
                </article>
                <article>
                  <span>B · mais recente</span>
                  <strong>{result.analysisB.code}</strong>
                  <small>{result.analysisB.seasonLabel} · {formatDate(result.analysisB.evidenceAt)}</small>
                  <em>{result.analysisB.collectionOrderCode} · {result.analysisB.evidenceDateSource === "COLLECTION" ? "data de coleta" : "data de cadastro; coleta sem data"}</em>
                </article>
              </div>

              <div className={result.spatialContext.exactPointLayoutMatch ? styles.spatialOk : styles.spatialNote}>
                <Icon name={result.spatialContext.exactPointLayoutMatch ? "check" : "warning"} size={14}/>
                <span>{result.spatialContext.note} Pontos: {result.spatialContext.pointCountA} em A e {result.spatialContext.pointCountB} em B.</span>
              </div>

              <div className="card comparison-result">
                <div className="field-ops-section-head compact">
                  <div><span className="eyebrow">DELTA COMPATÍVEL · DADO REAL</span><h2>{result.labelA} × {result.labelB}</h2></div>
                </div>
                <ParameterComparisonTable rows={result.rows ?? []} labelA="A · antiga" labelB="B · recente"/>
              </div>

              <p className={styles.footerNote}>
                Duas medições permitem comparar essas duas evidências; sozinhas, não estabelecem tendência, causa ou resposta a manejo. Classificações só aparecem quando a interpretação aprovada ainda representa a evidência corrente.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
