import {
  computeDeterministicPkDose,
  computeDeterministicPkPointDoseEnvelope,
  type DeterministicPkDoseDecision,
  type DeterministicPkPointDoseEnvelope,
} from "./uniform-pk-readiness.ts";
import { SOYBEAN_PK_RS_SC_2025_POLICY } from "./soybean-pk-rs-sc-2025.ts";
import { displayYieldFromTonPerHa } from "./yield-goal-presets.ts";

export type ReportFertilityHorizonStage = {
  kind: "CURRENT_CULTIVATION" | "SECOND_CULTIVATION" | "REANALYSIS_CHECKPOINT" | "POST_REANALYSIS_HORIZON";
  label: string;
  cultivationOrder: number | null;
  status: "NUMERIC_READY" | "SPATIAL_READY" | "PARTIAL" | "REANALYSIS_REQUIRED";
  p2o5KgPerHa: number | null;
  k2oKgPerHa: number | null;
  p2o5RangeKgPerHa: { min: number; max: number } | null;
  k2oRangeKgPerHa: { min: number; max: number } | null;
  rationale: string;
};

export type ReportFertilityHorizon = {
  horizonYears: 2 | 3 | 4 | 5;
  targetYieldTonPerHa: number | null;
  targetYieldDisplay: string | null;
  reanalysisAfterCultivations: number;
  stages: ReportFertilityHorizonStage[];
  summary: string;
  notes: string[];
};

function rounded(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : null;
}

function rangeFromEnvelope(envelope: DeterministicPkPointDoseEnvelope | null | undefined) {
  if (!envelope?.ready || envelope.minimumKgPerHa == null || envelope.maximumKgPerHa == null) return null;
  return {
    min: rounded(envelope.minimumKgPerHa) as number,
    max: rounded(envelope.maximumKgPerHa) as number,
  };
}

function resolveDose(
  pointEnvelope: DeterministicPkPointDoseEnvelope | null | undefined,
  uniform: DeterministicPkDoseDecision | null | undefined,
) {
  if (uniform?.ready && uniform.expected && !uniform.expected.isDiscretionaryRange) {
    return {
      dose: rounded(uniform.expected.doseKgPerHa),
      range: {
        min: rounded(uniform.expected.minimumKgPerHa) as number,
        max: rounded(uniform.expected.maximumKgPerHa) as number,
      },
      basis: "UNIFORM_CLASS" as const,
    };
  }
  const pointRange = rangeFromEnvelope(pointEnvelope);
  if (pointEnvelope?.ready && pointRange) {
    return {
      dose: null,
      range: pointRange,
      basis: "POINT_RANGE" as const,
    };
  }
  return { dose: null, range: null, basis: null };
}

function yieldDisplay(cropCode: string, targetYieldTonPerHa: number | null) {
  if (targetYieldTonPerHa == null) return null;
  const display = displayYieldFromTonPerHa(cropCode, targetYieldTonPerHa);
  if (display == null) return `${targetYieldTonPerHa.toLocaleString("pt-BR")} t/ha`;
  return `${display.toLocaleString("pt-BR")} sc/ha (${targetYieldTonPerHa.toLocaleString("pt-BR")} t/ha)`;
}

/**
 * Plano de horizonte para o relatório.
 *
 * Não projeta produtividade. Para soja RS/SC, a publicação corrente determina
 * nova análise após dois cultivos. Por isso o RAIZ pode mostrar números do
 * primeiro e do segundo cultivo quando a evidência permite, mas nunca carrega
 * cegamente a mesma dose para anos posteriores.
 */
