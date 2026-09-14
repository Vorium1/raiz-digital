import { buildRuleTrace, evaluateAgronomicRuleAutomation } from "./agronomic-rule-catalog.ts";

export type RiceResponseClass = "MEDIA" | "ALTA" | "MUITO_ALTA";
export type RicePkClass = "MUITO_BAIXO" | "BAIXO" | "MEDIO" | "ALTO" | "MUITO_ALTO";
export type BoundedDose =
  | { kind: "EXACT"; kgPerHa: number }
  | { kind: "UPPER_BOUND"; maxKgPerHa: number };

export type Micronutrient = "B" | "ZN" | "CU" | "MN";
export type MicronutrientClass = "BAIXO" | "MEDIO" | "ALTO" | "INDETERMINATE";
export type MicronutrientMethod = "HOT_WATER" | "MEHLICH_1" | "KCL_1M_ACIDIFIED_EXTRACT";
export type SupportedMicronutrientCrop = "SOJA" | "MILHO" | "TRIGO" | "CANOLA";

const RICE_PROFILE = "SOSBAI_2025_ARROZ_CONTINUO";
const MICRO_PROFILE = "CQFS_RS_SC_2016_T6_12";

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} deve ser um número finito maior ou igual a zero.`);
}

function finitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} deve ser um número finito maior que zero.`);
}

function requireReady(ruleId: string) {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  if (!decision.allowed || !decision.rule) {
    throw new Error(`Regra ${ruleId} não está liberada para execução determinística (${decision.status}).`);
  }
  return buildRuleTrace(ruleId);
}

function assertRiceProfile(profileId: string) {
  if (profileId !== RICE_PROFILE) {
    throw new Error("Perfil de arroz incompatível. A tabela SOSBAI 2025 desta função só pode ser usada em arroz contínuo explicitamente enquadrado.");
  }
}

function assertApprovedResponseClass(approved: boolean) {
  if (approved !== true) {
    throw new Error("A classe de resposta do arroz precisa estar explicitamente validada; meta ou nível de investimento não selecionam a coluna automaticamente.");
  }
}

function riceOmBand(organicMatterPct: number): "LE_2_5" | "FROM_2_6_TO_5" | "GT_5" {
  finiteNonNegative(organicMatterPct, "Matéria orgânica");
  if (organicMatterPct <= 2.5) return "LE_2_5";
  if (organicMatterPct < 2.6) {
    throw new Error("Matéria orgânica entre 2,5% e 2,6% cai em lacuna de precisão da tabela SOSBAI; não arredondar silenciosamente.");
  }
  if (organicMatterPct <= 5) return "FROM_2_6_TO_5";
  return "GT_5";
}

const RICE_N_TABLE: Record<ReturnType<typeof riceOmBand>, Record<RiceResponseClass, BoundedDose>> = {
  LE_2_5: {
    MEDIA: { kind: "EXACT", kgPerHa: 110 },
    ALTA: { kind: "EXACT", kgPerHa: 135 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 165 },
  },
  FROM_2_6_TO_5: {
    MEDIA: { kind: "EXACT", kgPerHa: 100 },
    ALTA: { kind: "EXACT", kgPerHa: 120 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 150 },
  },
  GT_5: {
    MEDIA: { kind: "UPPER_BOUND", maxKgPerHa: 90 },
    ALTA: { kind: "UPPER_BOUND", maxKgPerHa: 110 },
    MUITO_ALTA: { kind: "UPPER_BOUND", maxKgPerHa: 135 },
  },
};

/**
 * SOSBAI 2025, Tabela 4.5 p.46. Retorna o N TOTAL da tabela, não um plano de parcelamento.
 * A faixa de aplicação e as notas de resíduo/estádio permanecem fora desta função para evitar
 * transformar expressões condicionais ("pode", "aproximadamente", "cerca de") em uma função inventada.
 */
export function computeRiceContinuousNitrogen(input: {
  profileId: string;
  organicMatterPct: number;
  responseClass: RiceResponseClass;
  responseClassApproved: boolean;
}) {
  assertRiceProfile(input.profileId);
  assertApprovedResponseClass(input.responseClassApproved);
  const trace = requireReady("N-ARROZ-CONTINUO-SOSBAI-2025");
  const band = riceOmBand(input.organicMatterPct);
  const dose = RICE_N_TABLE[band][input.responseClass];
  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    source: "SOSBAI 2025, Tabela 4.5, p.46",
    profileId: RICE_PROFILE,
    organicMatterBand: band,
    responseClass: input.responseClass,
    dose,
    parcelingAutomated: false as const,
  };
}

