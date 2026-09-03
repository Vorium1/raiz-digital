"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { AgronomicNarrativePanel } from "@/components/agronomic-narrative-panel";
import { AgronomicPrescriptionPanel } from "@/components/agronomic-prescription-panel";

type ParameterInterpretation =
  | { sampleCode: string; parameterCode: string; interpretable: true; classification: string; matchedParameter: { id: string; criticality: string | null } }
  | { sampleCode: string; parameterCode: string; interpretable: false; reason: string; code: string };

type Fact = { sampleCode: string; parameterCode: string; value: number; unit: string; method: string };

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
};

type HistoryEntry = { id: string; revision: number; status: string; createdAt: string };

const STATUS_LABEL: Record<string, string> = {
  CALCULATED: "Calculado, sem parâmetro interpretável",
  IN_REVIEW: "Aguardando validação técnica",
  APPROVED: "Aprovada",
  AI_GENERATED: "Narrativa gerada",
  PUBLISHED: "Publicada",
  SUPERSEDED: "Substituída",
};

export function AgronomicIntelligencePanel({ analysisId, canRun, canReview }: { analysisId: string; canRun: boolean; canReview: boolean }) {
  const [latest, setLatest] = useState<Interpretation | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function load() {
    const response = await fetch(`/api/analyses/${analysisId}/interpretation`);
    const data = await response.json().catch(() => ({}));
    setLatest(data.latest ?? null);
    setHistory(data.history ?? []);
  }

  useEffect(() => { void load(); }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (latest === undefined) return <div className="agro-loading"><Icon name="clock" size={15}/>Carregando inteligência agronômica…</div>;

  return (
    <div className="agro-panel">
      {message && <div className={`agro-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={15}/><span>{message.text}</span></div>}

      {!latest ? (
        <div className="pending-engine">
          <Icon name="shield" size={24}/>
          <div>
            <span className="eyebrow">SEM RECOMENDAÇÃO INVENTADA</span>
            <h3>Nenhuma interpretação foi calculada ainda.</h3>
            <p>O motor determinístico lê somente dado persistido: resultados de laboratório reais e o perfil de cultura vinculado à safra. Se faltar contexto, o resultado é explicitamente “não interpretável” — nunca um número aproximado.</p>
            {canRun && <button className="button secondary" disabled={busy} onClick={() => void runEngine()}>{busy ? "Calculando…" : "Rodar motor determinístico"}</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="agro-summary-row">
            <div className="agro-stat"><span>Status</span><strong>{STATUS_LABEL[latest.status] ?? latest.status}</strong></div>
            {latest.structuredOutput?.confidence && <div className="agro-stat"><span>Confiabilidade</span><strong>{latest.structuredOutput.confidence.score}/100</strong><small>{latest.structuredOutput.confidence.level}</small></div>}
            <div className="agro-stat"><span>Base técnica</span><strong>{latest.structuredOutput?.trace.cropProfileCode ?? "—"}</strong><small>{latest.structuredOutput?.trace.cropProfileVersion ? `v${latest.structuredOutput.trace.cropProfileVersion}` : "sem cultura vinculada"}</small></div>
            <div className="agro-stat"><span>Revisão</span><strong>#{latest.revision}</strong><small>{new Date(latest.createdAt).toLocaleString("pt-BR")}</small></div>
          </div>

          {latest.notInterpretableReason && <div className="agro-message danger"><Icon name="warning" size={15}/><span>{latest.notInterpretableReason}</span></div>}

          {latest.structuredOutput && latest.structuredOutput.interpretation.length > 0 && (
            <div className="agro-table-wrap"><table className="agro-table">
              <thead><tr><th>Ponto</th><th>Parâmetro</th><th>Resultado</th><th>Classificação</th></tr></thead>
              <tbody>
                {latest.structuredOutput.interpretation.map((item, index) => {
                  const fact = latest.structuredOutput!.facts.find((f) => f.sampleCode === item.sampleCode && f.parameterCode === item.parameterCode);
                  return (
                    <tr key={index}>
                      <td>{item.sampleCode}</td>
                      <td>{item.parameterCode}</td>
                      <td>{fact ? `${fact.value} ${fact.unit}` : "—"}</td>
                      <td>{item.interpretable ? <StatusBadge tone="success">{item.classification}</StatusBadge> : <StatusBadge tone="waiting"><span title={item.reason}>Não interpretável</span></StatusBadge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}

          <div className="agro-actions">
            {canRun && <button className="button ghost" disabled={busy} onClick={() => void runEngine()}>{busy ? "Recalculando…" : "Recalcular"}</button>}
            {canReview && latest.status === "IN_REVIEW" && <button className="button primary" disabled={busy} onClick={() => void review(true)}>Aprovar interpretação</button>}
            {latest.status === "APPROVED" && <StatusBadge tone="success"><Icon name="check" size={12}/>Aprovada</StatusBadge>}
          </div>

          {history.length > 1 && (
            <details className="agro-history">
              <summary>Histórico de revisões ({history.length})</summary>
              <ul>{history.map((item) => <li key={item.id}>#{item.revision} · {STATUS_LABEL[item.status] ?? item.status} · {new Date(item.createdAt).toLocaleString("pt-BR")}</li>)}</ul>
            </details>
          )}

          <AgronomicNarrativePanel analysisId={analysisId} hasClassifications={Boolean(latest.structuredOutput?.interpretation.length)} canRun={canRun} canReview={canReview}/>
          <AgronomicPrescriptionPanel analysisId={analysisId} hasLabResults={Boolean(latest.structuredOutput?.facts.length)} canRun={canRun} canReview={canReview}/>
        </>
      )}
    </div>
  );
}
