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

const STATUS_META: Record<string, { label: string; tone: "success" | "review" | "waiting" | "danger" }> = {
  PENDING_REVIEW: { label: "Sugestão de IA — aguardando revisão profissional", tone: "waiting" },
  APPROVED: { label: "Aprovada — virou recomendação oficial", tone: "success" },
  CHANGES_REQUESTED: { label: "Ajuste solicitado", tone: "review" },
  REJECTED: { label: "Rejeitada", tone: "danger" },
};

/**
 * Prescrição gerada por IA: diagnóstico + dose de insumo com justificativa
 * por decisão. Nasce sempre marcada como sugestão de IA, nunca como fato —
 * só vira recomendação oficial (`input_recommendations`) depois que um
 * agrônomo responsável aprova.
 */
export function AgronomicPrescriptionPanel({ analysisId, hasLabResults, canRun, canReview }: { analysisId: string; hasLabResults: boolean; canRun: boolean; canReview: boolean }) {
  const [latest, setLatest] = useState<Generation | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function load() {
    const response = await fetch(`/api/analyses/${analysisId}/agronomic-prescription`);
    const data = await response.json().catch(() => ({}));
    setLatest(data.latest ?? null);
    setHistory(data.history ?? []);
    setUsage(data.usage ?? null);
  }

  useEffect(() => { void load(); }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/agronomic-prescription`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao gerar prescrição.");
      setMessage({ tone: "success", text: "Prescrição gerada — aguardando revisão profissional." });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao gerar prescrição." }); }
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
      setMessage({ tone: "success", text: decision === "APPROVED" ? `Prescrição aprovada${promoted > 0 ? ` — ${promoted} recomendação(ões) oficial(is) registrada(s)` : ""}.` : decision === "CHANGES_REQUESTED" ? "Ajuste solicitado à IA." : "Prescrição rejeitada." });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao registrar revisão." }); }
    finally { setBusy(false); }
  }

  if (!hasLabResults) return null;
  if (latest === undefined) return <div className="agro-loading"><Icon name="clock" size={13}/>Carregando prescrição assistida por IA…</div>;

  return (
    <section className="narrative-panel">
      <div className="narrative-panel-head">
        <div><span className="eyebrow">PRESCRIÇÃO ASSISTIDA POR IA</span><h3>Diagnóstico e manejo — sugestão de agrônomo virtual</h3></div>
        {latest && <StatusBadge tone={STATUS_META[latest.status]?.tone ?? "waiting"}>{STATUS_META[latest.status]?.label ?? latest.status}</StatusBadge>}
      </div>

      {usage && <p className="report-empty-note" style={{ margin: "0 0 10px" }}>Uso deste mês: {usage.usedThisMonth}/{usage.monthlyLimit} prescrições da empresa.</p>}

      {message && <div className={`agro-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={14}/><span>{message.text}</span></div>}

      {!latest ? (
        <div className="pending-engine" style={{ margin: 0 }}>
          <Icon name="sparkles" size={22}/>
          <div>
            <p>Nenhuma prescrição gerada ainda para esta análise.</p>
            {canRun && <button className="button secondary" disabled={busy || Boolean(usage && usage.usedThisMonth >= usage.monthlyLimit)} onClick={() => void generate()}>{busy ? "Gerando…" : usage && usage.usedThisMonth >= usage.monthlyLimit ? "Limite mensal atingido" : "Gerar prescrição com IA"}</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="narrative-provider-note">
            <Icon name="sparkles" size={13}/>
            {`Gerado por ${latest.provider} (${latest.model}) — sugestão de IA, nunca fato oficial até um agrônomo responsável revisar e aprovar.`}
          </div>

          <p className="narrative-summary">{latest.responsePayload.prescription.summary}</p>

          {latest.responsePayload.prescription.diagnosis.length > 0 && (
            <div className="narrative-block">
              <h4>Diagnóstico por parâmetro</h4>
              <ul>{latest.responsePayload.prescription.diagnosis.map((item, i) => <li key={i}><strong>{item.parameterCode}</strong> — {item.value} {item.unit} · {item.interpretation}<br/><small>{item.rationale}</small></li>)}</ul>
            </div>
          )}

          {latest.responsePayload.prescription.recommendations.length > 0 && (
            <div className="narrative-block">
              <h4>Manejo recomendado</h4>
              <ul>{latest.responsePayload.prescription.recommendations.map((item, i) => <li key={i}><strong>{item.inputType}</strong> — {item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {item.unit}<br/><small>{item.rationale}</small></li>)}</ul>
            </div>
          )}

          {latest.responsePayload.prescription.managementPractices.length > 0 && (
            <div className="narrative-block"><h4>Práticas físicas de manejo</h4><ul>{latest.responsePayload.prescription.managementPractices.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}

          {latest.responsePayload.prescription.missingInformation.length > 0 && (
            <div className="narrative-block attention"><h4><Icon name="warning" size={12}/> Informação faltante declarada pela IA</h4><ul>{latest.responsePayload.prescription.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}

          {latest.responsePayload.prescription.sources.length > 0 && (
            <div className="narrative-block muted"><h4>Fontes consultadas</h4><ul>{latest.responsePayload.prescription.sources.map((item, i) => <li key={i}>{item.title}{item.institution ? ` — ${item.institution}` : ""}{item.url ? <> · <a href={item.url} target="_blank" rel="noreferrer">link</a></> : ""}</li>)}</ul></div>
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

          {canRun && latest.status === "CHANGES_REQUESTED" && <button className="button ghost" disabled={busy || Boolean(usage && usage.usedThisMonth >= usage.monthlyLimit)} onClick={() => void generate()}>{busy ? "Gerando…" : usage && usage.usedThisMonth >= usage.monthlyLimit ? "Limite mensal atingido" : "Gerar nova versão"}</button>}

          {history.length > 1 && (
            <details className="agro-history"><summary>Histórico de gerações ({history.length})</summary>
              <ul>{history.map((item) => <li key={item.id}>{STATUS_META[item.status]?.label ?? item.status} · {new Date(item.createdAt).toLocaleString("pt-BR")}{item.reviewedByName ? ` · ${item.reviewedByName}` : ""}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
