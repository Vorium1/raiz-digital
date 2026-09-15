export type SoybeanSulfurRegion = "RS" | "SC" | "OTHER";
export type SoybeanSulfurSamplingProfile =
  | "ZERO_TO_TWENTY_PLUS_20_40"
  | "SPLIT_ZERO_TEN_10_20_20_40";
export type SoybeanSulfurSourceForm = "SULFATE" | "ELEMENTAL" | "OTHER_OR_UNKNOWN";

export type SoybeanSulfurRsSc2025Input = {
  region: SoybeanSulfurRegion;
  samplingProfile: SoybeanSulfurSamplingProfile;
  unit: "mg/dm3" | string;
  analysisMethodValidatedAgainstRegionalProtocol: boolean;
  sulfur0To10MgDm3?: number | null;
  sulfur10To20MgDm3?: number | null;
  sulfur0To20MgDm3?: number | null;
  sulfur20To40MgDm3?: number | null;
  intendedSourceForm?: SoybeanSulfurSourceForm;
};

const RULE_ID = "S-SOJA-RS-SC-2025" as const;
const SOURCE_URL = "https://www.alice.cnptia.embrapa.br/alice/handle/doc/1183120";

function validSulfur(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeUnit(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/³/g, "3")
    .replace(/\s+/g, "");
}

function isMgDm3(value: string) {
  return new Set(["mg/dm3", "mgdm-3", "mgdm3"]).has(normalizeUnit(value));
}

function unique(values: string[]) {
  return [...new Set(values)];
}

/**
 * Regra regional de S para soja baseada nas Indicações Técnicas RS/SC 2025.
 *
 * A fonte estabelece teores desejados >10 mg/dm3 em 0-10 ou 0-20 cm e
 * >8,5 mg/dm3 em 20-40 cm; quando a disponibilidade é insuficiente,
 * recomenda 20 kg S/ha. Quando a amostragem superficial é 0-10 cm, a
 * própria fonte manda confirmar possível deficiência em camadas mais profundas.
 *
 * Política conservadora RAIZ: decisões determinísticas exigem uma camada profunda
 * 20-40 cm. No perfil 0-10 cm, também exigimos a amostra 10-20 cm como evidência de
 * confirmação, mas NÃO inventamos um limiar numérico para 10-20 cm.
 */
