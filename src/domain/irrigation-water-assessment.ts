export type IrrigationWaterRegime = "" | "SEQUEIRO" | "IRRIGADO";
export type WaterEvidenceAlignment = "ALIGNED" | "UNVERIFIED";

export type IrrigationWaterAssessmentInput = {
  waterRegime: IrrigationWaterRegime;
  sourceAlignment?: WaterEvidenceAlignment;
  referenceEtMm?: number | null;
  cropEtMm?: number | null;
  precipitationMm?: number | null;
  effectivePrecipitationMm?: number | null;
  netIrrigationMm?: number | null;
  capillaryRiseMm?: number | null;
  previousRootZoneDepletionMm?: number | null;
  rootZoneTotalAvailableWaterMm?: number | null;
  readilyAvailableWaterMm?: number | null;
};

export type IrrigationWaterResolution =
  | "NOT_EVALUATED"
  | "CONTEXT_ONLY"
  | "DEMAND_AVAILABLE"
  | "UNALIGNED_EVIDENCE"
  | "BALANCE_AVAILABLE"
  | "INVALID_OPTIONAL_EVIDENCE";

export type IrrigationWaterState =
  | "WATER_SUPPLY_ADEQUATE"
  | "IRRIGATION_THRESHOLD_REACHED"
  | "WATER_STRESS_ESTIMATED";

function finiteNonNegative(value: number | null | undefined, label: string) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} deve ser um número finito maior ou igual a zero quando informado.`);
  }
  return value;
}

function finitePositive(value: number | null | undefined, label: string) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} deve ser um número finito maior que zero quando informado.`);
  }
  return value;
}

/**
 * Gate progressivo para contexto/demanda/balanço hídrico.
 *
 * Não busca dados e não escolhe Kc, profundidade radicular, chuva efetiva,
 * eficiência ou RAW. Esses valores precisam chegar como evidência explícita ou
 * como derivação de outra regra homologada. Ausência permanece ausência.
 *
 * O balanço usa a forma da depleção da zona radicular:
 * Dr_i = Dr_(i-1) - Pef - I_liq - CR + ETc + DP
 *
 * Aqui DP só é derivada quando a reposição conhecida ultrapassa a depleção
 * disponível (Dr provisória < 0), mantendo Dr final em zero. Chuva total nunca
 * substitui chuva efetiva e ETo nunca substitui ETc.
 */
