import type { FertilityCycleCorrectionStrategy } from "./fertility-cycle-plan.ts";

export type ClimateWaterRisk =
  | "FAVORABLE"
  | "NEUTRAL"
  | "DRY_RISK"
  | "EXCESS_RAIN_RISK"
  | "MIXED"
  | "UNKNOWN";

export type ForecastConfidence = "LOW" | "MEDIUM" | "HIGH";

export type OfficialClimateSignal = {
  source: "INMET" | "CPTEC_INPE" | "ZARC" | "OTHER_OFFICIAL";
  publishedAt: string;
  targetPeriod: string;
  waterRisk: ClimateWaterRisk;
  confidence: ForecastConfidence;
  zarcRiskPercent?: 20 | 30 | 40 | null;
};

export type FertilityInvestmentStrategyInput = {
  climateSignal?: OfficialClimateSignal | null;
  totalCorrectionKgPerHa: { P2O5: number; K2O: number };
  annualMaintenanceKgPerHa: Array<{
    order: number;
    cropCode: string;
    P2O5: number | null;
    K2O: number | null;
  }>;
  correctionStrategiesAvailable: FertilityCycleCorrectionStrategy[];
  costPerKgNutrientEquivalent?: {
    P2O5?: number | null;
    K2O?: number | null;
  } | null;
};

export type FertilityInvestmentSeason = {
  order: number;
  cropCode: string;
  correctionKgPerHa: { P2O5: number; K2O: number };
  maintenanceKgPerHa: { P2O5: number | null; K2O: number | null };
  totalKgPerHa: { P2O5: number | null; K2O: number | null };
  estimatedCostPerHa: number | null;
};