const RICE_P_TABLE: Record<RicePkClass, Record<RiceResponseClass, BoundedDose>> = {
  MUITO_BAIXO: {
    MEDIA: { kind: "EXACT", kgPerHa: 70 },
    ALTA: { kind: "EXACT", kgPerHa: 85 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 100 },
  },
  BAIXO: {
    MEDIA: { kind: "EXACT", kgPerHa: 60 },
    ALTA: { kind: "EXACT", kgPerHa: 75 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 90 },
  },
  MEDIO: {
    MEDIA: { kind: "EXACT", kgPerHa: 50 },
    ALTA: { kind: "EXACT", kgPerHa: 65 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 80 },
  },
  ALTO: {
    MEDIA: { kind: "EXACT", kgPerHa: 40 },
    ALTA: { kind: "EXACT", kgPerHa: 55 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 70 },
  },
  MUITO_ALTO: {
    MEDIA: { kind: "UPPER_BOUND", maxKgPerHa: 40 },
    ALTA: { kind: "UPPER_BOUND", maxKgPerHa: 55 },
    MUITO_ALTA: { kind: "UPPER_BOUND", maxKgPerHa: 70 },
  },
};

/** SOSBAI 2025, Tabela 4.6 p.47. A classe precisa ter sido calculada no perfil correto de arroz. */
export function computeRiceContinuousPhosphorus(input: {
  profileId: string;
  phosphorusClass: RicePkClass;
  classificationProfileId: string;
  responseClass: RiceResponseClass;
  responseClassApproved: boolean;
}) {
  assertRiceProfile(input.profileId);
  assertApprovedResponseClass(input.responseClassApproved);
  if (input.classificationProfileId !== RICE_PROFILE) {
    throw new Error("Classe de P sem proveniência do perfil SOSBAI 2025 de arroz contínuo; não reutilizar classe de sequeiro.");
  }
  const trace = requireReady("P-ARROZ-CONTINUO-SOSBAI-2025");
  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    source: "SOSBAI 2025, Tabela 4.6, p.47",
    nutrient: "P2O5" as const,
    dose: RICE_P_TABLE[input.phosphorusClass][input.responseClass],
  };
}

/**
 * SOSBAI 2025 p.53. A função calcula somente a estimativa/risco de Fe; não dispara manejo de água,
 * cultivar, corretivo ou outra intervenção.
 */
export function computeRiceIronToxicityRisk(input: {
  feOxalateGPerDm3: number;
  ctcPh7CmolcPerDm3: number;
  extractionMethod: "AMMONIUM_OXALATE_0_2M_PH6";
}) {
  const trace = requireReady("FE-ARROZ-RISCO-SOSBAI-2025");
  finiteNonNegative(input.feOxalateGPerDm3, "Fe-oxalato");
  finitePositive(input.ctcPh7CmolcPerDm3, "CTC pH 7");
  if (input.extractionMethod !== "AMMONIUM_OXALATE_0_2M_PH6") {
    throw new Error("Extrator incompatível para a estimativa de risco de Fe do arroz.");
  }
  const estimatedFeCmolcPerDm3 = 1.66 + 2.46 * input.feOxalateGPerDm3;
  const psFePct = 100 * estimatedFeCmolcPerDm3 / input.ctcPh7CmolcPerDm3;
  const riskClass = psFePct <= 20
    ? "BAIXO"
    : psFePct < 21
      ? "INDETERMINATE"
      : psFePct <= 40
        ? "MEDIO"
        : "ALTO";
  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    estimatedFeCmolcPerDm3: round(estimatedFeCmolcPerDm3),
    psFePct: round(psFePct),
    riskClass: riskClass as "BAIXO" | "MEDIO" | "ALTO" | "INDETERMINATE",
    managementRecommendation: null,
    source: "SOSBAI 2025, Tabela 4.8 e equações de risco, p.53",
  };
}

const MICRO_METHOD: Record<Micronutrient, MicronutrientMethod> = {
  B: "HOT_WATER",
  ZN: "MEHLICH_1",
  CU: "MEHLICH_1",
  MN: "KCL_1M_ACIDIFIED_EXTRACT",
};

/**
 * CQFS-RS/SC 2016, Tabela 6.12 p.98. Classifica disponibilidade analítica; dose permanece null.
 * Profundidade não é convertida aritmeticamente: o chamador precisa declarar que o protocolo/camada
 * usados são compatíveis com o perfil agronômico em uso.
 */
