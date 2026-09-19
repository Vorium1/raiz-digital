import { computeParameterPredominance } from "./parameter-predominance.ts";

export type SulfurDoseDecision = {
  ruleId: "S-TRIGO-EMBRAPA-2026" | "S-CANOLA-CQFS-2016" | "S-ARROZ-SOSBAI-2025" | "S-SOJA-RS-SC-2025";
  ruleVersion: "1.0.0" | "1.1.0";
  sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14" | "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14";
  status: "READY_FOR_IMPLEMENTATION" | "REQUIRES_AGRONOMIST_REVIEW";
  needed: boolean | null;
  dose: { kind: "EXACT"; kgSPerHa: number } | { kind: "RANGE"; minKgSPerHa: number; maxKgSPerHa: number } | { kind: "BLOCKED"; reason: string };
  blockers: string[];
  source: string;
};

function validateSulfur(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Teor de enxofre deve ser finito e maior ou igual a zero.");
}

/**
 * A pesquisa Work foi explícita: limiar de S só pode ser aplicado quando o método de extração
 * é compatível com a fonte. `methodValidated=false` falha fechado em vez de assumir equivalência.
 */
export function computeWheatSulfurRecommendation(input: {
  sulfurMgDm3: number;
  methodValidated: boolean;
}): SulfurDoseDecision {
  validateSulfur(input.sulfurMgDm3);
  if (!input.methodValidated) {
    return {
      ruleId: "S-TRIGO-EMBRAPA-2026",
      ruleVersion: "1.0.0",
      sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "O método de extração não foi validado contra o limiar da fonte." },
      blockers: ["ANALYTICAL_METHOD_NOT_VALIDATED"],
      source: "Embrapa Trigo 2026 p.33",
    };
  }
  const needed = input.sulfurMgDm3 < 5;
  return {
    ruleId: "S-TRIGO-EMBRAPA-2026",
    ruleVersion: "1.0.0",
    sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14",
    status: "READY_FOR_IMPLEMENTATION",
    needed,
    dose: needed ? { kind: "RANGE", minKgSPerHa: 20, maxKgSPerHa: 30 } : { kind: "EXACT", kgSPerHa: 0 },
    blockers: [],
    source: "Embrapa Trigo 2026 p.33",
  };
}

export function computeCanolaSulfurRecommendation(input: {
  sulfurMgDm3: number;
  methodValidated: boolean;
}): SulfurDoseDecision {
  validateSulfur(input.sulfurMgDm3);
  if (!input.methodValidated) {
    return {
      ruleId: "S-CANOLA-CQFS-2016",
      ruleVersion: "1.0.0",
      sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "O método de extração não foi validado contra o limiar da fonte." },
      blockers: ["ANALYTICAL_METHOD_NOT_VALIDATED"],
      source: "Tomm et al. 2009 p.53; CQFS-RS/SC 2016",
    };
  }
  const needed = input.sulfurMgDm3 < 10;
  return {
    ruleId: "S-CANOLA-CQFS-2016",
    ruleVersion: "1.0.0",
    sourceSnapshotId: "RAIZ-WORK-RESEARCH-2026-09-14",
    status: "READY_FOR_IMPLEMENTATION",
    needed,
    dose: { kind: "EXACT", kgSPerHa: needed ? 20 : 0 },
    blockers: [],
    source: "Tomm et al. 2009 p.53; CQFS-RS/SC 2016",
  };
}

export const RICE_S_SOSBAI_2025_PROFILE = "SOSBAI_2025_ARROZ_IRRIGADO" as const;

/**
 * SOSBAI 2025, p.49: em solo com S <10 mg/dm3 medido com extrator fosfato de cálcio
 * 500 mg/L, a resposta observada limita-se à faixa de 20–30 kg S/ha.
 *
 * A função mantém a faixa como faixa; não escolhe 20, 25 ou 30 kg/ha por conta própria.
 * Produtos comerciais citados pela fonte não são selecionados automaticamente aqui.
 */
