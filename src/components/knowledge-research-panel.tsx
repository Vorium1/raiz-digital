"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

type PerCropSummary = { cropCode: string; cropName: string; sourcesCreated: number; error: string | null };
type LastRun = {
  id: string;
  createdAt: string;
  tokensUsed: number | null;
  costUsd: number | null;
  responsePayload: { perCrop: PerCropSummary[]; totalSourcesCreated: number };
};

/**
 * Pesquisa periódica da base de conhecimento (não por laudo): o curador
 * decide quando rodar, a IA pesquisa uma vez por cultura cadastrada e
 * grava o que encontrou como fontes técnicas DRAFT, aguardando
 * homologação na seção "Fontes técnicas" logo abaixo -- é ali que o
 * conteúdo pesquisado vira algo que o laudo do dia a dia pode usar.
 */
export function KnowledgeResearchPanel({ canCurate }: { canCurate: boolean }) {
  const [lastRun, setLastRun] = useState<LastRun | null | undefined>(undefined);
  const [cooldownDaysRemaining, setCooldownDaysRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function load() {
    const response = await fetch("/api/knowledge-research");
    const data = await response.json().catch(() => ({}));
    setLastRun(data.lastRun ?? null);
    setCooldownDaysRemaining(data.cooldownDaysRemaining ?? 0);
  }

  useEffect(() => { void load(); }, []);

  async function run(force: boolean) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/knowledge-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao rodar a pesquisa.");
      const total = data.generation?.sourcesCreated ?? 0;
      setMessage({ tone: "success", text: `Pesquisa concluída: ${total} fonte(s) nova(s) criada(s) como rascunho — homologue na seção "Fontes técnicas" abaixo.` });
      await load();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao rodar a pesquisa." }); }
    finally { setBusy(false); }
  }

  if (!canCurate) return null;
  if (lastRun === undefined) return null;

  return (
    <details><summary><span><b>0</b><strong>Pesquisa periódica</strong><small>Atualiza a base de conhecimento — não roda a cada laudo</small></span><Icon name="chevron" size={16}/></summary>
      <div className="field-ops-form">
        {message && <div className={`field-ops-wide field-ops-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={17}/><span>{message.text}</span></div>}
        <div className="field-ops-wide">
          {lastRun ? (
            <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--muted)" }}>
              Última pesquisa: {new Date(lastRun.createdAt).toLocaleString("pt-BR")} · {lastRun.responsePayload.totalSourcesCreated} fonte(s) criada(s)
              {lastRun.responsePayload.perCrop.some((c) => c.error) ? ` · atenção: ${lastRun.responsePayload.perCrop.filter((c) => c.error).length} cultura(s) falharam` : ""}
            </p>
          ) : (
            <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--muted)" }}>Nenhuma pesquisa rodada ainda.</p>
          )}
        </div>
        <div className="field-ops-wide form-submit" style={{ gap: 10 }}>
          {cooldownDaysRemaining > 0 && <button className="button ghost" disabled={busy} onClick={() => void run(true)}>{busy ? "Pesquisando…" : `Forçar agora (cooldown: ${cooldownDaysRemaining}d)`}</button>}
          <button className="button secondary" disabled={busy || cooldownDaysRemaining > 0} onClick={() => void run(false)}>{busy ? "Pesquisando…" : "Rodar pesquisa agora"}</button>
        </div>
      </div>
    </details>
  );
}
