export type ProductionCeilingNutrient =
  | "N" | "P2O5" | "K2O" | "S" | "Ca" | "Mg"
  | "B" | "Zn" | "Cu" | "Mn" | "Mo";

export type NutrientAvailabilityStatus =
  | "DEFICIENT"
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "ADEQUATE"
  | "HIGH"
  | "VERY_HIGH"
  | "UNKNOWN";

export type NutrientApplicationRoute =
  | "SOIL"
  | "FOLIAR"
  | "SEED"
  | "LIMING_REVIEW"
  | "GYPSUM_REVIEW";

export type DeterministicNutrientRequirement = {
  amount: number;
  unit: "kg/ha" | "g/ha";
  ruleId: string;
};

export type ProductionCeilingNutrientAuditInput = {
  cropCode: string;
  targetYieldTonPerHa: number | null;
  nutrient: ProductionCeilingNutrient;
  availabilityStatus: NutrientAvailabilityStatus;
  deterministicRequirement?: DeterministicNutrientRequirement | null;
  soilPhWater?: number | null;
  earlyNitrogenDeficiencyObserved?: boolean | null;
  visualDeficiencyObserved?: boolean | null;
};

export type ProductionCeilingNutrientAudit = {
  nutrient: ProductionCeilingNutrient;
  targetYieldTonPerHa: number | null;
  status:
    | "READY"
    | "NEEDS_DETERMINISTIC_SUPPLY"
    | "REVIEW_CORRECTION"
    | "NO_AUTOMATIC_SUPPLEMENT"
    | "BLOCKED";
  ceilingRisk: "NONE_IDENTIFIED" | "POTENTIAL_LIMITATION" | "CONFIRMED_LIMITATION" | "UNKNOWN";
  yieldScalingAllowed: boolean;
  exactRequirement: DeterministicNutrientRequirement | null;
  referenceDoseRange: { min: number; max: number; unit: "kg/ha" | "g/ha"; ruleId: string } | null;
  preferredRoutes: NutrientApplicationRoute[];
  agronomistReviewRequired: boolean;
  rationale: string;
  warnings: string[];
};

const DIRECT_YIELD_NUTRIENTS = new Set<ProductionCeilingNutrient>(["N", "P2O5", "K2O"]);

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function statusSuggestsDeficiency(status: NutrientAvailabilityStatus) {
  return status === "DEFICIENT" || status === "VERY_LOW" || status === "LOW";
}

function exactRequirementAudit(input: ProductionCeilingNutrientAuditInput): ProductionCeilingNutrientAudit | null {
  const requirement = input.deterministicRequirement;
  if (!requirement) return null;
  if (!Number.isFinite(requirement.amount) || requirement.amount < 0) {
    throw new Error("Necessidade determinística deve ser finita e maior ou igual a zero.");
  }

  if (requirement.amount === 0) {
    return {
      nutrient: input.nutrient,
      targetYieldTonPerHa: input.targetYieldTonPerHa,
      status: "READY",
      ceilingRisk: "NONE_IDENTIFIED",
      yieldScalingAllowed: DIRECT_YIELD_NUTRIENTS.has(input.nutrient),
      exactRequirement: requirement,
      referenceDoseRange: null,
      preferredRoutes: [],
      agronomistReviewRequired: false,
      rationale: "O motor determinístico não indicou complemento deste nutriente no contexto atual.",
      warnings: [],
    };
  }

  return {
    nutrient: input.nutrient,
    targetYieldTonPerHa: input.targetYieldTonPerHa,
    status: "NEEDS_DETERMINISTIC_SUPPLY",
    ceilingRisk: "CONFIRMED_LIMITATION",
    yieldScalingAllowed: DIRECT_YIELD_NUTRIENTS.has(input.nutrient),
    exactRequirement: requirement,
    referenceDoseRange: null,
    preferredRoutes: ["SOIL"],
    agronomistReviewRequired: false,
    rationale: `O motor determinístico já calculou a necessidade de ${requirement.amount} ${requirement.unit}; a camada comercial deve apenas escolher fonte/produto compatível e converter a garantia, sem recalcular a necessidade.`,
    warnings: input.nutrient === "S"
      ? ["SULFUR_REQUIREMENT_MUST_NOT_BE_YIELD_SCALED_UNLESS_THE_ACTIVE_RULE_EXPLICITLY_ALLOWS_IT"]
      : [],
  };
}

