import { buildRuleTrace, evaluateAgronomicRuleAutomation } from "./agronomic-rule-catalog.ts";

export type FloodedRiceEstablishmentSystem = "PRE_GERMINATED" | "TRANSPLANTED_SEEDLINGS";
export type FloodedFromStartWaterRegime = "FLOODED_FROM_START";

export const RICE_FLOODED_LIMING_PROFILE = "SOSBAI_2025_ARROZ_INUNDADO_DESDE_INICIO" as const;

function requireReady() {
  const decision = evaluateAgronomicRuleAutomation("CALAGEM-ARROZ-PREG-TRANS-SOSBAI-2025");
  if (!decision.allowed || !decision.rule) {
    throw new Error(`Regra CALAGEM-ARROZ-PREG-TRANS-SOSBAI-2025 não está liberada (${decision.status}).`);
  }
  return buildRuleTrace("CALAGEM-ARROZ-PREG-TRANS-SOSBAI-2025");
}

function finiteInRange(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} deve ser finito entre ${min} e ${max}.`);
  }
}

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} deve ser finito e maior ou igual a zero.`);
}

function finitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} deve ser finito e maior que zero.`);
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * SOSBAI 2025, p.42, Tabela 4.1.
 *
 * Escopo deliberadamente estreito: arroz irrigado em pré-germinado ou transplante de mudas,
 * com inundação desde o início do ciclo. A fonte não recomenda esta calagem para corrigir
 * acidez; ela é usada apenas para possíveis deficiências de Ca/Mg.
 *
 * A função retorna necessidade equivalente para calcário dolomítico PRNT 100%. Qualquer
 * correção para PRNT comercial deve ocorrer em etapa separada e rastreável; não é feita aqui.
 */
export function computeFloodedRiceCaMgLiming(input: {
  profileId: typeof RICE_FLOODED_LIMING_PROFILE;
  establishmentSystem: FloodedRiceEstablishmentSystem;
  waterRegime: FloodedFromStartWaterRegime;
  baseSaturationPct: number;
  ctcPh7CmolcPerDm3: number;
  exchangeableCaCmolcPerDm3: number;
  exchangeableMgCmolcPerDm3: number;
}) {
  const trace = requireReady();

  if (input.profileId !== RICE_FLOODED_LIMING_PROFILE) {
    throw new Error("Perfil incompatível: a regra é exclusiva de arroz irrigado inundado desde o início do ciclo.");
  }
  if (!(["PRE_GERMINATED", "TRANSPLANTED_SEEDLINGS"] as const).includes(input.establishmentSystem)) {
    throw new Error("Sistema de estabelecimento incompatível com a regra SOSBAI 2025 de pré-germinado/transplante.");
  }
  if (input.waterRegime !== "FLOODED_FROM_START") {
    throw new Error("Regime hídrico incompatível: esta regra exige inundação desde o início do ciclo.");
  }

  finiteInRange(input.baseSaturationPct, 0, 100, "Saturação por bases");
  finitePositive(input.ctcPh7CmolcPerDm3, "CTC pH 7,0");
  finiteNonNegative(input.exchangeableCaCmolcPerDm3, "Ca trocável");
  finiteNonNegative(input.exchangeableMgCmolcPerDm3, "Mg trocável");

  const caMgException = input.exchangeableCaCmolcPerDm3 >= 4 && input.exchangeableMgCmolcPerDm3 >= 1;
  const vAboveDecisionThreshold = input.baseSaturationPct > 40;

  let requirementTPerHaPrnt100 = 0;
  let decisionReason: "CA_MG_ALREADY_ADEQUATE" | "BASE_SATURATION_ABOVE_40" | "FORMULA_APPLIED";

  if (caMgException) {
    decisionReason = "CA_MG_ALREADY_ADEQUATE";
  } else if (vAboveDecisionThreshold) {
    decisionReason = "BASE_SATURATION_ABOVE_40";
  } else {
    decisionReason = "FORMULA_APPLIED";
    requirementTPerHaPrnt100 = Math.max(
      0,
      ((40 - input.baseSaturationPct) / 100) * input.ctcPh7CmolcPerDm3,
    );
  }

  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    sourceSnapshotId: trace.sourceSnapshotId,
    profileId: RICE_FLOODED_LIMING_PROFILE,
    establishmentSystem: input.establishmentSystem,
    waterRegime: input.waterRegime,
    purpose: "CA_MG_CORRECTION_NOT_ACIDITY_CORRECTION" as const,
    limeType: "DOLOMITIC" as const,
    referencePrntPct: 100 as const,
    requirementTPerHaPrnt100: round(requirementTPerHaPrnt100),
    needed: requirementTPerHaPrnt100 > 0,
    decisionReason,
    commercialPrntAdjustmentApplied: false as const,
    incorporationAutomated: false as const,
    source: "SOSBAI 2025, p.42, Tabela 4.1",
  };
}
