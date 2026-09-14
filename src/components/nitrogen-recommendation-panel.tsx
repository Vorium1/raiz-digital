"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type Context = {
  cornPrecedingClass: string | null;
  plannedPopulationPlantsPerHa: number | null;
  residueClass: string | null;
  residueBiomassTonPerHa: number | null;
  wheatPrecedingCrop: string | null;
  lateQualityNitrogenRequested: boolean | null;
  pastureType: string | null;
  targetDryMatterTonPerHa: number | null;
  precedingLegume: boolean | null;
  effectiveLegumeInoculation: boolean | null;
  provenLegumeInoculationFailure: boolean | null;
  numberOfUses: number | null;
  updatedAt: string | null;
};

type Recommendation = {
  crop: string;
  status: "READY_FOR_IMPLEMENTATION" | "REQUIRES_AGRONOMIST_REVIEW";
  dose:
    | { kind: "EXACT"; kgNPerHa: number }
    | { kind: "RANGE"; minKgNPerHa: number; maxKgNPerHa: number }
    | { kind: "BLOCKED"; reason: string };
  sowingRangeKgNPerHa: { min: number; max: number } | null;
  blockers: string[];
  notes: string[];
  source: string;
};

type Workspace = {
  analysisId: string;
  cropSeasonId: string;
  targetCropRaw: string | null;
  targetCropSource: "NEXT_CROP" | "CURRENT_CROP" | "MISSING";
  yieldGoal: number | null;
  yieldGoalUnit: string | null;
  context: Context;
  organicMatter: {
    resultCount: number;
    percentResultCount: number;
    valuesPct: number[];
    units: string[];
    methods: string[];
  };
  readiness: {
    ready: boolean;
    blockers: string[];
    normalized: {
      targetCrop: "MILHO" | "TRIGO" | "CANOLA" | "PASTAGEM_INVERNO" | null;
      targetYieldTonPerHa: number | null;
      representativeOrganicMatterPct: number | null;
      organicMatterBand: string | null;
      targetDryMatterTonPerHa: number | null;
    };
  };
  recommendationPreview: Recommendation | null;
};