export function computeRiceSulfurRecommendation(input: {
  profileId: string;
  sulfurMgDm3: number;
  extractionMethod: "CALCIUM_PHOSPHATE_500_MG_L" | "OTHER" | "UNKNOWN";
  unit: "mg/dm3" | string;
}): SulfurDoseDecision {
  validateSulfur(input.sulfurMgDm3);

  if (input.profileId !== RICE_S_SOSBAI_2025_PROFILE) {
    return {
      ruleId: "S-ARROZ-SOSBAI-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "Perfil incompatível com a recomendação de S da SOSBAI 2025 para arroz irrigado." },
      blockers: ["RICE_PROFILE_NOT_VALIDATED"],
      source: "SOSBAI 2025 p.49 — Adubação sulfatada",
    };
  }

  if (input.extractionMethod !== "CALCIUM_PHOSPHATE_500_MG_L") {
    return {
      ruleId: "S-ARROZ-SOSBAI-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "A SOSBAI 2025 define o limiar com extrator fosfato de cálcio 500 mg/L; não converter outro método por analogia." },
      blockers: ["ANALYTICAL_METHOD_NOT_VALIDATED"],
      source: "SOSBAI 2025 p.49 — Adubação sulfatada",
    };
  }

  if (input.unit !== "mg/dm3") {
    return {
      ruleId: "S-ARROZ-SOSBAI-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "Unidade incompatível; o limiar da fonte está em mg/dm3." },
      blockers: ["ANALYTICAL_UNIT_NOT_VALIDATED"],
      source: "SOSBAI 2025 p.49 — Adubação sulfatada",
    };
  }

  const needed = input.sulfurMgDm3 < 10;
  return {
    ruleId: "S-ARROZ-SOSBAI-2025",
    ruleVersion: "1.1.0",
    sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
    status: "READY_FOR_IMPLEMENTATION",
    needed,
    dose: needed
      ? { kind: "RANGE", minKgSPerHa: 20, maxKgSPerHa: 30 }
      : { kind: "EXACT", kgSPerHa: 0 },
    blockers: [],
    source: "SOSBAI 2025 p.49 — S <10 mg/dm3 por fosfato de cálcio 500 mg/L; resposta limitada a 20–30 kg S/ha",
  };
}


export type SoybeanSulfurObservation = {
  sampleCode: string;
  sulfurMgDm3: number;
  method: string;
  depthFromCm: number | null;
  depthToCm: number | null;
};

export type SoybeanSulfurUniformDecision = SulfurDoseDecision & {
  basis: "SINGLE_SAMPLE" | "STRICT_PREDOMINANCE" | null;
  matchingCount: number;
  totalCount: number;
};

const SOYBEAN_S_METHOD = "Ca(H2PO4)2 500mg P/L, turbidimetria";
const SOYBEAN_S_CRITICAL_MG_DM3 = 10;
const SOYBEAN_S_DOSE_KG_HA = 20;

/**
 * Soja RS/SC:
 * - fonte regional 2025: teor crítico 10 mg/dm³; abaixo disso, 20 kg S/ha;
 * - para automatizar uma DOSE UNIFORME em área com vários pontos, a RAIZ aplica a mesma política
 *   conservadora já usada no P/K: maioria estrita + pelo menos 3 observações concordantes.
 *
 * A maioria é uma política operacional de representatividade do RAIZ, não uma regra atribuída à fonte.
 * Sem predominância, a função preserva o diagnóstico ponto a ponto e recusa uma dose uniforme.
 */
