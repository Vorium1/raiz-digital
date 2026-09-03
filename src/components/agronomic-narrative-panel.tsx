"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type AgronomicNarrative = {
  summary: string;
  observations: string[];
  trends: string[];
  attentionPoints: string[];
  missingInformation: string[];
  technicalReferences: string[];
  requiresProfessionalReview: boolean;
};

type Generation = {
  id: string;
  provider: string;
  model: string;
  status: "PENDING_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  reviewerNote: string | null;
  reviewedByName: string | null;
  createdAt: string;
  responsePayload: { narrative: AgronomicNarrative; isRealLanguageModel: boolean };
};

type HistoryEntry = { id: string; status: string; createdAt: string; reviewedByName: string | null };

const STATUS_META: Record<string, { label: string; tone: "success" | "review" | "waiting" | "danger" }> = {
  PENDING_REVIEW: { label: "Aguardando revisão profissional", tone: "waiting" },
  APPROVED: { label: "Aprovada", tone: "success" },
  CHANGES_REQUESTED: { label: "Ajuste solicitado", tone: "review" },
  REJECTED: { label: "Rejeitada", tone: "danger" },
};

/**
 * "Síntese assistida por IA" — visualmente separada dos fatos (laudo) e da
 * interpretação técnica (motor determinístico), como pedido: dado real,
 * classificação do motor e texto de IA nunca se misturam na tela.
 */
export function AgronomicNarrativePanel({ analysisId, hasClassifications, canRun, canReview }: { analysisId: string; hasClassifications: boolean; canRun: boolean; canReview: boolean }) {
  const [latest, setLatest] = useState<Generation | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function load() {
    const response = await fetch(`/api/analyses/${analysisId}/agronomic-narrative`);
    const data = await response.json().catch(() => ({}));
    setLatest(data.latest ?? null);
    setHistory(data.history ?? []);
  }

  useEffect(() => { void load(); }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/agronomic-narrative`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao gerar síntese.");
      setMessage({ tone: "success", text: "Síntese gerada — aguardando revisão profissional." });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao gerar síntese." }); }
    finally { setBusy(false); }
  }

  async function review(decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    if (!latest) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/ai-generations/${latest.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao registrar revisão.");
      setNote("");
      setMessage({ tone: "success", text: decision === "APPROVED" ? "Síntese aprovada." : decision === "CHANGES_REQUESTED" ? "Ajuste solicitado ao provedor." : "Síntese rejeitada." });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao registrar revisão." }); }
    finally { setBusy(false); }
  }

  if (!hasClassifications) return null;
  if (latest === undefined) return <div className="agro-loading"><Icon name="clock" size={13}/>Carregando síntese assistida por IA…</div>;

  return (
    <section className="narrative-panel">
      <div className="narrative-panel-head">
        <div><span className="eyebrow">SÍNTESE ASSISTIDA POR IA</span><h3>Explicação em linguagem simples</h3></div>
        {latest && <StatusBadge tone={STATUS_META[latest.status]?.tone ?? "waiting"}>{STATUS_META[latest.status]?.label ?? latest.status}</StatusBadge>}
      </div>

      {message && <div className={`agro-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={14}/><span>{message.text}</span></div>}

      {!latest ? (
        <div className="pending-engine" style={{ margin: 0 }}>
          <Icon name="sparkles" size={22}/>
          <div>
            <p>Nenhuma síntese gerada ainda para esta interpretação.</p>
            {canRun && <button className="button secondary" disabled={busy} onClick={() => void generate()}>{busy ? "Gerando…" : "Gerar síntese explicativa"}</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="narrative-provider-note">
            <Icon name={latest.responsePayload.isRealLanguageModel ? "sparkles" : "shield"} size={13}/>
            {latest.responsePayload.isRealLanguageModel ? `Gerado por ${latest.provider} (${latest.model})` : "Gerado por motor de texto local (sem custo) — reformata os fatos já calculados, não é um modelo de linguagem real ainda."}
          </div>

          <p className="narrative-summary">{latest.responsePayload.narrative.summary}</p>

          {latest.responsePayload.narrative.observations.length > 0 && (
            <div className="narrative-block"><h4>Observações</h4><ul>{latest.responsePayload.narrative.observations.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}
          {latest.responsePayload.narrative.attentionPoints.length > 0 && (
            <div className="narrative-block attention"><h4><Icon name="warning" size={12}/> Pontos de atenção</h4><ul>{latest.responsePayload.narrative.attentionPoints.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}
          {latest.responsePayload.narrative.trends.length > 0 && (
            <div className="narrative-block"><h4>Tendências</h4><ul>{latest.responsePayload.narrative.trends.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}
          {latest.responsePayload.narrative.missingInformation.length > 0 && (
            <div className="narrative-block muted"><h4>Interpretação técnica indisponível</h4><ul>{latest.responsePayload.narrative.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}
          {latest.responsePayload.narrative.technicalReferences.length > 0 && (
            <div className="narrative-block muted"><h4>Fontes técnicas</h4><ul>{latest.responsePayload.narrative.technicalReferences.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          )}

          {latest.reviewerNote && <p className="narrative-reviewer-note"><strong>Observação do revisor{latest.reviewedByName ? ` (${latest.reviewedByName})` : ""}:</strong> {latest.reviewerNote}</p>}

          {canReview && latest.status === "PENDING_REVIEW" && (
            <div className="narrative-review-form">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observação técnica (opcional)" rows={2}/>
              <div className="narrative-review-actions">
                <button className="button primary" disabled={busy} onClick={() => void review("APPROVED")}>Aprovar</button>
                <button className="button secondary" disabled={busy} onClick={() => void review("CHANGES_REQUESTED")}>Solicitar ajuste</button>
                <button className="button ghost" disabled={busy} onClick={() => void review("REJECTED")}>Rejeitar</button>
              </div>
            </div>
          )}

          {canRun && latest.status === "CHANGES_REQUESTED" && <button className="button ghost" disabled={busy} onClick={() => void generate()}>{busy ? "Gerando…" : "Gerar nova versão"}</button>}

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
