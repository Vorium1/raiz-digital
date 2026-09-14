import {
  computeSingleProductRateFromNutrient,
  solveTwoProductPkPlan,
  type CommercialFertilizerProduct,
  type CommercialNutrient,
  type NutrientTargets,
  type ProductRateEvaluation,
  type TwoProductPkSolution,
} from "./commercial-input-engine.ts";

/**
 * Matriz de cenários da RAIZ.
 *
 * O eixo AGRONÔMICO chega pronto: meta produtiva numérica + necessidade de nutrientes calculada pelo
 * motor determinístico/revisada profissionalmente. Este módulo NÃO transforma os rótulos "baixa",
 * "média", "alta", "econômico" ou "premium" em dose.
 *
 * O eixo COMERCIAL escolhe somente cesta/preço/logística. Portanto duas estratégias comerciais avaliadas
 * contra o mesmo cenário agronômico recebem exatamente os mesmos alvos de nutrientes.
 */

export type AgronomicTargetProvenance = {
  kind: "DETERMINISTIC_ENGINE" | "PROFESSIONAL_APPROVED";
  referenceId: string;
  description?: string | null;
};

export type AgronomicTargetScenario = {
  id: string;
  label: string;
  /** Nunca inferida pelo label; precisa vir explicitamente em t/ha. */
  targetYieldTonPerHa: number;
  /** Necessidades já decididas upstream; este módulo não recalcula fertilidade. */
  targetsKgPerHa: NutrientTargets;
  provenance: AgronomicTargetProvenance;
  /**
   * Gate obrigatório para cenário uniforme. Ex.: Área 01/Cabeda deve ficar false para P enquanto a
   * heterogeneidade não tiver decisão técnica segura; o cenário não pode esconder isso com uma média.
   */
  uniformApplicationReady: boolean;
  uniformApplicationBlockers?: string[];
};

export type CommercialStrategy =
  | {
      id: string;
      label: string;
      kind: "TWO_PRODUCT_PK";
      productA: CommercialFertilizerProduct;
      productB: CommercialFertilizerProduct;
    }
  | {
      id: string;
      label: string;
      kind: "SINGLE_PRODUCT";
      product: CommercialFertilizerProduct;
      driverNutrient: CommercialNutrient;
    };

export type ScenarioCellResult =
  | {
      status: "READY";
      agronomicScenarioId: string;
      agronomicScenarioLabel: string;
      targetYieldTonPerHa: number;
      agronomicTargetsKgPerHa: NutrientTargets;
      provenance: AgronomicTargetProvenance;
      commercialStrategyId: string;
      commercialStrategyLabel: string;
      plan: ProductRateEvaluation | TwoProductPkSolution;
    }
  | {
      status: "BLOCKED";
      agronomicScenarioId: string;
      agronomicScenarioLabel: string;
      targetYieldTonPerHa: number;
      agronomicTargetsKgPerHa: NutrientTargets;
      provenance: AgronomicTargetProvenance;
      commercialStrategyId: string;
      commercialStrategyLabel: string;
      blockers: string[];
    };

export type RecommendationScenarioMatrix = {
  agronomicScenarios: AgronomicTargetScenario[];
  commercialStrategies: Array<Pick<CommercialStrategy, "id" | "label" | "kind">>;
  cells: ScenarioCellResult[];
};

