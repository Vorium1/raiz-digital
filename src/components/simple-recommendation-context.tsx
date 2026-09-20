"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { MANAGEMENT_SYSTEM_OPTIONS, normalizeManagementSystem } from "@/domain/management-system";
import { displayYieldFromTonPerHa, manualYieldToTonPerHa, yieldGoalPresetConfig } from "@/domain/yield-goal-presets";

type Props = {
  analysisId: string;
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
  analysisId,
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
  const canonicalManagement = normalizeManagementSystem(managementSystem);
  const showOptionalSoilPrep = cropProfileCode === "SOJA" && canonicalManagement === "OTHER";
  const yieldConfig = useMemo(() => yieldGoalPresetConfig(cropProfileCode), [cropProfileCode]);

  const [goalChoice, setGoalChoice] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [order, setOrder] = useState(
    cultivationOrderAfterSoilAnalysis === 1 || cultivationOrderAfterSoilAnalysis === 2
      ? String(cultivationOrderAfterSoilAnalysis)
      : "",
  );
  const [management, setManagement] = useState(canonicalManagement === "OTHER" ? "" : canonicalManagement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plannedManagement, setPlannedManagement] = useState("");
  const [initialPlannedManagement, setInitialPlannedManagement] = useState("");
  const [plannedLoaded, setPlannedLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setPlannedLoaded(false);
    fetch(`/api/analyses/${analysisId}/planned-management`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o manejo planejado.");
        return String(payload.plannedManagement?.plannedManagementNotes ?? "");
      })
      .then((notes) => {
        if (!alive) return;
        setPlannedManagement(notes);
        setInitialPlannedManagement(notes);
        setPlannedLoaded(true);
      })
      .catch((caught) => {
        if (!alive) return;
        setError(caught instanceof Error ? caught.message : "Não foi possível carregar o manejo planejado.");
        setPlannedLoaded(true);
      });
    return () => { alive = false; };
  }, [analysisId]);

  const selectedPreset = yieldConfig?.presets.find((preset) => preset.id === goalChoice) ?? null;
  const parsedCustomGoal = Number(customGoal.replace(",", "."));
  const customGoalTonPerHa = goalChoice === "CUSTOM"
    ? manualYieldToTonPerHa(cropProfileCode, parsedCustomGoal)
    : null;
  const selectedYieldTonPerHa = selectedPreset?.targetTonPerHa ?? customGoalTonPerHa;
  const yieldDisplayUnit = yieldConfig?.displayUnit ?? "t/ha";

  const managementChanged = Boolean(management) && management !== canonicalManagement;
  const yieldReadyToSave = needsYield && selectedYieldTonPerHa != null;
  const orderReadyToSave = needsOrder && (order === "1" || order === "2");
  const plannedManagementChanged = plannedLoaded
    && plannedManagement.trim() !== initialPlannedManagement.trim();
  const seasonContextChanged = yieldReadyToSave || orderReadyToSave || managementChanged;
  const canSave = seasonContextChanged || plannedManagementChanged;

  async function save() {
    if (!canSave) {
      setError("Escolha pelo menos um refinamento antes de salvar.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (plannedManagementChanged) {
        const plannedResponse = await fetch(`/api/analyses/${analysisId}/planned-management`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plannedManagementNotes: plannedManagement }),
        });
        const plannedPayload = await plannedResponse.json().catch(() => ({}));
        if (!plannedResponse.ok) throw new Error(plannedPayload.error ?? "Não foi possível salvar o manejo planejado.");
        const savedNotes = String(plannedPayload.plannedManagement?.plannedManagementNotes ?? plannedManagement.trim());
        setPlannedManagement(savedNotes);
        setInitialPlannedManagement(savedNotes);
      }

      if (seasonContextChanged) {
        const patch: Record<string, unknown> = {};
        if (yieldReadyToSave && selectedYieldTonPerHa != null) {
          patch.yieldGoal = selectedYieldTonPerHa;
          patch.yieldGoalUnit = "t/ha";
        }
        if (orderReadyToSave) patch.cultivationOrderAfterSoilAnalysis = Number(order);
        if (managementChanged) patch.managementSystem = management;

        const response = await fetch(`/api/crop-seasons/${cropSeasonId}/recommendation-context`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar estas informações.");
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar estas informações.");
    } finally {
      setBusy(false);
    }
  }

  if (!needsYield && !needsOrder && !showOptionalSoilPrep) return null;

  return (
    <details className="simple-context-question">
      <summary className="simple-context-question-head">
        <span><Icon name="sparkles" size={18}/></span>
        <div>
          <strong>Refinar recomendação <small>(opcional)</small></strong>
          <small>
            O laudo pode ser emitido sem estes dados. A meta produtiva melhora o dimensionamento de nutrientes e o preparo do solo refina a calagem.
          </small>
        </div>
        <Icon name="chevron" size={15}/>
      </summary>

      <div className="simple-context-fields">
        <label style={{ gridColumn: "1 / -1" }}>
          <span>Manejo planejado da próxima safra <small>(opcional)</small></span>
          <textarea
            value={plannedManagement}
            onChange={(event) => setPlannedManagement(event.target.value)}
            disabled={!plannedLoaded}
            placeholder="Se já estiver decidido: cultivar, fertilizante/fonte, população, espaçamento, tratamento de sementes, fungicidas, inseticidas, bioinsumos etc. Se ainda não souber, deixe em branco e preencha depois."
            rows={4}
            maxLength={5000}
          />
          <small>Serve para refinar a recomendação e os alertas. Não bloqueia o parecer do solo e não autoriza a IA a alterar doses determinísticas.</small>
        </label>

        {needsYield && (
          <label>
            <span>Quanto pretende colher?</span>
            <select value={goalChoice} onChange={(event) => setGoalChoice(event.target.value)}>
              <option value="">Ainda não definido</option>
              {yieldConfig?.presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
              <option value="CUSTOM">Informar outra meta</option>
            </select>
            <small>{yieldConfig?.helper ?? "Informe a meta quando souber. O parecer do solo não depende dela."}</small>
          </label>
        )}

        {needsYield && goalChoice === "CUSTOM" && (
          <label>
            <span>Meta desejada</span>
            <div className="simple-context-input">
              <input inputMode="decimal" value={customGoal} onChange={(event) => setCustomGoal(event.target.value)} placeholder="Ex.: 75"/>
              <b>{yieldDisplayUnit}</b>
            </div>
          </label>
        )}

        {needsYield && selectedPreset && (
          <small className="simple-review-help">
            O dimensionamento usará o teto da faixa: {displayYieldFromTonPerHa(cropProfileCode, selectedPreset.targetTonPerHa)?.toLocaleString("pt-BR")} {yieldDisplayUnit} ({selectedPreset.targetTonPerHa.toLocaleString("pt-BR")} t/ha).
          </small>
        )}

        {needsOrder && (
          <label>
            <span>Esta é qual safra depois desta análise de solo?</span>
            <select value={order} onChange={(event) => setOrder(event.target.value)}>
              <option value="">Ainda não definido</option>
              <option value="1">Primeira safra</option>
              <option value="2">Segunda safra</option>
            </select>
          </label>
        )}

        {showOptionalSoilPrep && (
          <label>
            <span>Sistema de preparo do solo <small>(opcional)</small></span>
            <select value={management} onChange={(event) => setManagement(event.target.value)}>
              <option value="">Ainda não definido</option>
              {MANAGEMENT_SYSTEM_OPTIONS.filter((option) => option.value !== "OTHER").map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <small>Se ainda não estiver decidido, deixe em branco. O RAIZ mantém o parecer e refina a calagem depois.</small>
          </label>
        )}
      </div>

      {yieldGoal != null && !needsYield && (
        <small className="simple-review-help">Meta atual: {yieldGoal.toLocaleString("pt-BR")} {yieldGoalUnit ?? "t/ha"}.</small>
      )}
      {error && <div className="simple-context-error">{error}</div>}
      <button type="button" onClick={() => void save()} disabled={busy || !canSave}>
        {busy ? "Salvando…" : "Salvar refinamentos"}
      </button>
    </details>
  );
}