export function evaluateIrrigationWaterEvidence(input: IrrigationWaterAssessmentInput) {
  const policy = {
    missingDataBlocksBaseSoilOpinion: false as const,
    missingDataBlocksOfficialReport: false as const,
    unknownComponentsAssumedZero: false as const,
    referenceEtMaySubstituteCropEt: false as const,
    grossIrrigationMaySubstituteNetIrrigation: false as const,
    precipitationMaySubstituteEffectivePrecipitation: false as const,
    automaticNutrientDoseChangeAllowed: false as const,
    automaticIrrigationDepthRecommendationAllowed: false as const,
  };

  try {
    const referenceEtMm = finiteNonNegative(input.referenceEtMm, "ETo");
    const cropEtMm = finiteNonNegative(input.cropEtMm, "ETc");
    const precipitationMm = finiteNonNegative(input.precipitationMm, "Precipitação");
    const effectivePrecipitationMm = finiteNonNegative(input.effectivePrecipitationMm, "Precipitação efetiva");
    const declaredNetIrrigationMm = finiteNonNegative(input.netIrrigationMm, "Irrigação líquida");
    const capillaryRiseMm = finiteNonNegative(input.capillaryRiseMm, "Ascensão capilar");
    const previousRootZoneDepletionMm = finiteNonNegative(input.previousRootZoneDepletionMm, "Depleção anterior");
    const rootZoneTotalAvailableWaterMm = finitePositive(input.rootZoneTotalAvailableWaterMm, "Água total disponível na zona radicular");
    const readilyAvailableWaterMm = finiteNonNegative(input.readilyAvailableWaterMm, "Água prontamente disponível");

    if (
      rootZoneTotalAvailableWaterMm != null
      && readilyAvailableWaterMm != null
      && readilyAvailableWaterMm > rootZoneTotalAvailableWaterMm
    ) {
      throw new Error("A água prontamente disponível não pode exceder a água total disponível na zona radicular.");
    }
    if (
      rootZoneTotalAvailableWaterMm != null
      && previousRootZoneDepletionMm != null
      && previousRootZoneDepletionMm > rootZoneTotalAvailableWaterMm
    ) {
      throw new Error("A depleção anterior não pode exceder a água total disponível na zona radicular.");
    }

    // SEQUEIRO_DECLARED é evidência explícita de ausência de irrigação suplementar.
    // IRRIGADO ou regime desconhecido sem registro diário nunca viram zero.
    const netIrrigationMm = declaredNetIrrigationMm
      ?? (input.waterRegime === "SEQUEIRO" ? 0 : null);

    const providedValues = [
      referenceEtMm,
      cropEtMm,
      precipitationMm,
      effectivePrecipitationMm,
      declaredNetIrrigationMm,
      capillaryRiseMm,
      previousRootZoneDepletionMm,
      rootZoneTotalAvailableWaterMm,
      readilyAvailableWaterMm,
    ].filter((value) => value != null).length;

    const limitations: string[] = [];
    if (referenceEtMm != null && cropEtMm == null) limitations.push("REFERENCE_ET_IS_NOT_CROP_ET");
    if (precipitationMm != null && effectivePrecipitationMm == null) limitations.push("TOTAL_RAIN_IS_NOT_EFFECTIVE_RAIN");
    if (input.waterRegime === "IRRIGADO" && netIrrigationMm == null) limitations.push("IRRIGATED_REGIME_DOES_NOT_PROVE_DAILY_NET_IRRIGATION");
    if (input.waterRegime === "" && netIrrigationMm == null) limitations.push("WATER_REGIME_UNKNOWN_DOES_NOT_PROVE_ZERO_IRRIGATION");

    if (providedValues === 0) {
      if (input.waterRegime !== "") {
        return {
          resolution: "CONTEXT_ONLY" as const,
          waterRegime: input.waterRegime,
          demand: null,
          balance: null,
          policy,
          limitations: [
            ...limitations,
            "FULL_BALANCE_REQUIRES_ALIGNED_ETC_EFFECTIVE_RAIN_NET_IRRIGATION_CAPILLARY_RISE_AND_ROOT_ZONE_STORAGE",
          ],
        };
      }
      return {
        resolution: "NOT_EVALUATED" as const,
        waterRegime: input.waterRegime,
        demand: null,
        balance: null,
        policy,
        limitations,
      };
    }

    const demand = cropEtMm == null
      ? null
      : { cropEtMm, evidenceType: "EXPLICIT_OR_UPSTREAM_DERIVED_ETC" as const };

    const fullBalanceInputsPresent = [
      cropEtMm,
      effectivePrecipitationMm,
      netIrrigationMm,
      capillaryRiseMm,
      previousRootZoneDepletionMm,
      rootZoneTotalAvailableWaterMm,
      readilyAvailableWaterMm,
    ].every((value) => value != null);

    if (!fullBalanceInputsPresent) {
      return {
        resolution: demand ? "DEMAND_AVAILABLE" as const : "CONTEXT_ONLY" as const,
        waterRegime: input.waterRegime,
        demand,
        balance: null,
        policy,
        limitations: [...limitations, "FULL_BALANCE_REQUIRES_ALIGNED_ETC_EFFECTIVE_RAIN_NET_IRRIGATION_CAPILLARY_RISE_AND_ROOT_ZONE_STORAGE"],
      };
    }

    if (input.sourceAlignment !== "ALIGNED") {
      return {
        resolution: "UNALIGNED_EVIDENCE" as const,
        waterRegime: input.waterRegime,
        demand,
        balance: null,
        policy,
        limitations: [...limitations, "WATER_BALANCE_INPUTS_NOT_TEMPORALLY_SPATIALLY_ALIGNED"],
      };
    }

    const provisionalDepletionMm =
      previousRootZoneDepletionMm!
      - effectivePrecipitationMm!
      - netIrrigationMm!
      - capillaryRiseMm!
      + cropEtMm!;

    const deepPercolationMm = Math.max(0, -provisionalDepletionMm);
    const nextRootZoneDepletionMm = Math.max(0, provisionalDepletionMm);

    const state: IrrigationWaterState = nextRootZoneDepletionMm > rootZoneTotalAvailableWaterMm!
      ? "WATER_STRESS_ESTIMATED"
      : nextRootZoneDepletionMm >= readilyAvailableWaterMm!
        ? "IRRIGATION_THRESHOLD_REACHED"
        : "WATER_SUPPLY_ADEQUATE";

    if (nextRootZoneDepletionMm > rootZoneTotalAvailableWaterMm!) {
      limitations.push("ESTIMATED_DEPLETION_EXCEEDS_ROOT_ZONE_TOTAL_AVAILABLE_WATER");
    }

    return {
      resolution: "BALANCE_AVAILABLE" as const,
      waterRegime: input.waterRegime,
      demand,
      balance: {
        previousRootZoneDepletionMm,
        effectivePrecipitationMm,
        netIrrigationMm,
        capillaryRiseMm,
        cropEtMm,
        deepPercolationMm,
        nextRootZoneDepletionMm,
        rootZoneTotalAvailableWaterMm,
        readilyAvailableWaterMm,
        state,
        formula: "Dr_i = Dr_(i-1) - Pef - I_liq - CR + ETc + DP",
      },
      policy,
      limitations,
    };
  } catch (error) {
    return {
      resolution: "INVALID_OPTIONAL_EVIDENCE" as const,
      waterRegime: input.waterRegime,
      demand: null,
      balance: null,
      policy,
      limitations: [error instanceof Error ? error.message : "Evidência hídrica opcional inválida."],
    };
  }
}