export function computeSoybeanSulfurRecommendation(input: {
  cropCode: string | null | undefined;
  observations: SoybeanSulfurObservation[];
}): SoybeanSulfurUniformDecision {
  const cropCode = input.cropCode?.trim().toUpperCase() ?? "";
  if (cropCode !== "SOJA") {
    return {
      ruleId: "S-SOJA-RS-SC-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "Regra específica de enxofre da soja não se aplica à cultura informada." },
      blockers: ["SOYBEAN_PROFILE_NOT_VALIDATED"],
      source: "Indicações técnicas soja RS/SC 2025, item 2.5.3",
      basis: null,
      matchingCount: 0,
      totalCount: input.observations.length,
    };
  }

  if (input.observations.length === 0) {
    return {
      ruleId: "S-SOJA-RS-SC-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "Não há teor de enxofre interpretável para calcular a recomendação." },
      blockers: ["S_NO_OBSERVATION"],
      source: "Indicações técnicas soja RS/SC 2025, item 2.5.3",
      basis: null,
      matchingCount: 0,
      totalCount: 0,
    };
  }

  const invalidValue = input.observations.some((item) => !Number.isFinite(item.sulfurMgDm3) || item.sulfurMgDm3 < 0);
  if (invalidValue) throw new Error("Teor de enxofre deve ser finito e maior ou igual a zero.");

  const methodMismatch = input.observations.some((item) => item.method !== SOYBEAN_S_METHOD);
  if (methodMismatch) {
    return {
      ruleId: "S-SOJA-RS-SC-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "O método de S não corresponde ao extrator de fosfato de cálcio validado para esta regra." },
      blockers: ["ANALYTICAL_METHOD_NOT_VALIDATED"],
      source: "Indicações técnicas soja RS/SC 2025, item 2.5.3; CQFS-RS/SC 2016",
      basis: null,
      matchingCount: 0,
      totalCount: input.observations.length,
    };
  }

  // A recomendação automática desta regra exige a camada 0–20 cm. A fonte permite diagnosticar outras
  // camadas, mas não autoriza o RAIZ a tratar 0–10 como equivalente quando há teor baixo.
  const unsupportedDepth = input.observations.some((item) => item.depthFromCm !== 0 || item.depthToCm !== 20);
  if (unsupportedDepth) {
    return {
      ruleId: "S-SOJA-RS-SC-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "REQUIRES_AGRONOMIST_REVIEW",
      needed: null,
      dose: { kind: "BLOCKED", reason: "A dose automática de S para soja requer evidência compatível com a camada 0–20 cm." },
      blockers: ["S_DEPTH_NOT_0_20_CM"],
      source: "Indicações técnicas soja RS/SC 2025, item 2.5.3",
      basis: null,
      matchingCount: 0,
      totalCount: input.observations.length,
    };
  }

  const classified = input.observations.map((item) => ({
    sampleCode: item.sampleCode,
    parameterCode: "S",
    interpretable: true,
    classification: item.sulfurMgDm3 < SOYBEAN_S_CRITICAL_MG_DM3 ? "ABAIXO_CRITICO_SOJA" : "SUFICIENTE_SOJA",
  }));

  let basis: SoybeanSulfurUniformDecision["basis"] = null;
  let classification: string | null = null;
  let matchingCount = 0;

  if (classified.length === 1) {
    basis = "SINGLE_SAMPLE";
    classification = classified[0].classification;
    matchingCount = 1;
  } else {
    const predominance = computeParameterPredominance(classified).find((item) => item.parameterCode === "S");
    if (predominance) {
      basis = "STRICT_PREDOMINANCE";
      classification = predominance.classification;
      matchingCount = predominance.matchingCount;
    }
  }

  if (!classification) {
    return {
      ruleId: "S-SOJA-RS-SC-2025",
      ruleVersion: "1.1.0",
      sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
      status: "READY_FOR_IMPLEMENTATION",
      needed: null,
      dose: { kind: "BLOCKED", reason: "Os pontos não sustentam uma dose uniforme de enxofre para toda a área." },
      blockers: ["S_NO_STRICT_PREDOMINANCE"],
      source: "Indicações técnicas soja RS/SC 2025, item 2.5.3 + política de predominância RAIZ",
      basis: null,
      matchingCount: 0,
      totalCount: classified.length,
    };
  }

  const needed = classification === "ABAIXO_CRITICO_SOJA";
  return {
    ruleId: "S-SOJA-RS-SC-2025",
    ruleVersion: "1.1.0",
    sourceSnapshotId: "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14",
    status: "READY_FOR_IMPLEMENTATION",
    needed,
    dose: { kind: "EXACT", kgSPerHa: needed ? SOYBEAN_S_DOSE_KG_HA : 0 },
    blockers: [],
    source: "Indicações técnicas soja RS/SC 2025, item 2.5.3 — S <10 mg/dm³: 20 kg S/ha",
    basis,
    matchingCount,
    totalCount: classified.length,
  };
}
