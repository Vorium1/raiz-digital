"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type SourceImport = {
  id: string;
  fileName: string;
  fileSha256: string;
  sourceFormat: string;
  archived: boolean;
  verified: boolean;
  verifiedAt: string | null;
  verifiedByName: string | null;
};

type SourceVerificationStatus = {
  verificationRequired: boolean;
  sourceHumanVerified: boolean;
  canVerify: boolean;
  imports: SourceImport[];
};

export function SourceVerificationPanel({ analysisId }: { analysisId: string }) {
  const [status, setStatus] = useState<SourceVerificationStatus | null>(null);
  const [busyImportId, setBusyImportId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function load() {
    const response = await fetch(`/api/analyses/${analysisId}/source-verification`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar a proveniência do laudo.");
    setStatus(data as SourceVerificationStatus);
  }

  useEffect(() => {
    void load().catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao carregar a proveniência." }));
  }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmSource(importId: string) {
    setBusyImportId(importId);
    setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/source-verification`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível confirmar o arquivo original.");
      setMessage({ tone: "success", text: data.verification?.analysisFullyVerified ? "Arquivo original conferido. A fonte da análise está totalmente confirmada." : "Arquivo original conferido. Ainda há outra importação desta análise pendente de confirmação." });
      await load();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao confirmar o arquivo original." });
    } finally {
      setBusyImportId(null);
    }
  }

  if (!status && !message) return <div className="agro-loading"><Icon name="clock" size={13}/>Carregando proveniência do laudo…</div>;

  return (
    <section className="card">
      <div className="card-header">
        <div><span className="eyebrow">PROVENIÊNCIA DO LAUDO</span><h2>Arquivo original e conferência humana</h2></div>
        {status && <StatusBadge tone={status.sourceHumanVerified ? "success" : status.verificationRequired ? "danger" : "waiting"}>{status.sourceHumanVerified ? "Fonte confirmada" : "Conferência pendente"}</StatusBadge>}
      </div>
      <div className="review-actions">
        <p className="report-empty-note" style={{ marginTop: 0 }}>
          Arquivar o original e confirmar o original são etapas diferentes. A confirmação relê o arquivo bruto, confere o SHA-256 registrado e grava quem conferiu e quando; o arquivo original não é alterado.
        </p>
        {status?.verificationRequired && !status.sourceHumanVerified && (
          <div className="field-ops-inline-warning" style={{ marginBottom: 12 }}><Icon name="warning" size={15}/><span>A política desta empresa exige fonte conferida antes da entrega oficial.</span></div>
        )}
        {message && <div className={`agro-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={14}/><span>{message.text}</span></div>}
        {status && status.imports.length === 0 ? (
          <p className="report-empty-note">Nenhuma importação de laboratório foi registrada para esta análise.</p>
        ) : (
          <div className="field-ops-list">
            {status?.imports.map((item) => (
              <div key={item.id} className="field-ops-list-row">
                <span>
                  <strong>{item.fileName}</strong>
                  <small>{item.sourceFormat} · SHA-256 {item.fileSha256.slice(0, 12)}… · {item.archived ? "original arquivado" : "original sem chave comprovada"}</small>
                  {item.verified && <small>Conferido{item.verifiedByName ? ` por ${item.verifiedByName}` : ""}{item.verifiedAt ? ` em ${new Date(item.verifiedAt).toLocaleString("pt-BR")}` : ""}</small>}
                </span>
                <div className="review-actions" style={{ margin: 0 }}>
                  <StatusBadge tone={item.verified ? "success" : item.archived ? "waiting" : "danger"}>{item.verified ? "Confirmado" : item.archived ? "Aguardando conferência" : "Proveniência incompleta"}</StatusBadge>
                  {status.canVerify && !item.verified && item.archived && (
                    <button className="button secondary small" disabled={busyImportId !== null} onClick={() => void confirmSource(item.id)}>
                      {busyImportId === item.id ? "Conferindo…" : "Confirmar laudo original"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
