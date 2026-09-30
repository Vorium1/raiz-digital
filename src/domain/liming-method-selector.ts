import { computeLimingDoseBySmpIndex, type LimingTargetPh } from "./liming-engine.ts";
import { normalizeManagementSystem, type CanonicalManagementSystem } from "./management-system.ts";

export const LIMING_METHOD_IDS = Object.freeze({
  cqfsRsSc2016Integrated020: "CQFS-RS-SC-2016-INTEGRATED-0-20",
  soybeanRsSc2025Integrated020: "SOYBEAN-RS-SC-2025-INTEGRATED-0-20",
  soybeanRsSc2025Split0101020: "SOYBEAN-RS-SC-2025-SPLIT-0-10-10-20",
  cqfsRsSc2016Perennial030From020: "CQFS-RS-SC-2016-PERENNIAL-0-30-FROM-0-20",
} as const);

export type LimingSamplingProfile =
  | "INTEGRATED_0_20"
  | "SPLIT_0_10_10_20"
  | "INTEGRATED_0_30"
  | "MIXED_OR_OTHER";

export type LimingMethodScope =
  | "APPLICATION_RECOMMENDATION"
  | "LAYER_REQUIREMENT"
  | "DEPTH_ADJUSTMENT_REFERENCE";

export type LimingMethodSelection = {
  samplingProfile: LimingSamplingProfile;
  selectedMethodId: string | null;
  scope: LimingMethodScope | null;
  automaticCalculationAllowed: boolean;
  blockers: string[];
  warnings: string[];
  source: {
    title: string;
    year: number;
    locator: string;
    url: string;
  } | null;
};

type ResultDepth = {
  parameterCode: string;
  depthFromCm?: number | null;
  depthToCm?: number | null;
};

const CQFS_2016_SOURCE = Object.freeze({
  title: "Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina",
  year: 2016,
  locator: "Cap. 3 (camadas de amostragem) e Cap. 5, Tabela 5.2 (índice SMP; camada 0-20 cm)",
  url: "https://www.sbcs-nrs.org.br/docs/Manual_de_Calagem_e_Adubacao_para_os_Estados_do_RS_e_de_SC-2016.pdf",
});

const SOYBEAN_2025_SOURCE = Object.freeze({
  title: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027",
  year: 2025,
  locator: "item 2.3; critérios e doses de calagem por sistema de manejo e profundidade",
  url: "https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1183120/1/Indicacoes2025.pdf",
});

function uniqueDepths(results: ResultDepth[]) {
  const pairs = new Set<string>();
  for (const row of results) {
    if (typeof row.depthFromCm !== "number" || typeof row.depthToCm !== "number") continue;
    pairs.add(`${row.depthFromCm}-${row.depthToCm}`);
  }
  return pairs;
}

export function detectLimingSamplingProfile(results: ResultDepth[]): LimingSamplingProfile {
  const depths = uniqueDepths(results);
  if (depths.size === 1 && depths.has("0-20")) return "INTEGRATED_0_20";
  if (depths.size === 1 && depths.has("0-30")) return "INTEGRATED_0_30";
  if (depths.has("0-10") && depths.has("10-20") && [...depths].every((item) => item === "0-10" || item === "10-20")) {
    return "SPLIT_0_10_10_20";
  }
  return "MIXED_OR_OTHER";
}

function regionFromState(state: string | null | undefined) {
  const normalized = (state ?? "").trim().toUpperCase();
  return normalized === "RS" || normalized === "SC" ? normalized : "OTHER";
}

function isConsolidated(system: CanonicalManagementSystem) {
  return system === "NO_TILL_CONSOLIDATED_UNSPECIFIED"
    || system === "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS"
    || system === "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS";
}

/**
 * Seleciona a metodologia pela evidência que REALMENTE chegou do laboratório.
 *
 * Regra de arquitetura:
 * - profundidade do laudo é fato, nunca é reinterpretada;
 * - método moderno/cultura-específico ganha prioridade quando a profundidade
 *   e o contexto exigidos estão presentes;
 * - uma amostra integrada 0-20 continua apta a calcular a necessidade da
 *   PRÓPRIA camada 0-20 pelo SMP/CQFS, mesmo quando a regra moderna de
 *   aplicação para SPD consolidado pede estratificação;
 * - essa necessidade de camada NÃO é promovida silenciosamente a recomendação
 *   de aplicação do manejo quando o protocolo da cultura exigir outra camada;
 * - 0-30 direto só é automatizado quando existir calibração regional explícita.
 */
