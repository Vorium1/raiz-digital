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
type Readiness = { allowed: boolean; reason: string | null; interpretationStatus: string | null; interpretationId: string | null };

const STATUS_META: Record<string, { label: string; tone: "success" | "review" | "waiting" | "danger" }> = {
  PENDING_REVIEW: { label: "Aguardando revisão profissional", tone: "waiting" },
  APPROVED: { label: "Recomendação oficial aprovada", tone: "success" },
  CHANGES_REQUESTED: { label: "Ajuste solicitado", tone: "review" },
  REJECTED: { label: "Rejeitada", tone: "danger" },
};

/**
 * A recomendação assistida só fica disponível depois da interpretação determinística APPROVED. A marca
 * percebida pelo cliente é RAIZ, não o fornecedor de modelo. Provider/model continuam persistidos na
 * auditoria para rastreabilidade e custo, mas não viram argumento comercial nem poluem a decisão técnica.
 */
export function AgronomicPrescriptionPanel({ analysisId, hasLabResults, canRun, canReview }: { analysisId: string; hasLabResults: boolean; canRun: boolean; canReview: boolean }) {
  const [latest, setLatest] = useState<Generation | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
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

  return (
    <section className="narrative-panel">
      <div className="narrative-panel-head">
        <div><span className="eyebrow">RECOMENDAÇÃO ASSISTIDA RAIZ</span><h3>Da interpretação aprovada ao plano de manejo</h3></div>
        {latest && <StatusBadge tone={STATUS_META[latest.status]?.tone ?? "waiting"}>{STATUS_META[latest.status]?.label ?? latest.status}</StatusBadge>}
      </div>

      <p className="report-empty-note" style={{ margin: "0 0 10px" }}>A RAIZ só libera esta etapa depois de uma interpretação determinística aprovada. Toda recomendação gerada continua exigindo revisão profissional antes de virar recomendação oficial.</p>

      {usage && <p className="report-empty-note" style={{ margin: "0 0 10px" }}>Uso assistido da empresa: {usage.usedThisMonth}/{usage.monthlyLimit} gerações neste mês.</p>}

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

          {canReview && latest.status === "PENDING_REVIEW" && (
            <div className="narrative-review-form">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observação técnica (opcional)" rows={2}/>
              <div className="narrative-review-actions">
                <button className="button primary" disabled={busy} onClick={() => void review("APPROVED")}>Aprovar e assinar</button>
                <button className="button secondary" disabled={busy} onClick={() => void review("CHANGES_REQUESTED")}>Solicitar ajuste</button>
                <button className="button ghost" disabled={busy} onClick={() => void review("REJECTED")}>Rejeitar</button>
              </div>
            </div>
          )}

          {canRun && latest.status === "CHANGES_REQUESTED" && <button className="button ghost" disabled={busy || monthlyLimitReached || !readyToGenerate} onClick={() => void generate()}>{busy ? "Gerando…" : monthlyLimitReached ? "Limite mensal atingido" : readyToGenerate ? "Gerar nova versão" : "Interpretação precisa estar aprovada"}</button>}

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