export function buildReportFertilityHorizon(input: {
  horizonYears: 2 | 3 | 4 | 5 | null;
  cropCode: string | null | undefined;
  interpretation: unknown;
  targetYieldTonPerHa: number | null | undefined;
  targetYieldUnit: string | null | undefined;
  cultivationOrderAfterSoilAnalysis: number | null | undefined;
  currentPkPointDoses: Record<"P2O5" | "K2O", DeterministicPkPointDoseEnvelope>;
  currentPkDoses: Record<"P2O5" | "K2O", DeterministicPkDoseDecision>;
}): ReportFertilityHorizon | null {
  if (input.horizonYears == null) return null;
  const cropCode = input.cropCode?.trim().toUpperCase() ?? "";
  if (cropCode !== "SOJA") return null;

  const currentOrder = input.cultivationOrderAfterSoilAnalysis;
  const currentP = resolveDose(input.currentPkPointDoses.P2O5, input.currentPkDoses.P2O5);
  const currentK = resolveDose(input.currentPkPointDoses.K2O, input.currentPkDoses.K2O);
  const stages: ReportFertilityHorizonStage[] = [];

  stages.push({
    kind: "CURRENT_CULTIVATION",
    label: currentOrder === 2 ? "Cultivo atual · 2º após a análise" : "Cultivo atual · 1º após a análise",
    cultivationOrder: currentOrder === 1 || currentOrder === 2 ? currentOrder : null,
    status: currentP.dose != null && currentK.dose != null
      ? "NUMERIC_READY"
      : (currentP.dose != null || currentP.range) && (currentK.dose != null || currentK.range)
        ? "SPATIAL_READY"
        : "PARTIAL",
    p2o5KgPerHa: currentP.dose,
    k2oKgPerHa: currentK.dose,
    p2o5RangeKgPerHa: currentP.range,
    k2oRangeKgPerHa: currentK.range,
    rationale: currentP.basis === "POINT_RANGE" || currentK.basis === "POINT_RANGE"
      ? "A evidência não sustenta taxa uniforme para todos os nutrientes. O plano preserva a faixa determinística por ponto/zona, sem promover média de amostras como dose uniforme."
      : "A dose corrente usa a decisão determinística uniforme disponível para o talhão.",
  });

  if (currentOrder === 1) {
    const secondPPoints = computeDeterministicPkPointDoseEnvelope({
      cropCode,
      interpretation: input.interpretation,
      yieldGoal: input.targetYieldTonPerHa,
      yieldGoalUnit: input.targetYieldUnit,
      cultivationOrderAfterSoilAnalysis: 2,
      nutrient: "P2O5",
      allowEqualWeightOperationalAverage: false,
    });
    const secondKPoints = computeDeterministicPkPointDoseEnvelope({
      cropCode,
      interpretation: input.interpretation,
      yieldGoal: input.targetYieldTonPerHa,
      yieldGoalUnit: input.targetYieldUnit,
      cultivationOrderAfterSoilAnalysis: 2,
      nutrient: "K2O",
      allowEqualWeightOperationalAverage: false,
    });
    const secondPUniform = computeDeterministicPkDose({
      cropCode,
      interpretation: input.interpretation,
      yieldGoal: input.targetYieldTonPerHa,
      yieldGoalUnit: input.targetYieldUnit,
      cultivationOrderAfterSoilAnalysis: 2,
      nutrient: "P2O5",
    });
    const secondKUniform = computeDeterministicPkDose({
      cropCode,
      interpretation: input.interpretation,
      yieldGoal: input.targetYieldTonPerHa,
      yieldGoalUnit: input.targetYieldUnit,
      cultivationOrderAfterSoilAnalysis: 2,
      nutrient: "K2O",
    });
    const secondP = resolveDose(secondPPoints, secondPUniform);
    const secondK = resolveDose(secondKPoints, secondKUniform);

    stages.push({
      kind: "SECOND_CULTIVATION",
      label: "2º cultivo após esta análise",
      cultivationOrder: 2,
      status: secondP.dose != null && secondK.dose != null
        ? "NUMERIC_READY"
        : (secondP.dose != null || secondP.range) && (secondK.dose != null || secondK.range)
          ? "SPATIAL_READY"
          : "PARTIAL",
      p2o5KgPerHa: secondP.dose,
      k2oKgPerHa: secondK.dose,
      p2o5RangeKgPerHa: secondP.range,
      k2oRangeKgPerHa: secondK.range,
      rationale: "A segunda recomendação usa a coluna de 2º cultivo da mesma regra regional e a mesma meta produtiva informada. Ela não é uma repetição automática da dose do primeiro cultivo.",
    });
  }

  stages.push({
    kind: "REANALYSIS_CHECKPOINT",
    label: `Após o ${SOYBEAN_PK_RS_SC_2025_POLICY.soilReanalysisAfterCultivations}º cultivo`,
    cultivationOrder: SOYBEAN_PK_RS_SC_2025_POLICY.soilReanalysisAfterCultivations,
    status: "REANALYSIS_REQUIRED",
    p2o5KgPerHa: null,
    k2oKgPerHa: null,
    p2o5RangeKgPerHa: null,
    k2oRangeKgPerHa: null,
    rationale: "Fazer nova análise de solo antes de congelar novas doses de P e K. A recomendação não transporta números antigos para um solo que já recebeu dois cultivos e adubações.",
  });

  if (input.horizonYears > 2) {
    stages.push({
      kind: "POST_REANALYSIS_HORIZON",
      label: `Restante do horizonte até ${input.horizonYears} anos`,
      cultivationOrder: null,
      status: "REANALYSIS_REQUIRED",
      p2o5KgPerHa: null,
      k2oKgPerHa: null,
      p2o5RangeKgPerHa: null,
      k2oRangeKgPerHa: null,
      rationale: "Manter a meta como objetivo de planejamento, mas recalcular P/K com a nova análise, cultura e contexto de cada safra. O RAIZ não promete produtividade nem repete a dose anterior por cinco anos.",
    });
  }

  const target = yieldDisplay(cropCode, input.targetYieldTonPerHa ?? null);
  return {
    horizonYears: input.horizonYears,
    targetYieldTonPerHa: input.targetYieldTonPerHa ?? null,
    targetYieldDisplay: target,
    reanalysisAfterCultivations: SOYBEAN_PK_RS_SC_2025_POLICY.soilReanalysisAfterCultivations,
    stages,
    summary: target
      ? `Plano de fertilidade para horizonte de ${input.horizonYears} anos com meta operacional de ${target}. Há dose numérica somente enquanto a análise atual permanece tecnicamente válida; após dois cultivos, a nova análise passa a comandar o restante do ciclo.`
      : `Plano de fertilidade para horizonte de ${input.horizonYears} anos. Após dois cultivos, uma nova análise deve comandar as doses seguintes.`,
    notes: [
      "Meta produtiva é objetivo de manejo, não previsão nem garantia de rendimento.",
      "P e K são recalculados por cultivo; correção e manutenção não são tratadas como uma aplicação única válida por cinco anos.",
      "Mudança de cultura, meta, análise ou evidência invalida a reutilização automática da recomendação anterior.",
    ],
  };
}
