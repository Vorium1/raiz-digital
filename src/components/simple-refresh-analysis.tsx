"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import type { AnalysisEvidenceFreshnessCode } from "@/domain/analysis-evidence-freshness";

const COPY: Record<AnalysisEvidenceFreshnessCode, { title: string; text: string; button: string }> = {
  CURRENT: {
    title: "Análise atualizada",
    text: "Os dados e as regras desta análise estão atuais.",
    button: "Atualizar análise",
  },
  INTERPRETATION_TIMESTAMP_MISSING: {
    title: "Análise precisa ser concluída",
    text: "Os dados já estão aqui. Execute a análise para continuar.",
    button: "Analisar agora",
  },
  INVALID_TRACE_TIMESTAMPS: {
    title: "Precisamos recalcular esta análise",
    text: "A rastreabilidade desta versão não pôde ser confirmada.",
    button: "Recalcular análise",
  },
  LAB_EVIDENCE_CHANGED: {
    title: "Os dados mudaram",
    text: "Há dados mais recentes do que esta análise. Atualize para continuar.",
    button: "Atualizar análise",
  },
  CROP_PROFILE_CHANGED: {
    title: "Perfil agronômico atualizado",
    text: "A safra passou a usar outro perfil agronômico. A RAIZ precisa recalcular esta análise com o perfil atual.",
    button: "Atualizar agora",
  },
  AGRONOMIC_RULES_CHANGED: {
    title: "Atualização disponível",
    text: "A RAIZ encontrou regras agronômicas mais atuais e está atualizando esta análise automaticamente.",
    button: "Atualizar agora",
  },
};

export function SimpleRefreshAnalysis({
  analysisId,
  freshnessCode,
}: {
  analysisId: string;
  freshnessCode: AnalysisEvidenceFreshnessCode;
}) {
  const router = useRouter();
  const copy = COPY[freshnessCode] ?? COPY.INTERPRETATION_TIMESTAMP_MISSING;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshAnalysis(options: { deterministicOnly?: boolean } = {}) {
    setBusy(true);
    setMessage("");
    try {
      const url = options.deterministicOnly
        ? `/api/analyses/${analysisId}/interpret?draft=local`
        : `/api/analyses/${analysisId}/interpret`;
      const response = await fetch(url, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar esta análise.");
      if (payload.prescriptionDraftError) {
        sessionStorage.setItem(`raiz:ux3:auto:${analysisId}`, String(payload.prescriptionDraftError));
      }
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar esta análise.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (freshnessCode !== "AGRONOMIC_RULES_CHANGED" && freshnessCode !== "CROP_PROFILE_CHANGED") return;
    const key = `raiz:ux3:rule-refresh:${analysisId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void refreshAnalysis({ deterministicOnly: true }).then((ok) => {
      if (!ok) sessionStorage.removeItem(key);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, freshnessCode]);

  return (
    <section className="simple-refresh-analysis">
      <span className="simple-refresh-analysis-icon"><Icon name="sparkles" size={22}/></span>
      <div>
        <strong>{copy.title}</strong>
        <p>{copy.text}</p>
        {message && <small role="alert">{message}</small>}
      </div>
      <button type="button" onClick={() => void refreshAnalysis()} disabled={busy}>
        {busy ? "Atualizando…" : copy.button}
        <Icon name="arrow" size={14}/>
      </button>
    </section>
  );
}