export function evaluateSoybeanSulfurRsSc2025(input: SoybeanSulfurRsSc2025Input) {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.region === "OTHER") blockers.push("REGIONAL_PROFILE_OUTSIDE_RS_SC");
  if (!isMgDm3(input.unit)) blockers.push("SULFUR_UNIT_MUST_BE_MG_DM3");
  if (!input.analysisMethodValidatedAgainstRegionalProtocol) {
    blockers.push("SULFUR_ANALYSIS_METHOD_NOT_VALIDATED");
  }

  let surfaceValue: number | null = null;
  let deepValue: number | null = null;
  let deficiencyConfirmed = false;
  let shallowLowNotConfirmedAtDepth = false;

  if (input.samplingProfile === "ZERO_TO_TWENTY_PLUS_20_40") {
    if (!validSulfur(input.sulfur0To20MgDm3)) blockers.push("SULFUR_0_20_MISSING_OR_INVALID");
    if (!validSulfur(input.sulfur20To40MgDm3)) blockers.push("SULFUR_20_40_MISSING_OR_INVALID");
    if (validSulfur(input.sulfur0To20MgDm3)) surfaceValue = input.sulfur0To20MgDm3;
    if (validSulfur(input.sulfur20To40MgDm3)) deepValue = input.sulfur20To40MgDm3;

    if (surfaceValue !== null && deepValue !== null) {
      deficiencyConfirmed = surfaceValue <= 10 || deepValue <= 8.5;
    }
  } else {
    if (!validSulfur(input.sulfur0To10MgDm3)) blockers.push("SULFUR_0_10_MISSING_OR_INVALID");
    if (!validSulfur(input.sulfur10To20MgDm3)) blockers.push("SULFUR_10_20_MISSING_OR_INVALID");
    if (!validSulfur(input.sulfur20To40MgDm3)) blockers.push("SULFUR_20_40_MISSING_OR_INVALID");
    if (validSulfur(input.sulfur0To10MgDm3)) surfaceValue = input.sulfur0To10MgDm3;
    if (validSulfur(input.sulfur20To40MgDm3)) deepValue = input.sulfur20To40MgDm3;

    if (surfaceValue !== null && deepValue !== null) {
      if (deepValue <= 8.5) {
        deficiencyConfirmed = true;
      } else if (surfaceValue <= 10) {
        shallowLowNotConfirmedAtDepth = true;
        warnings.push("SHALLOW_LOW_S_NOT_CONFIRMED_AT_DEPTH");
      }
    }
  }

  const contextReady = blockers.length === 0;
  const recommendedNutrientDoseKgSPerHa = contextReady
    ? (deficiencyConfirmed ? 20 : 0)
    : null;

  const sourceForm = input.intendedSourceForm ?? "OTHER_OR_UNKNOWN";
  if (sourceForm === "SULFATE") {
    warnings.push("SULFATE_IS_PREFERRED_FAST_AVAILABLE_SOURCE");
  } else if (sourceForm === "ELEMENTAL") {
    warnings.push("ELEMENTAL_S_SHORT_TERM_AVAILABILITY_IS_UNCERTAIN");
  } else {
    warnings.push("SULFUR_SOURCE_FORM_NOT_SPECIFIED");
  }

  return {
    ruleId: RULE_ID,
    ruleStatus: "READY_FOR_IMPLEMENTATION" as const,
    contextReady,
    blockers: unique(blockers),
    warnings: unique(warnings),
    interpretation: contextReady
      ? (deficiencyConfirmed
        ? "DEFICIENT_APPLY_20_KG_S_HA"
        : shallowLowNotConfirmedAtDepth
          ? "SHALLOW_LOW_NOT_CONFIRMED_NO_AUTOMATIC_APPLICATION"
          : "SUFFICIENT_BY_PROFILE")
      : "INSUFFICIENT_CONTEXT",
    thresholds: {
      surfaceAdequateWhenMgDm3GreaterThan: 10,
      subsurface20To40AdequateWhenMgDm3GreaterThan: 8.5,
      exactBoundaryIsNotAdequate: true as const,
    },
    observations: {
      surfaceValueMgDm3: surfaceValue,
      subsurface20To40ValueMgDm3: deepValue,
      middle10To20ValueMgDm3: validSulfur(input.sulfur10To20MgDm3) ? input.sulfur10To20MgDm3 : null,
      deficiencyConfirmed,
      shallowLowNotConfirmedAtDepth,
    },
    recommendation: {
      nutrient: "S" as const,
      recommendedNutrientDoseKgSPerHa,
      automaticNutrientDoseAllowed: contextReady as boolean,
      automaticCommercialProductConversionAllowed: false as const,
      sourceForm,
      preferredChemicalForm: "SULFATE" as const,
      elementalSulfurShortTermContributionCertain: false as const,
      automaticYieldScalingAllowed: false as const,
      referenceExportYieldTonPerHaApprox: 4,
      atmosphericDepositionContextKgSPerHaYear: { min: 3.3, max: 4.5 },
    },
    source: {
      title: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027",
      institution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / Universidade de Passo Fundo",
      year: 2025,
      locator: "item 2.5.3 Enxofre, p.45",
      url: SOURCE_URL,
    },
    policy: {
      deepLayerRequiredByRaizForDeterministicDecision: true as const,
      tenToTwentyLayerHasInventedThreshold: false as const,
      professionalReviewRequiredForElementalSourceTiming: sourceForm === "ELEMENTAL",
    },
  };
}