const BLOCKER_LABELS: Record<string, string> = {
  TARGET_CROP_UNSUPPORTED: "A cultura-alvo ainda não possui regra automática de N homologada neste módulo.",
  YIELD_GOAL_MISSING: "Informe a meta produtiva da safra.",
  YIELD_GOAL_INVALID: "A meta produtiva precisa ser maior que zero.",
  YIELD_UNIT_MISSING: "Informe a unidade da meta produtiva.",
  YIELD_UNIT_UNSUPPORTED: "Para N, a meta precisa estar em t/ha; não há conversão silenciosa de sc/ha.",
  ORGANIC_MATTER_MISSING: "A análise não tem matéria orgânica (OM/MO) utilizável para a regra de N.",
  ORGANIC_MATTER_INVALID: "Existe valor de matéria orgânica inválido.",
  ORGANIC_MATTER_UNIT_UNSUPPORTED: "A unidade de matéria orgânica não está homologada para esta regra; a RAIZ não converte automaticamente.",
  ORGANIC_MATTER_BAND_CONFLICT: "Os pontos de matéria orgânica cruzam classes técnicas diferentes. A RAIZ bloqueia uma dose uniforme automática.",
  CORN_PRECEDING_CLASS_REQUIRED: "Informe a classe da cultura anterior para milho.",
  CORN_POPULATION_REQUIRED: "Informe a população planejada de milho (plantas/ha).",
  CORN_RESIDUE_CLASS_REQUIRED: "Informe a classe de resíduo/cobertura anterior.",
  WHEAT_PRECEDING_CROP_REQUIRED: "Informe se o trigo sucede soja ou milho.",
  PASTURE_TYPE_REQUIRED: "Informe o tipo de pastagem de inverno.",
  PASTURE_DRY_MATTER_TARGET_REQUIRED: "Informe a meta de matéria seca (t MS/ha).",
  PASTURE_PRECEDING_LEGUME_REQUIRED: "Informe se a cultura anterior foi leguminosa.",
  PASTURE_LEGUME_INOCULATION_STATUS_REQUIRED: "Para pastagem leguminosa, confirme inoculação eficaz ou falha comprovada.",
  PASTURE_LEGUME_INOCULATION_STATUS_CONFLICT: "Inoculação eficaz e falha comprovada não podem estar marcadas ao mesmo tempo.",
  PASTURE_NUMBER_OF_USES_REQUIRED: "Com falha de inoculação comprovada, informe o número de usos/cortes/pastejos.",
};

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolOrNull(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function doseLabel(recommendation: Recommendation) {
  if (recommendation.dose.kind === "EXACT") return `${recommendation.dose.kgNPerHa} kg N/ha`;
  if (recommendation.dose.kind === "RANGE") return `${recommendation.dose.minKgNPerHa}–${recommendation.dose.maxKgNPerHa} kg N/ha`;
  return "Bloqueado para decisão profissional";
}

export function NitrogenRecommendationPanel({ analysisId, canRun }: { analysisId: string; canRun: boolean }) {
  const [workspace, setWorkspace] = useState<Workspace | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [lastExecutionId, setLastExecutionId] = useState<string | null>(null);

  const [yieldGoal, setYieldGoal] = useState("");
  const [cornPrecedingClass, setCornPrecedingClass] = useState("");
  const [population, setPopulation] = useState("");
  const [residueClass, setResidueClass] = useState("");
  const [residueBiomass, setResidueBiomass] = useState("");
  const [wheatPrecedingCrop, setWheatPrecedingCrop] = useState("");
  const [lateQualityN, setLateQualityN] = useState(false);
  const [pastureType, setPastureType] = useState("");
  const [dryMatterTarget, setDryMatterTarget] = useState("");
  const [precedingLegume, setPrecedingLegume] = useState("");
  const [inoculationStatus, setInoculationStatus] = useState("");
  const [numberOfUses, setNumberOfUses] = useState("");

  async function fetchWorkspace() {
    const response = await fetch(`/api/analyses/${analysisId}/nitrogen-recommendation`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Falha ao carregar o módulo de N.");
    setWorkspace(data.workspace ?? null);
    return (data.workspace ?? null) as Workspace | null;
  }

  useEffect(() => {
    void fetchWorkspace().catch((error) => {
      setWorkspace(null);
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao carregar o módulo de N." });
    });
  }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!workspace) return;
    const c = workspace.context;
    setYieldGoal(workspace.yieldGoal == null ? "" : String(workspace.yieldGoal));
    setCornPrecedingClass(c.cornPrecedingClass ?? "");
    setPopulation(c.plannedPopulationPlantsPerHa == null ? "" : String(c.plannedPopulationPlantsPerHa));
    setResidueClass(c.residueClass ?? "");
    setResidueBiomass(c.residueBiomassTonPerHa == null ? "" : String(c.residueBiomassTonPerHa));
    setWheatPrecedingCrop(c.wheatPrecedingCrop ?? "");
    setLateQualityN(c.lateQualityNitrogenRequested === true);
    setPastureType(c.pastureType ?? "");
    setDryMatterTarget(c.targetDryMatterTonPerHa == null ? "" : String(c.targetDryMatterTonPerHa));
    setPrecedingLegume(c.precedingLegume == null ? "" : String(c.precedingLegume));
    setInoculationStatus(c.effectiveLegumeInoculation === true ? "effective" : c.provenLegumeInoculationFailure === true ? "failure" : "");
    setNumberOfUses(c.numberOfUses == null ? "" : String(c.numberOfUses));
  }, [workspace]);

  async function executeCalculation() {
    const response = await fetch(`/api/analyses/${analysisId}/nitrogen-recommendation`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "O cálculo de N permaneceu bloqueado.");
    setLastExecutionId(data.result?.execution?.id ?? null);
    return data.result;
  }

  async function saveContext() {
    if (!workspace) return;
    const crop = workspace.readiness.normalized.targetCrop;
    setBusy(true); setMessage(null);
    try {
      if (crop && crop !== "PASTAGEM_INVERNO") {
        const target = Number(yieldGoal);
        if (!Number.isFinite(target) || target <= 0) throw new Error("Informe uma meta produtiva válida em t/ha.");
        const response = await fetch(`/api/crop-seasons/${workspace.cropSeasonId}/recommendation-context`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ yieldGoal: target, yieldGoalUnit: "t/ha" }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Falha ao salvar a meta produtiva.");
      }

      const patch: Record<string, unknown> = {};
      if (crop === "MILHO") {
        patch.cornPrecedingClass = cornPrecedingClass || null;
        patch.plannedPopulationPlantsPerHa = numberOrNull(population);
        patch.residueClass = residueClass || null;
        patch.residueBiomassTonPerHa = numberOrNull(residueBiomass);
      } else if (crop === "TRIGO") {
        patch.wheatPrecedingCrop = wheatPrecedingCrop || null;
        patch.lateQualityNitrogenRequested = lateQualityN;
      } else if (crop === "PASTAGEM_INVERNO") {
        patch.pastureType = pastureType || null;
        patch.targetDryMatterTonPerHa = numberOrNull(dryMatterTarget);
        patch.precedingLegume = boolOrNull(precedingLegume);
        patch.effectiveLegumeInoculation = inoculationStatus === "effective" ? true : inoculationStatus === "failure" ? false : null;
        patch.provenLegumeInoculationFailure = inoculationStatus === "failure" ? true : inoculationStatus === "effective" ? false : null;
        patch.numberOfUses = numberOrNull(numberOfUses);
      }

      const response = await fetch(`/api/analyses/${analysisId}/nitrogen-recommendation`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar o contexto de N.");
      setWorkspace(data.workspace ?? null);

      if (data.workspace?.readiness?.ready) {
        await executeCalculation();
        await fetchWorkspace();
        setMessage({ tone: "success", text: "Contexto salvo e cálculo determinístico de N registrado com rastreabilidade." });
      } else {
        setMessage({ tone: "success", text: "Contexto salvo. A RAIZ ainda mantém o cálculo de N bloqueado pelos campos/evidências listados abaixo." });
      }
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao salvar o contexto de N." });
    } finally {
      setBusy(false);
    }
  }

  async function calculate() {
    setBusy(true); setMessage(null);
    try {
      await executeCalculation();
      await fetchWorkspace();
      setMessage({ tone: "success", text: "Cálculo determinístico de N registrado. Ele continua separado da aprovação profissional da recomendação oficial." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao calcular N." });
    } finally {
      setBusy(false);
    }
  }

  if (workspace === undefined) return <div className="agro-loading"><Icon name="clock" size={13}/>Carregando módulo de nitrogênio…</div>;
  if (!workspace) return message ? <div className="agro-message danger"><Icon name="warning" size={14}/><span>{message.text}</span></div> : null;

  const crop = workspace.readiness.normalized.targetCrop;
  if (!crop && workspace.readiness.blockers.length === 1 && workspace.readiness.blockers[0] === "TARGET_CROP_UNSUPPORTED") return null;
  const recommendation = workspace.recommendationPreview;

  return (
    <div className="narrative-block" style={{ marginBottom: 12 }}>
      <div className="narrative-panel-head">
        <div><span className="eyebrow">NITROGÊNIO · MOTOR DETERMINÍSTICO</span><h3>Contexto mínimo e dose rastreável</h3></div>
        <StatusBadge tone={workspace.readiness.ready ? "success" : "waiting"}>{workspace.readiness.ready ? "Pronto para calcular" : "Contexto incompleto"}</StatusBadge>
      </div>

      <p className="report-empty-note" style={{ margin: "0 0 10px" }}>
        Cultura-alvo: <strong>{workspace.targetCropRaw ?? "não informada"}</strong> ({workspace.targetCropSource === "NEXT_CROP" ? "próxima cultura" : workspace.targetCropSource === "CURRENT_CROP" ? "cultura atual" : "origem não definida"}). A RAIZ usa a matéria orgânica real do laudo e não converte unidade nem reduz classes conflitantes a uma média silenciosa.
      </p>

      <div className="review-grid" style={{ marginBottom: 10 }}>
        <div className="review-summary"><span>Matéria orgânica</span><strong>{workspace.readiness.normalized.representativeOrganicMatterPct == null ? "—" : `${workspace.readiness.normalized.representativeOrganicMatterPct.toFixed(2)} %`}</strong><small>{workspace.organicMatter.percentResultCount}/{workspace.organicMatter.resultCount} resultados em unidade %</small></div>
        {crop !== "PASTAGEM_INVERNO" && <div className="review-summary"><span>Meta produtiva</span><strong>{workspace.yieldGoal ?? "—"} {workspace.yieldGoalUnit ?? ""}</strong><small>O motor aceita t/ha sem conversão implícita.</small></div>}
        {recommendation && <div className="review-summary"><span>Prévia determinística</span><strong>{doseLabel(recommendation)}</strong><small>{recommendation.status === "READY_FOR_IMPLEMENTATION" ? "Regra pronta; aprovação profissional continua separada." : "Execução exige revisão agronômica."}</small></div>}
      </div>

      {workspace.readiness.blockers.length > 0 && (
        <div className="agro-message waiting" style={{ marginBottom: 10 }}><Icon name="warning" size={14}/><span><strong>Falta fechar:</strong> {workspace.readiness.blockers.map((blocker) => BLOCKER_LABELS[blocker] ?? blocker).join(" ")}</span></div>
      )}

      {message && <div className={`agro-message ${message.tone}`} style={{ marginBottom: 10 }}><Icon name={message.tone === "success" ? "check" : "warning"} size={14}/><span>{message.text}</span></div>}
      {lastExecutionId && <p className="audit-hint"><Icon name="history" size={12}/>Execução registrada: {lastExecutionId.slice(0, 8)}…</p>}

      {canRun && crop && (
        <details open={!workspace.readiness.ready}>
          <summary>Preencher/atualizar somente os dados exigidos para N</summary>
          <div className="narrative-review-form" style={{ marginTop: 10 }}>
            <div className="review-grid">
              {crop !== "PASTAGEM_INVERNO" && <label className="review-summary"><span>Meta produtiva</span><input type="number" min="0.1" step="0.1" inputMode="decimal" value={yieldGoal} onChange={(event) => setYieldGoal(event.target.value)} placeholder="Ex.: 6.0"/><small>t/ha</small></label>}

              {crop === "MILHO" && <>
                <label className="review-summary"><span>Cultura anterior</span><select value={cornPrecedingClass} onChange={(event) => setCornPrecedingClass(event.target.value)}><option value="">Selecione</option><option value="LEGUME_OR_FALLOW">Leguminosa ou pousio</option><option value="GRASS">Gramínea</option><option value="GRASS_SUCCESSION">Sucessão de gramíneas</option></select></label>
                <label className="review-summary"><span>População planejada</span><input type="number" min="1" step="1000" value={population} onChange={(event) => setPopulation(event.target.value)} placeholder="Ex.: 70000"/><small>plantas/ha</small></label>
                <label className="review-summary"><span>Resíduo/cobertura</span><select value={residueClass} onChange={(event) => setResidueClass(event.target.value)}><option value="">Selecione</option><option value="LEGUME">Leguminosa</option><option value="GRASS">Gramínea</option><option value="UNKNOWN">Não definido</option></select></label>
                <label className="review-summary"><span>Biomassa de resíduo</span><input type="number" min="0" step="0.1" value={residueBiomass} onChange={(event) => setResidueBiomass(event.target.value)} placeholder="Opcional"/><small>t/ha · se informada, combinações de alto rendimento podem exigir revisão.</small></label>
              </>}

              {crop === "TRIGO" && <>
                <label className="review-summary"><span>Cultura anterior</span><select value={wheatPrecedingCrop} onChange={(event) => setWheatPrecedingCrop(event.target.value)}><option value="">Selecione</option><option value="SOY">Soja</option><option value="CORN">Milho</option></select></label>
                <label className="review-summary"><span>N tardio para proteína</span><select value={String(lateQualityN)} onChange={(event) => setLateQualityN(event.target.value === "true")}><option value="false">Não</option><option value="true">Sim — exigir revisão específica</option></select></label>
              </>}

              {crop === "PASTAGEM_INVERNO" && <>
                <label className="review-summary"><span>Tipo de pastagem</span><select value={pastureType} onChange={(event) => setPastureType(event.target.value)}><option value="">Selecione</option><option value="ANNUAL_GRASS">Gramínea anual</option><option value="PERENNIAL_GRASS">Gramínea perene</option><option value="LEGUME">Leguminosa</option></select></label>
                <label className="review-summary"><span>Meta de matéria seca</span><input type="number" min="0.1" step="0.1" value={dryMatterTarget} onChange={(event) => setDryMatterTarget(event.target.value)} placeholder="Ex.: 6.0"/><small>t MS/ha</small></label>
                <label className="review-summary"><span>Cultura anterior leguminosa?</span><select value={precedingLegume} onChange={(event) => setPrecedingLegume(event.target.value)}><option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option></select></label>
                {pastureType === "LEGUME" && <label className="review-summary"><span>Inoculação</span><select value={inoculationStatus} onChange={(event) => setInoculationStatus(event.target.value)}><option value="">Selecione</option><option value="effective">Eficaz/confirmada</option><option value="failure">Falha comprovada</option></select></label>}
                {pastureType === "LEGUME" && inoculationStatus === "failure" && <label className="review-summary"><span>Número de usos</span><input type="number" min="0" step="1" value={numberOfUses} onChange={(event) => setNumberOfUses(event.target.value)} placeholder="Ex.: 4"/><small>cortes/pastejos/usos</small></label>}
              </>}
            </div>
            <div className="narrative-review-actions"><button className="button secondary" disabled={busy} onClick={() => void saveContext()}>{busy ? "Processando…" : "Salvar contexto e recalcular automaticamente"}</button></div>
          </div>
        </details>
      )}

      {canRun && workspace.readiness.ready && <div className="narrative-review-actions" style={{ marginTop: 10 }}><button className="button ghost" disabled={busy} onClick={() => void calculate()}>{busy ? "Calculando…" : "Registrar novo cálculo rastreável"}</button></div>}

      {recommendation && <div className="narrative-block muted" style={{ marginTop: 10 }}><h4>Base técnica</h4><p style={{ margin: 0 }}>{recommendation.source}</p>{recommendation.sowingRangeKgNPerHa && <p style={{ margin: "6px 0 0" }}>Semeadura: {recommendation.sowingRangeKgNPerHa.min}–{recommendation.sowingRangeKgNPerHa.max} kg N/ha.</p>}{recommendation.notes.length > 0 && <ul>{recommendation.notes.map((note) => <li key={note}>{note}</li>)}</ul>}</div>}
    </div>
  );
}
