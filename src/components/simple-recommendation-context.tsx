"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { MANAGEMENT_SYSTEM_OPTIONS, normalizeManagementSystem } from "@/domain/management-system";

type Props = {
  cropSeasonId: string;
  blockers: string[];
  yieldGoal: number | null;
  yieldGoalUnit: string | null;
  cultivationOrderAfterSoilAnalysis: number | null;
  cropProfileCode: string | null;
  managementSystem: string | null;
  onSaved: () => Promise<void> | void;
};

export function SimpleRecommendationContext({
  cropSeasonId,
  blockers,
  yieldGoal,
  yieldGoalUnit,
  cultivationOrderAfterSoilAnalysis,
  cropProfileCode,
  managementSystem,
  onSaved,
}: Props) {
  const needsYield = blockers.some((item) => item.startsWith("YIELD_GOAL") || item.startsWith("YIELD_UNIT"));
  const needsOrder = blockers.some((item) => item.startsWith("POST_ANALYSIS_CULTIVATION_ORDER"));
  const needsManagement = cropProfileCode === "SOJA" && normalizeManagementSystem(managementSystem) === "OTHER";
  const missingGroupCount = Number(needsYield) + Number(needsOrder) + Number(needsManagement);
  const [goal, setGoal] = useState(yieldGoal != null && yieldGoal > 0 && yieldGoalUnit?.toLowerCase().includes("t") ? String(yieldGoal) : "");
  const [order, setOrder] = useState(cultivationOrderAfterSoilAnalysis === 1 || cultivationOrderAfterSoilAnalysis === 2 ? String(cultivationOrderAfterSoilAnalysis) : "");
  const canonicalManagement = normalizeManagementSystem(managementSystem);
  const [management, setManagement] = useState(canonicalManagement === "OTHER" ? "" : canonicalManagement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const parsedGoal = Number(goal.replace(",", "."));
    if (needsYield && (!Number.isFinite(parsedGoal) || parsedGoal <= 0)) {
      setError("Informe a meta em toneladas por hectare.");
      return;
    }
    if (needsOrder && order !== "1" && order !== "2") {
      setError("Escolha se esta é a primeira ou a segunda safra após a análise de solo.");
      return;
    }

    if (needsManagement && !management) {
      setError("Escolha o sistema de manejo para calcular a calagem sem assumir contexto.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const patch: Record<string, unknown> = {};
      if (needsYield) {
        patch.yieldGoal = parsedGoal;
        patch.yieldGoalUnit = "t/ha";
      }
      if (needsOrder) patch.cultivationOrderAfterSoilAnalysis = Number(order);
      if (needsManagement) patch.managementSystem = management;

      const response = await fetch(`/api/crop-seasons/${cropSeasonId}/recommendation-context`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar estas informações.");
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar estas informações.");
    } finally {
      setBusy(false);
    }
  }

  if (!needsYield && !needsOrder && !needsManagement) return null;

  return (
    <details className="simple-context-question">
      <summary className="simple-context-question-head">
        <span><Icon name="sparkles" size={18}/></span>
        <div>
          <strong>{needsManagement ? (needsYield || needsOrder ? "Completar contexto das recomendações" : "Concluir decisão de calagem") : "Incluir dose de fósforo e potássio"}</strong>
          <small>
            {needsManagement
              ? "A RAIZ precisa saber o sistema de manejo para aplicar a regra correta de calagem; ela não assume preparo convencional nem estágio do plantio direto."
              : `Opcional. ${missingGroupCount === 1 ? "Falta uma informação" : "Faltam duas informações"} para calcular essas doses. Sem isso, a RAIZ conclui o relatório sem estimar valores.`}
          </small>
        </div>
        <Icon name="chevron" size={15}/>
      </summary>
      <div className="simple-context-fields">
        {needsYield && <label><span>Meta de produtividade</span><div className="simple-context-input"><input inputMode="decimal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Ex.: 4,0"/><b>t/ha</b></div></label>}
        {needsOrder && <label><span>Esta é qual safra depois desta análise de solo?</span><select value={order} onChange={(event) => setOrder(event.target.value)}><option value="">Escolha</option><option value="1">Primeira safra</option><option value="2">Segunda safra</option></select></label>}
        {needsManagement && (
          <label>
            <span>Sistema de manejo do solo</span>
            <select value={management} onChange={(event) => setManagement(event.target.value)}>
              <option value="">Escolha</option>
              {MANAGEMENT_SYSTEM_OPTIONS.filter((option) => option.value !== "OTHER").map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <div className="simple-context-error">{error}</div>}
      <button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : needsManagement ? "Salvar contexto" : "Salvar e incluir dose"}</button>
    </details>
  );
}