function assertScenarioIdentity(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} é obrigatório.`);
}

function validateAgronomicScenario(scenario: AgronomicTargetScenario) {
  assertScenarioIdentity(scenario.id, "ID do cenário agronômico");
  assertScenarioIdentity(scenario.label, "Nome do cenário agronômico");
  if (!Number.isFinite(scenario.targetYieldTonPerHa) || scenario.targetYieldTonPerHa <= 0) {
    throw new Error("Meta produtiva do cenário deve ser um número finito maior que zero em t/ha.");
  }
  if (!scenario.provenance.referenceId.trim()) {
    throw new Error("Cenário agronômico precisa de referência de proveniência do alvo.");
  }
}

function validateCommercialStrategy(strategy: CommercialStrategy) {
  assertScenarioIdentity(strategy.id, "ID da estratégia comercial");
  assertScenarioIdentity(strategy.label, "Nome da estratégia comercial");
}

function blockedCell(
  scenario: AgronomicTargetScenario,
  strategy: CommercialStrategy,
  blockers: string[],
): ScenarioCellResult {
  return {
    status: "BLOCKED",
    agronomicScenarioId: scenario.id,
    agronomicScenarioLabel: scenario.label,
    targetYieldTonPerHa: scenario.targetYieldTonPerHa,
    agronomicTargetsKgPerHa: { ...scenario.targetsKgPerHa },
    provenance: { ...scenario.provenance },
    commercialStrategyId: strategy.id,
    commercialStrategyLabel: strategy.label,
    blockers,
  };
}

function evaluateCell(input: {
  scenario: AgronomicTargetScenario;
  strategy: CommercialStrategy;
  areaHa?: number | null;
}): ScenarioCellResult {
  const { scenario, strategy, areaHa } = input;
  if (!scenario.uniformApplicationReady) {
    return blockedCell(
      scenario,
      strategy,
      scenario.uniformApplicationBlockers?.length
        ? [...scenario.uniformApplicationBlockers]
        : ["Aplicação uniforme não possui base técnica suficiente para este cenário."],
    );
  }

  try {
    let plan: ProductRateEvaluation | TwoProductPkSolution;
    if (strategy.kind === "TWO_PRODUCT_PK") {
      const p = scenario.targetsKgPerHa.P2O5;
      const k = scenario.targetsKgPerHa.K2O;
      if (p == null || k == null) {
        return blockedCell(scenario, strategy, ["Alvos exatos de P2O5 e K2O são obrigatórios para resolver uma cesta P/K de dois produtos."]);
      }
      plan = solveTwoProductPkPlan({
        productA: strategy.productA,
        productB: strategy.productB,
        targetP2O5KgPerHa: p,
        targetK2OKgPerHa: k,
        additionalTargetsKgPerHa: scenario.targetsKgPerHa,
        areaHa,
      });
    } else {
      const target = scenario.targetsKgPerHa[strategy.driverNutrient];
      if (target == null) {
        return blockedCell(scenario, strategy, [`O cenário não possui alvo de ${strategy.driverNutrient} para usar como nutriente-guia.`]);
      }
      plan = computeSingleProductRateFromNutrient({
        product: strategy.product,
        driverNutrient: strategy.driverNutrient,
        targetKgPerHa: target,
        allTargetsKgPerHa: scenario.targetsKgPerHa,
        areaHa,
      });
    }

    return {
      status: "READY",
      agronomicScenarioId: scenario.id,
      agronomicScenarioLabel: scenario.label,
      targetYieldTonPerHa: scenario.targetYieldTonPerHa,
      agronomicTargetsKgPerHa: { ...scenario.targetsKgPerHa },
      provenance: { ...scenario.provenance },
      commercialStrategyId: strategy.id,
      commercialStrategyLabel: strategy.label,
      plan,
    };
  } catch (error) {
    return blockedCell(scenario, strategy, [
      error instanceof Error ? `Estratégia comercial inviável: ${error.message}` : "Estratégia comercial inviável.",
    ]);
  }
}

/**
 * Faz o produto cartesiano cenário agronômico × estratégia comercial.
 * Não existe comportamento especial por label: trocar "baixo" por "alto investimento" sem mudar os
 * produtos/preços mantém exatamente o mesmo resultado físico e econômico.
 */
export function buildRecommendationScenarioMatrix(input: {
  agronomicScenarios: AgronomicTargetScenario[];
  commercialStrategies: CommercialStrategy[];
  areaHa?: number | null;
}): RecommendationScenarioMatrix {
  if (!input.agronomicScenarios.length) throw new Error("Informe ao menos um cenário agronômico.");
  if (!input.commercialStrategies.length) throw new Error("Informe ao menos uma estratégia comercial.");
  if (input.areaHa != null && (!Number.isFinite(input.areaHa) || input.areaHa <= 0)) {
    throw new Error("Área do talhão deve ser maior que zero.");
  }

  const scenarioIds = new Set<string>();
  for (const scenario of input.agronomicScenarios) {
    validateAgronomicScenario(scenario);
    if (scenarioIds.has(scenario.id)) throw new Error(`ID de cenário agronômico duplicado: ${scenario.id}.`);
    scenarioIds.add(scenario.id);
  }

  const strategyIds = new Set<string>();
  for (const strategy of input.commercialStrategies) {
    validateCommercialStrategy(strategy);
    if (strategyIds.has(strategy.id)) throw new Error(`ID de estratégia comercial duplicado: ${strategy.id}.`);
    strategyIds.add(strategy.id);
  }

  return {
    agronomicScenarios: input.agronomicScenarios.map((scenario) => ({
      ...scenario,
      targetsKgPerHa: { ...scenario.targetsKgPerHa },
      provenance: { ...scenario.provenance },
      uniformApplicationBlockers: scenario.uniformApplicationBlockers ? [...scenario.uniformApplicationBlockers] : undefined,
    })),
    commercialStrategies: input.commercialStrategies.map(({ id, label, kind }) => ({ id, label, kind })),
    cells: input.agronomicScenarios.flatMap((scenario) =>
      input.commercialStrategies.map((strategy) => evaluateCell({ scenario, strategy, areaHa: input.areaHa })),
    ),
  };
}