export function selectLimingMethod(input: {
  state: string | null;
  cropCode: string | null;
  managementSystem: string | null;
  results: ResultDepth[];
}): LimingMethodSelection {
  const region = regionFromState(input.state);
  const samplingProfile = detectLimingSamplingProfile(input.results);
  const system = normalizeManagementSystem(input.managementSystem);

  if (region === "OTHER") {
    return {
      samplingProfile,
      selectedMethodId: null,
      scope: null,
      automaticCalculationAllowed: false,
      blockers: ["LIMING_METHOD_CATALOG_OUTSIDE_RS_SC"],
      warnings: [],
      source: null,
    };
  }

  if (samplingProfile === "INTEGRATED_0_30") {
    return {
      samplingProfile,
      selectedMethodId: null,
      scope: null,
      automaticCalculationAllowed: false,
      blockers: ["NO_VALIDATED_RS_SC_DIRECT_0_30_LIMING_METHOD"],
      warnings: [
        "0-30_CM_CAN_EXIST_AS_A_SAMPLING_DEPTH_BUT_REQUIRES_A_METHOD_CALIBRATED_FOR_THAT_LAYER",
        "DO_NOT_APPLY_0_20_SMP_TABLE_DIRECTLY_TO_A_0_30_COMPOSITE_SAMPLE",
      ],
      source: null,
    };
  }

  if (
    samplingProfile === "SPLIT_0_10_10_20"
    && input.cropCode === "SOJA"
    && isConsolidated(system)
  ) {
    return {
      samplingProfile,
      selectedMethodId: LIMING_METHOD_IDS.soybeanRsSc2025Split0101020,
      scope: "APPLICATION_RECOMMENDATION",
      automaticCalculationAllowed: system !== "NO_TILL_CONSOLIDATED_UNSPECIFIED",
      blockers: system === "NO_TILL_CONSOLIDATED_UNSPECIFIED"
        ? ["NO_TILL_CONSOLIDATED_10_20_CONDITION_REQUIRED"]
        : [],
      warnings: [],
      source: SOYBEAN_2025_SOURCE,
    };
  }

  if (samplingProfile === "INTEGRATED_0_20") {
    if (
      input.cropCode === "SOJA"
      && (system === "CONVENTIONAL" || system === "NO_TILL_ESTABLISHMENT")
    ) {
      return {
        samplingProfile,
        selectedMethodId: LIMING_METHOD_IDS.soybeanRsSc2025Integrated020,
        scope: "APPLICATION_RECOMMENDATION",
        automaticCalculationAllowed: true,
        blockers: [],
        warnings: [],
        source: SOYBEAN_2025_SOURCE,
      };
    }

    return {
      samplingProfile,
      selectedMethodId: LIMING_METHOD_IDS.cqfsRsSc2016Integrated020,
      scope: "LAYER_REQUIREMENT",
      automaticCalculationAllowed: true,
      blockers: [],
      warnings: isConsolidated(system)
        ? ["LAYER_REQUIREMENT_IS_NOT_THE_SAME_AS_MODERN_NO_TILL_APPLICATION_RULE"]
        : ["MANAGEMENT_SPECIFIC_APPLICATION_RULE_STILL_REQUIRED"],
      source: CQFS_2016_SOURCE,
    };
  }

  return {
    samplingProfile,
    selectedMethodId: null,
    scope: null,
    automaticCalculationAllowed: false,
    blockers: ["NO_MATCHING_LIMING_METHOD_FOR_SAMPLING_PROFILE"],
    warnings: [],
    source: null,
  };
}

export function computeIntegrated020SmpRequirement(input: {
  smpIndex: number;
  targetPh: LimingTargetPh;
}) {
  if (!Number.isFinite(input.smpIndex) || input.smpIndex < 0 || input.smpIndex > 14) {
    throw new Error("SMP_INVALID");
  }
  const dose = computeLimingDoseBySmpIndex(input.smpIndex, input.targetPh);
  return {
    methodId: LIMING_METHOD_IDS.cqfsRsSc2016Integrated020,
    samplingProfile: "INTEGRATED_0_20" as const,
    scope: "LAYER_REQUIREMENT" as const,
    targetPh: input.targetPh,
    doseTonHaPrnt100: dose.doseTonPerHaPrnt100,
    interpolated: dose.interpolated,
    source: CQFS_2016_SOURCE,
  };
}

/**
 * Regra explícita do Manual CQFS-RS/SC 2016 para casos de implantação de
 * culturas perenes: a análise 0-20 pode ser usada para corrigir 0-30 cm,
 * ajustando a dose para 1,5 vezes a recomendada para 0-20.
 *
 * Importante: isto NÃO transforma uma amostra composta 0-30 em equivalente
 * à amostra 0-20. É um ajuste de profundidade a partir de uma recomendação
 * calculada em 0-20, exatamente como descrito pela fonte.
 */
export function scale020RequirementTo030ForPerennialEstablishment(dose020TonHaPrnt100: number) {
  if (!Number.isFinite(dose020TonHaPrnt100) || dose020TonHaPrnt100 < 0) {
    throw new Error("LIME_DOSE_0_20_INVALID");
  }
  return {
    methodId: LIMING_METHOD_IDS.cqfsRsSc2016Perennial030From020,
    scope: "DEPTH_ADJUSTMENT_REFERENCE" as const,
    sourceLayerCm: { from: 0, to: 20 },
    targetCorrectionLayerCm: { from: 0, to: 30 },
    multiplier: 1.5,
    doseTonHaPrnt100: Math.round(dose020TonHaPrnt100 * 1.5 * 100) / 100,
    source: {
      ...CQFS_2016_SOURCE,
      locator: "Cap. 3: culturas perenes; correção de 0-30 cm com 1,5× a dose recomendada para 0-20 cm",
    },
  };
}