export function classifyMicronutrientCqfs2016(input: {
  crop: SupportedMicronutrientCrop;
  nutrient: Micronutrient;
  valueMgPerDm3: number;
  method: MicronutrientMethod;
  unit: "mg/dm3";
  depthProtocolValidated: boolean;
}) {
  const trace = requireReady("MICRO-CLASS-CQFS-2016");
  finiteNonNegative(input.valueMgPerDm3, "Teor do micronutriente");
  if (input.unit !== "mg/dm3") throw new Error("Unidade incompatível: a classificação exige mg/dm3.");
  if (input.method !== MICRO_METHOD[input.nutrient]) {
    throw new Error(`Método incompatível para ${input.nutrient}; não converter extratores por analogia.`);
  }
  if (input.depthProtocolValidated !== true) {
    throw new Error("Profundidade/protocolo de amostragem não validados para o perfil agronômico.");
  }

  const x = input.valueMgPerDm3;
  let classification: MicronutrientClass;
  if (input.nutrient === "CU") classification = x < 0.2 ? "BAIXO" : x <= 0.4 ? "MEDIO" : "ALTO";
  else if (input.nutrient === "ZN") classification = x < 0.2 ? "BAIXO" : x <= 0.5 ? "MEDIO" : "ALTO";
  else if (input.nutrient === "MN") classification = x < 2.5 ? "BAIXO" : x <= 5 ? "MEDIO" : "ALTO";
  else classification = x <= 0.1 ? "BAIXO" : x < 0.2 ? "INDETERMINATE" : x <= 0.3 ? "MEDIO" : "ALTO";

  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    profileId: MICRO_PROFILE,
    crop: input.crop,
    nutrient: input.nutrient,
    classification,
    doseKgPerHa: null,
    source: "CQFS-RS/SC 2016, Tabela 6.12, p.98; métodos pp.55-56",
  };
}

/** Erros de validação espacial: convenção de ME = predito - observado. Nenhum threshold é inventado. */
export function computeSpatialValidationMetrics(input: {
  observed: number[];
  predicted: number[];
}) {
  const trace = requireReady("SPATIAL-VALIDATION-METRICS");
  if (input.observed.length === 0 || input.observed.length !== input.predicted.length) {
    throw new Error("Observado e predito devem ter o mesmo tamanho e pelo menos uma observação.");
  }
  const errors = input.observed.map((observed, index) => {
    const predicted = input.predicted[index];
    if (!Number.isFinite(observed) || !Number.isFinite(predicted)) {
      throw new Error("Métricas espaciais não aceitam NaN/Infinity; NoData deve permanecer NoData e ser excluído explicitamente.");
    }
    return predicted - observed;
  });
  const n = errors.length;
  const me = errors.reduce((sum, error) => sum + error, 0) / n;
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / n;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / n);
  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    n,
    rmse: round(rmse),
    mae: round(mae),
    me: round(me),
    meSignConvention: "PREDICTED_MINUS_OBSERVED" as const,
    passes: null,
    note: "A pesquisa não sustenta um limiar universal de RMSE/MAE/ME; aprovação depende do atributo, suporte e revisão profissional.",
  };
}

export type MapDapProduct = "MAP_10_52_0" | "DAP_18_46_0";

const UNL_G1503 = {
  MAP_10_52_0: { nPct: 10, p2o5Pct: 52, kgCaCO3EqPerKgN: 5.4 },
  DAP_18_46_0: { nPct: 18, p2o5Pct: 46, kgCaCO3EqPerKgN: 3.6 },
} as const;

/**
 * Ledger transparente baseado no fator declarado pela University of Nebraska G1503 (rev. 2009).
 * Ele mostra por que a ordem MAP/DAP muda com o denominador: MAP é maior por kg N nesta tabela,
 * enquanto o grau comercial pode inverter a comparação por kg de produto. Nunca vira dose de calcário.
 */
export function buildMapDapAcidityLedger(input: {
  product: MapDapProduct;
  productMassKg?: number | null;
}) {
  const trace = requireReady("MAP-DAP-ACID-LEDGER-UNL-2009");
  if (input.productMassKg != null) finiteNonNegative(input.productMassKg, "Massa de fertilizante");
  const profile = UNL_G1503[input.product];
  const nFraction = profile.nPct / 100;
  const pFraction = profile.p2o5Pct / 100;
  const perKgProduct = profile.kgCaCO3EqPerKgN * nFraction;
  const perKgP2O5 = perKgProduct / pFraction;
  const total = input.productMassKg == null ? null : perKgProduct * input.productMassKg;
  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    product: input.product,
    grade: `${profile.nPct}-${profile.p2o5Pct}-0`,
    sourceFactorKgCaCO3EqPerKgN: profile.kgCaCO3EqPerKgN,
    kgCaCO3EqPerKgProduct: round(perKgProduct, 6),
    kgCaCO3EqPerKgP2O5: round(perKgP2O5, 6),
    totalKgCaCO3Eq: total == null ? null : round(total, 4),
    horizon: "SOURCE_DECLARED_POTENTIAL_ACIDITY" as const,
    source: "Wortmann, Mamo & Shapiro, University of Nebraska G1503, rev. 2009",
    automaticLimeAdjustmentAllowed: false as const,
  };
}

export const RESEARCH_READY_PROFILES = Object.freeze({
  rice: RICE_PROFILE,
  micronutrients: MICRO_PROFILE,
});
