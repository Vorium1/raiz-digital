import {
  MILHO_DOSE_TABLE,
  SOJA_DOSE_TABLE,
  TRIGO_DOSE_TABLE,
  computeGrainFertilizerDose,
  type GrainDoseTable,
  type SoilNutrientLevel,
} from "./fertilizer-dose-engine.ts";

export type FertilityCycleCorrectionStrategy = "TOTAL_AT_START" | "GRADUAL_TWO_CROPS";

export type FertilityCycleSeasonInput = {
  order: number;
  cropCode: string;
  targetYieldTonPerHa: number | null;
};

export type FertilityCyclePlanInput = {
  horizonYears: 2 | 3 | 4 | 5;
  phosphorusLevel: SoilNutrientLevel;
  potassiumLevel: SoilNutrientLevel;
  correctionStrategy: FertilityCycleCorrectionStrategy;
  seasons: FertilityCycleSeasonInput[];
};

export type FertilityCycleSeasonPlan = {
  order: number;
  cropCode: string;
  targetYieldTonPerHa: number | null;
  maintenanceKgPerHa: {
    P2O5: number | null;
    K2O: number | null;
  };
  correctionKgPerHa: {
    P2O5: number;
    K2O: number;
  };
  totalPlannedKgPerHa: {
    P2O5: number | null;
    K2O: number | null;
  };
  blockers: string[];
};

const CORRECTION_TOTAL: Record<SoilNutrientLevel, { P2O5: number; K2O: number }> = {
  "Muito Baixo": { P2O5: 160, K2O: 120 },
  Baixo: { P2O5: 80, K2O: 60 },
  Médio: { P2O5: 40, K2O: 30 },
  Alto: { P2O5: 0, K2O: 0 },
  "Muito Alto": { P2O5: 0, K2O: 0 },
};