/**
 * Auditor de teto produtivo.
 *
 * O objetivo é responder "o que pode limitar a meta e qual a próxima ação?" sem
 * criar uma falsa relação linear entre produtividade e micronutrientes.
 *
 * - N/P/K: a meta produtiva pode participar do cálculo somente no motor específico
 *   já homologado; este auditor consome a necessidade pronta.
 * - S: consome a regra determinística ativa, mas não multiplica dose por rendimento
 *   quando essa regra não autoriza.
 * - Ca/Mg/B/Zn/Cu/Mn/Mo: suficiência/diagnóstico orienta a ação. Uma meta maior,
 *   sozinha, nunca cria dose.
 * - Mo na soja: preserva a evidência regional vigente. pHágua <5,5 + deficiência
 *   inicial de N abre contexto de resposta; a fonte regional prefere via foliar
 *   25-50 g Mo/ha em V2-V3, mas o ponto exato exige revisão profissional.
 * - Mn na soja: diagnose visual pode sustentar referência foliar de 350 g Mn/ha
 *   em fonte Embrapa; não é uma dose disparada apenas pela meta de rendimento.
 */
export function auditProductionCeilingNutrient(
  input: ProductionCeilingNutrientAuditInput,
): ProductionCeilingNutrientAudit {
  if (input.targetYieldTonPerHa != null && (!Number.isFinite(input.targetYieldTonPerHa) || input.targetYieldTonPerHa <= 0)) {
    throw new Error("Meta de produtividade deve ser nula ou maior que zero.");
  }

  const cropCode = input.cropCode.trim().toUpperCase();
  const exact = exactRequirementAudit(input);
  if (exact) return exact;

  if (DIRECT_YIELD_NUTRIENTS.has(input.nutrient)) {
    return {
      nutrient: input.nutrient,
      targetYieldTonPerHa: input.targetYieldTonPerHa,
      status: "BLOCKED",
      ceilingRisk: statusSuggestsDeficiency(input.availabilityStatus) ? "POTENTIAL_LIMITATION" : "UNKNOWN",
      yieldScalingAllowed: true,
      exactRequirement: null,
      referenceDoseRange: null,
      preferredRoutes: [],
      agronomistReviewRequired: false,
      rationale: "Este nutriente pode depender da meta produtiva, mas a necessidade deve vir do motor determinístico específico da cultura. O auditor não inventa a dose.",
      warnings: ["DETERMINISTIC_YIELD_REQUIREMENT_MISSING"],
    };
  }

  if (input.nutrient === "S") {
    return {
      nutrient: "S",
      targetYieldTonPerHa: input.targetYieldTonPerHa,
      status: statusSuggestsDeficiency(input.availabilityStatus) ? "REVIEW_CORRECTION" : "READY",
      ceilingRisk: statusSuggestsDeficiency(input.availabilityStatus) ? "POTENTIAL_LIMITATION" : "NONE_IDENTIFIED",
      yieldScalingAllowed: false,
      exactRequirement: null,
      referenceDoseRange: null,
      preferredRoutes: statusSuggestsDeficiency(input.availabilityStatus) ? ["SOIL"] : [],
      agronomistReviewRequired: statusSuggestsDeficiency(input.availabilityStatus),
      rationale: statusSuggestsDeficiency(input.availabilityStatus)
        ? "Enxofre baixo pode limitar o ambiente produtivo, mas a dose deve vir da regra regional/cultura/profundidade ativa. Não escalar automaticamente pela meta."
        : "Não há indicação automática de complemento de enxofre sem uma regra determinística ativa apontando necessidade.",
      warnings: ["SULFUR_YIELD_SCALING_NOT_AUTOMATIC"],
    };
  }

  if (input.nutrient === "Mo" && cropCode === "SOJA") {
    const responseContextMatched = finitePositive(input.soilPhWater)
      && input.soilPhWater < 5.5
      && input.earlyNitrogenDeficiencyObserved === true;

    if (!responseContextMatched) {
      return {
        nutrient: "Mo",
        targetYieldTonPerHa: input.targetYieldTonPerHa,
        status: "NO_AUTOMATIC_SUPPLEMENT",
        ceilingRisk: "NONE_IDENTIFIED",
        yieldScalingAllowed: false,
        exactRequirement: null,
        referenceDoseRange: null,
        preferredRoutes: [],
        agronomistReviewRequired: false,
        rationale: "Meta produtiva alta, isoladamente, não autoriza molibdênio. A fonte regional relaciona maior possibilidade de resposta a pHágua <5,5 associado à deficiência inicial de N.",
        warnings: ["MOLYBDENUM_NOT_LINEAR_WITH_YIELD_TARGET"],
      };
    }

    return {
      nutrient: "Mo",
      targetYieldTonPerHa: input.targetYieldTonPerHa,
      status: "REVIEW_CORRECTION",
      ceilingRisk: "POTENTIAL_LIMITATION",
      yieldScalingAllowed: false,
      exactRequirement: null,
      referenceDoseRange: {
        min: 25,
        max: 50,
        unit: "g/ha",
        ruleId: "MO-SOJA-RS-SC-2025-FOLIAR-REFERENCE",
      },
      preferredRoutes: ["FOLIAR"],
      agronomistReviewRequired: true,
      rationale: "O contexto regional de maior probabilidade de resposta ao Mo foi atendido. A fonte prefere aplicação foliar para reduzir o risco à inoculação, mas a RAIZ não escolhe automaticamente um ponto da faixa.",
      warnings: [
        "FOLIAR_REFERENCE_STAGE_V2_V3",
        "EXACT_MOLYBDENUM_DOSE_REQUIRES_PROFESSIONAL_SELECTION",
      ],
    };
  }

  if (input.nutrient === "Mn" && cropCode === "SOJA") {
    if (input.visualDeficiencyObserved === true) {
      return {
        nutrient: "Mn",
        targetYieldTonPerHa: input.targetYieldTonPerHa,
        status: "REVIEW_CORRECTION",
        ceilingRisk: "CONFIRMED_LIMITATION",
        yieldScalingAllowed: false,
        exactRequirement: null,
        referenceDoseRange: {
          min: 350,
          max: 350,
          unit: "g/ha",
          ruleId: "EMBRAPA-SOJA-MN-FOLIAR-VISUAL-DEFICIENCY",
        },
        preferredRoutes: ["FOLIAR"],
        agronomistReviewRequired: true,
        rationale: "Deficiência visual de manganês na soja sustenta referência foliar específica da Embrapa; a aplicação não é acionada apenas pela meta produtiva.",
        warnings: ["MN_FOLIAR_REFERENCE_REQUIRES_VISUAL_DEFICIENCY"],
      };
    }

    return {
      nutrient: "Mn",
      targetYieldTonPerHa: input.targetYieldTonPerHa,
      status: statusSuggestsDeficiency(input.availabilityStatus) ? "REVIEW_CORRECTION" : "NO_AUTOMATIC_SUPPLEMENT",
      ceilingRisk: statusSuggestsDeficiency(input.availabilityStatus) ? "POTENTIAL_LIMITATION" : "NONE_IDENTIFIED",
      yieldScalingAllowed: false,
      exactRequirement: null,
      referenceDoseRange: null,
      preferredRoutes: statusSuggestsDeficiency(input.availabilityStatus) ? ["SOIL"] : [],
      agronomistReviewRequired: statusSuggestsDeficiency(input.availabilityStatus),
      rationale: statusSuggestsDeficiency(input.availabilityStatus)
        ? "Manganês baixo merece correção/diagnóstico, mas a referência foliar da soja exige deficiência visual; a meta produtiva não cria dose foliar."
        : "Sem deficiência diagnosticada, não existe complemento automático de Mn por causa da meta produtiva.",
      warnings: [],
    };
  }

  if (input.nutrient === "Ca" || input.nutrient === "Mg") {
    const deficient = statusSuggestsDeficiency(input.availabilityStatus);
    return {
      nutrient: input.nutrient,
      targetYieldTonPerHa: input.targetYieldTonPerHa,
      status: deficient ? "REVIEW_CORRECTION" : "READY",
      ceilingRisk: deficient ? "POTENTIAL_LIMITATION" : "NONE_IDENTIFIED",
      yieldScalingAllowed: false,
      exactRequirement: null,
      referenceDoseRange: null,
      preferredRoutes: deficient
        ? input.nutrient === "Ca"
          ? ["LIMING_REVIEW", "GYPSUM_REVIEW", "SOIL"]
          : ["LIMING_REVIEW", "SOIL"]
        : [],
      agronomistReviewRequired: deficient,
      rationale: deficient
        ? "O cátion está abaixo do desejável e pode exigir correção do ambiente radicular. A escolha entre calcário, gesso ou outra fonte depende da acidez, profundidade, Mg e demais critérios; não usar aplicação foliar como atalho automático."
        : "Não há evidência atual de limitação que justifique complemento automático.",
      warnings: input.nutrient === "Ca" ? ["GYPSUM_DOES_NOT_REPLACE_LIMING"] : [],
    };
  }

  if (input.nutrient === "B" || input.nutrient === "Zn" || input.nutrient === "Cu") {
    const deficient = statusSuggestsDeficiency(input.availabilityStatus);
    return {
      nutrient: input.nutrient,
      targetYieldTonPerHa: input.targetYieldTonPerHa,
      status: deficient ? "REVIEW_CORRECTION" : "NO_AUTOMATIC_SUPPLEMENT",
      ceilingRisk: deficient ? "POTENTIAL_LIMITATION" : "NONE_IDENTIFIED",
      yieldScalingAllowed: false,
      exactRequirement: null,
      referenceDoseRange: null,
      preferredRoutes: deficient ? ["SOIL"] : [],
      agronomistReviewRequired: deficient,
      rationale: deficient
        ? "O teor baixo deve ser tratado como risco de limitação, mas o RAIZ só libera dose quando houver regra específica de cultura/região/método. Na soja, aplicação foliar genérica desses micronutrientes não deve ser presumida."
        : "Meta produtiva alta, sozinha, não justifica complemento automático deste micronutriente.",
      warnings: deficient ? ["CROP_REGION_DOSE_RULE_REQUIRED"] : [],
    };
  }

  return {
    nutrient: input.nutrient,
    targetYieldTonPerHa: input.targetYieldTonPerHa,
    status: statusSuggestsDeficiency(input.availabilityStatus) ? "REVIEW_CORRECTION" : "NO_AUTOMATIC_SUPPLEMENT",
    ceilingRisk: statusSuggestsDeficiency(input.availabilityStatus) ? "POTENTIAL_LIMITATION" : "UNKNOWN",
    yieldScalingAllowed: false,
    exactRequirement: null,
    referenceDoseRange: null,
    preferredRoutes: statusSuggestsDeficiency(input.availabilityStatus) ? ["SOIL"] : [],
    agronomistReviewRequired: statusSuggestsDeficiency(input.availabilityStatus),
    rationale: "Não existe regra quantitativa homologada neste auditor para transformar a meta produtiva em dose deste nutriente.",
    warnings: ["SPECIFIC_NUTRIENT_RULE_REQUIRED"],
  };
}