export type FertilityInvestmentScenario = {
  strategy: FertilityCycleCorrectionStrategy;
  label: string;
  seasons: FertilityInvestmentSeason[];
  estimatedCycleCostPerHa: number | null;
  agronomicallyEquivalentCorrectionTotal: true;
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} deve ser finito e maior ou igual a zero.`);
}

function correctionSchedule(
  total: { P2O5: number; K2O: number },
  strategy: FertilityCycleCorrectionStrategy,
) {
  if (strategy === "TOTAL_AT_START") {
    return [{ order: 1, P2O5: total.P2O5, K2O: total.K2O }];
  }

  const firstP = round(total.P2O5 * (2 / 3), 1);
  const firstK = round(total.K2O * (2 / 3), 1);
  return [
    { order: 1, P2O5: firstP, K2O: firstK },
    { order: 2, P2O5: round(total.P2O5 - firstP, 1), K2O: round(total.K2O - firstK, 1) },
  ];
}

function nutrientEquivalentCost(input: {
  P2O5: number | null;
  K2O: number | null;
  cost?: FertilityInvestmentStrategyInput["costPerKgNutrientEquivalent"];
}) {
  if (input.P2O5 == null || input.K2O == null) return null;
  const pCost = input.cost?.P2O5;
  const kCost = input.cost?.K2O;
  if (pCost == null || kCost == null) return null;
  assertNonNegative(pCost, "Custo equivalente de P2O5");
  assertNonNegative(kCost, "Custo equivalente de K2O");
  return round(input.P2O5 * pCost + input.K2O * kCost, 2);
}

export function buildFertilityInvestmentScenarios(
  input: FertilityInvestmentStrategyInput,
): FertilityInvestmentScenario[] {
  assertNonNegative(input.totalCorrectionKgPerHa.P2O5, "Correção total de P2O5");
  assertNonNegative(input.totalCorrectionKgPerHa.K2O, "Correção total de K2O");

  return input.correctionStrategiesAvailable.map((strategy) => {
    const schedule = correctionSchedule(input.totalCorrectionKgPerHa, strategy);
    const seasons = input.annualMaintenanceKgPerHa.map((season) => {
      const correction = schedule.find((item) => item.order === season.order) ?? {
        order: season.order,
        P2O5: 0,
        K2O: 0,
      };
      const totalP = season.P2O5 == null ? null : round(season.P2O5 + correction.P2O5, 1);
      const totalK = season.K2O == null ? null : round(season.K2O + correction.K2O, 1);
      return {
        order: season.order,
        cropCode: season.cropCode,
        correctionKgPerHa: { P2O5: correction.P2O5, K2O: correction.K2O },
        maintenanceKgPerHa: { P2O5: season.P2O5, K2O: season.K2O },
        totalKgPerHa: { P2O5: totalP, K2O: totalK },
        estimatedCostPerHa: nutrientEquivalentCost({
          P2O5: totalP,
          K2O: totalK,
          cost: input.costPerKgNutrientEquivalent,
        }),
      };
    });

    const knownCosts = seasons.map((season) => season.estimatedCostPerHa);
    const numericCosts = knownCosts.filter((value): value is number => value != null);
    const estimatedCycleCostPerHa = numericCosts.length !== knownCosts.length
      ? null
      : round(numericCosts.reduce((sum, value) => sum + value, 0), 2);

    return {
      strategy,
      label: strategy === "TOTAL_AT_START"
        ? "Correção total no primeiro cultivo"
        : "Correção gradual em dois cultivos",
      seasons,
      estimatedCycleCostPerHa,
      agronomicallyEquivalentCorrectionTotal: true as const,
    };
  });
}

export function adviseFertilityInvestmentTiming(input: FertilityInvestmentStrategyInput) {
  const scenarios = buildFertilityInvestmentScenarios(input);
  const total = scenarios.find((item) => item.strategy === "TOTAL_AT_START") ?? null;
  const gradual = scenarios.find((item) => item.strategy === "GRADUAL_TWO_CROPS") ?? null;
  const climate = input.climateSignal ?? null;

  if (!climate || climate.waterRisk === "UNKNOWN" || climate.confidence === "LOW") {
    return {
      scenarios,
      preferredStrategy: null as FertilityCycleCorrectionStrategy | null,
      posture: "NO_CLIMATE_PREFERENCE" as const,
      climateCanChangeAgronomicNeed: false as const,
      maintenanceProtected: true as const,
      rationale: "Sem sinal climático oficial com confiança suficiente, o RAIZ compara custo e fluxo de caixa, mas não usa clima para preferir uma estratégia.",
      warnings: climate?.confidence === "LOW" ? ["LOW_FORECAST_CONFIDENCE"] : [],
    };
  }

  const lowerHistoricalRisk = climate.zarcRiskPercent == null || climate.zarcRiskPercent <= 30;

  if (
    climate.waterRisk === "FAVORABLE"
    && lowerHistoricalRisk
    && total
  ) {
    return {
      scenarios,
      preferredStrategy: "TOTAL_AT_START" as const,
      posture: "CONSIDER_ACCELERATING_VALID_CORRECTION" as const,
      climateCanChangeAgronomicNeed: false as const,
      maintenanceProtected: true as const,
      rationale: "O sinal climático é favorável e o risco ZARC informado não é elevado. Se caixa e preço dos insumos forem compatíveis, faz sentido considerar antecipar a correção estrutural tecnicamente válida, preservando a manutenção do cultivo.",
      warnings: ["CLIMATE_SIGNAL_SUPPORTS_TIMING_ONLY_NOT_DOSE"],
    };
  }

  if (
    (climate.waterRisk === "DRY_RISK" || climate.waterRisk === "EXCESS_RAIN_RISK" || climate.waterRisk === "MIXED")
    && gradual
  ) {
    return {
      scenarios,
      preferredStrategy: "GRADUAL_TWO_CROPS" as const,
      posture: "PRESERVE_CASH_WITHIN_VALID_PHASING" as const,
      climateCanChangeAgronomicNeed: false as const,
      maintenanceProtected: true as const,
      rationale: "O cenário climático aumenta o risco econômico da safra. O RAIZ pode preferir a correção gradual já homologada para reduzir desembolso inicial, sem reduzir a necessidade agronômica total nem eliminar a manutenção da cultura.",
      warnings: ["CLIMATE_SIGNAL_SUPPORTS_TIMING_ONLY_NOT_DOSE"],
    };
  }

  return {
    scenarios,
    preferredStrategy: null as FertilityCycleCorrectionStrategy | null,
    posture: "BALANCED_REVIEW" as const,
    climateCanChangeAgronomicNeed: false as const,
    maintenanceProtected: true as const,
    rationale: "O sinal climático não sustenta uma preferência automática entre as estratégias válidas. Compare preços, caixa, janela operacional e risco ZARC.",
    warnings: ["CLIMATE_SIGNAL_SUPPORTS_TIMING_ONLY_NOT_DOSE"],
  };
}