const TABLES: Record<string, GrainDoseTable> = {
  SOJA: SOJA_DOSE_TABLE,
  MILHO: MILHO_DOSE_TABLE,
  TRIGO: TRIGO_DOSE_TABLE,
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function validateInput(input: FertilityCyclePlanInput) {
  if (![2, 3, 4, 5].includes(input.horizonYears)) {
    throw new Error("Horizonte de fertilidade deve ficar entre 2 e 5 anos.");
  }
  if (!input.seasons.length) {
    throw new Error("Informe ao menos um cultivo planejado para o ciclo.");
  }

  const orders = input.seasons.map((season) => season.order);
  if (new Set(orders).size !== orders.length) {
    throw new Error("Ordem de cultivo duplicada no plano de fertilidade.");
  }
  for (const season of input.seasons) {
    if (!Number.isInteger(season.order) || season.order < 1) {
      throw new Error("Ordem de cultivo deve ser um inteiro maior ou igual a 1.");
    }
    if (season.targetYieldTonPerHa != null && (!Number.isFinite(season.targetYieldTonPerHa) || season.targetYieldTonPerHa <= 0)) {
      throw new Error("Meta produtiva de cada cultivo deve ser nula ou maior que zero.");
    }
  }
}

function correctionSchedule(
  total: { P2O5: number; K2O: number },
  strategy: FertilityCycleCorrectionStrategy,
) {
  if (strategy === "TOTAL_AT_START") {
    return [
      { order: 1, P2O5: total.P2O5, K2O: total.K2O },
    ];
  }

  const firstP = round(total.P2O5 * (2 / 3), 1);
  const firstK = round(total.K2O * (2 / 3), 1);
  return [
    { order: 1, P2O5: firstP, K2O: firstK },
    {
      order: 2,
      P2O5: round(total.P2O5 - firstP, 1),
      K2O: round(total.K2O - firstK, 1),
    },
  ];
}

function maintenanceForSeason(season: FertilityCycleSeasonInput) {
  const table = TABLES[season.cropCode.trim().toUpperCase()];
  const blockers: string[] = [];

  if (!table) {
    blockers.push("CROP_MAINTENANCE_TABLE_NOT_HOMOLOGATED");
    return {
      P2O5: null,
      K2O: null,
      blockers,
    };
  }
  if (season.targetYieldTonPerHa == null) {
    blockers.push("TARGET_YIELD_MISSING_FOR_MAINTENANCE");
    return {
      P2O5: null,
      K2O: null,
      blockers,
    };
  }

  // Após a correção, a manutenção é representada pela faixa "Alto" da tabela
  // específica da cultura + o ajuste por rendimento acima da referência.
  const p = computeGrainFertilizerDose(
    table,
    "P2O5",
    "Alto",
    "PRIMEIRO",
    season.targetYieldTonPerHa,
  );
  const k = computeGrainFertilizerDose(
    table,
    "K2O",
    "Alto",
    "PRIMEIRO",
    season.targetYieldTonPerHa,
  );

  return {
    P2O5: p.doseKgPerHa,
    K2O: k.doseKgPerHa,
    blockers,
  };
}

/**
 * Planeja fertilidade entre duas análises de solo.
 *
 * A lógica separa:
 * 1) CORREÇÃO/CONSTRUÇÃO: elevar P/K conforme a classe atual;
 * 2) MANUTENÇÃO: repor o que cada cultura/meta exige em cada cultivo;
 * 3) REANÁLISE: o horizonte é explícito, não inferido da meta de uma safra.
 *
 * A função NÃO prevê produtividade futura. Ela quantifica a obrigação de
 * correção e a manutenção que precisaria ser reposta para sustentar o ambiente.
 */
export function buildFertilityCyclePlan(input: FertilityCyclePlanInput) {
  validateInput(input);

  const correctionTotal = {
    P2O5: CORRECTION_TOTAL[input.phosphorusLevel].P2O5,
    K2O: CORRECTION_TOTAL[input.potassiumLevel].K2O,
  };
  const schedule = correctionSchedule(correctionTotal, input.correctionStrategy);

  const seasonPlans: FertilityCycleSeasonPlan[] = input.seasons
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((season) => {
      const maintenance = maintenanceForSeason(season);
      const correction = schedule.find((item) => item.order === season.order) ?? {
        order: season.order,
        P2O5: 0,
        K2O: 0,
      };

      return {
        order: season.order,
        cropCode: season.cropCode.trim().toUpperCase(),
        targetYieldTonPerHa: season.targetYieldTonPerHa,
        maintenanceKgPerHa: {
          P2O5: maintenance.P2O5,
          K2O: maintenance.K2O,
        },
        correctionKgPerHa: {
          P2O5: correction.P2O5,
          K2O: correction.K2O,
        },
        totalPlannedKgPerHa: {
          P2O5: maintenance.P2O5 == null ? null : round(maintenance.P2O5 + correction.P2O5, 1),
          K2O: maintenance.K2O == null ? null : round(maintenance.K2O + correction.K2O, 1),
        },
        blockers: maintenance.blockers,
      };
    });

  const maintenanceDemand = seasonPlans.reduce(
    (acc, season) => ({
      P2O5: season.maintenanceKgPerHa.P2O5 == null ? acc.P2O5 : round(acc.P2O5 + season.maintenanceKgPerHa.P2O5, 1),
      K2O: season.maintenanceKgPerHa.K2O == null ? acc.K2O : round(acc.K2O + season.maintenanceKgPerHa.K2O, 1),
    }),
    { P2O5: 0, K2O: 0 },
  );

  const blockedSeasons = seasonPlans.filter((season) => season.blockers.length > 0);

  return {
    horizonYears: input.horizonYears,
    correctionStrategy: input.correctionStrategy,
    correctionTotalKgPerHa: correctionTotal,
    correctionScheduleKgPerHa: schedule,
    seasonPlans,
    plannedMaintenanceDemandKgPerHa: maintenanceDemand,
    correctionOnlyScenario: {
      productivityForecastAllowed: false as const,
      expectedYieldTonPerHa: null,
      reason: "A correção inicial melhora a fertilidade, mas não permite prever uma produtividade média futura sem clima, genética, sanidade e manejo. O risco operacional é quantificado pelo déficit de manutenção que deixaria de ser reposto.",
      skippedMaintenanceKgPerHa: maintenanceDemand,
    },
    planningStatus: blockedSeasons.length === 0 ? "READY" as const : "PARTIAL" as const,
    blockers: blockedSeasons.flatMap((season) =>
      season.blockers.map((code) => ({ seasonOrder: season.order, code })),
    ),
    principles: {
      limingIsSystemDecision: true as const,
      limeTypicalResidualYears: { min: 3, max: 5 } as const,
      pkCorrectionCanBeGradualOverTwoCrops: true as const,
      annualMaintenanceStillRequired: true as const,
      productivityGuaranteeForbidden: true as const,
    },
  };
}
