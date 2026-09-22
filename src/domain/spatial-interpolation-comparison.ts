import type { StoredSpatialInterpolationValidationContextEvaluation } from "./spatial-interpolation-context.ts";
import type { SpatialMethod } from "./spatial-prescription-request.ts";

export type SpatialMethodMetricSnapshot = {
  method: SpatialMethod;
  sampleCount: number;
  strategy: "LOOCV" | "KFOLD" | "HOLDOUT";
  validationCount: number;
  rmse: number;
  mae: number;
  absoluteMeanError: number;
};

export type SpatialMethodComparisonEntry = SpatialMethodMetricSnapshot & {
  paretoStatus: "NON_DOMINATED" | "DOMINATED";
  dominatedBy: SpatialMethod[];
};

export type SpatialMethodComparison = {
  parameterCode: string;
  status:
    | "NOT_ENOUGH_VALIDATED_METHODS"
    | "NOT_COMPARABLE_VALIDATION_DESIGN"
    | "PARETO_COMPARISON_AVAILABLE";
  automaticMethodSelectionAllowed: false;
  automaticVariableRateAllowed: false;
  selectedMethod: null;
  comparisonBasis: {
    sampleCount: number | null;
    strategy: "LOOCV" | "KFOLD" | "HOLDOUT" | null;
    validationCount: number | null;
  };
  entries: SpatialMethodComparisonEntry[];
  limitations: string[];
};

function dominates(a: SpatialMethodMetricSnapshot, b: SpatialMethodMetricSnapshot) {
  const noWorse =
    a.rmse <= b.rmse
    && a.mae <= b.mae
    && a.absoluteMeanError <= b.absoluteMeanError;
  const strictlyBetter =
    a.rmse < b.rmse
    || a.mae < b.mae
    || a.absoluteMeanError < b.absoluteMeanError;
  return noWorse && strictlyBetter;
}

/**
 * Compara somente métodos já CURRENT + tecnicamente validados para o mesmo
 * parâmetro. A comparação usa Pareto (RMSE, MAE e |erro médio|): nunca cria
 * um escore composto, nunca escolhe pesos e nunca seleciona um método.
 *
 * Para comparar de forma defensável, todos os candidatos precisam ter sido
 * avaliados com o mesmo n, mesma estratégia de CV e mesmo validationCount.
 */
export function compareValidatedSpatialMethods(input: {
  parameterCode: string;
  validationEvidence: StoredSpatialInterpolationValidationContextEvaluation | null | undefined;
}): SpatialMethodComparison {
  const parameterCode = input.parameterCode.trim().toUpperCase();
  const base = {
    parameterCode,
    automaticMethodSelectionAllowed: false as const,
    automaticVariableRateAllowed: false as const,
    selectedMethod: null,
  };

  const eligible = (input.validationEvidence?.status === "RECORDED"
    ? input.validationEvidence.entries
    : [])
    .filter((entry) =>
      entry.parameterCode === parameterCode
      && entry.current
      && entry.officialSurfaceAllowed
      && entry.validation.status === "VALIDATED_FOR_OFFICIAL_SURFACE"
      && entry.validation.crossValidation != null
      && entry.validation.crossValidation.rmse != null
      && entry.validation.crossValidation.mae != null
      && entry.validation.crossValidation.meanError != null
    )
    .map((entry): SpatialMethodMetricSnapshot => ({
      method: entry.method,
      sampleCount: entry.currentSampleCount as number,
      strategy: entry.validation.crossValidation!.strategy,
      validationCount: entry.validation.crossValidation!.validationCount,
      rmse: entry.validation.crossValidation!.rmse as number,
      mae: entry.validation.crossValidation!.mae as number,
      absoluteMeanError: Math.abs(entry.validation.crossValidation!.meanError as number),
    }));

  if (eligible.length < 2) {
    const first = eligible[0] ?? null;
    return {
      ...base,
      status: "NOT_ENOUGH_VALIDATED_METHODS",
      comparisonBasis: {
        sampleCount: first?.sampleCount ?? null,
        strategy: first?.strategy ?? null,
        validationCount: first?.validationCount ?? null,
      },
      entries: eligible.map((item) => ({ ...item, paretoStatus: "NON_DOMINATED", dominatedBy: [] })),
      limitations: ["AT_LEAST_TWO_CURRENT_VALIDATED_METHODS_REQUIRED"],
    };
  }

  const first = eligible[0];
  const comparableDesign = eligible.every((item) =>
    item.sampleCount === first.sampleCount
    && item.strategy === first.strategy
    && item.validationCount === first.validationCount
  );
  if (!comparableDesign) {
    return {
      ...base,
      status: "NOT_COMPARABLE_VALIDATION_DESIGN",
      comparisonBasis: {
        sampleCount: null,
        strategy: null,
        validationCount: null,
      },
      entries: eligible.map((item) => ({ ...item, paretoStatus: "NON_DOMINATED", dominatedBy: [] })),
      limitations: ["SPATIAL_METHOD_VALIDATION_DESIGNS_DIFFER"],
    };
  }

  const entries = eligible.map((item): SpatialMethodComparisonEntry => {
    const dominatedBy = eligible
      .filter((other) => other.method !== item.method && dominates(other, item))
      .map((other) => other.method);
    return {
      ...item,
      paretoStatus: dominatedBy.length > 0 ? "DOMINATED" : "NON_DOMINATED",
      dominatedBy,
    };
  });

  const limitations: string[] = ["PROFESSIONAL_METHOD_SELECTION_REQUIRED"];
  if (entries.filter((entry) => entry.paretoStatus === "NON_DOMINATED").length > 1) {
    limitations.push("MULTIPLE_PARETO_METHODS_REMAIN");
  } else {
    limitations.push("PARETO_DOMINANCE_DOES_NOT_AUTHORIZE_AUTOMATIC_SELECTION");
  }

  return {
    ...base,
    status: "PARETO_COMPARISON_AVAILABLE",
    comparisonBasis: {
      sampleCount: first.sampleCount,
      strategy: first.strategy,
      validationCount: first.validationCount,
    },
    entries,
    limitations,
  };
}

export function compareAllValidatedSpatialMethods(
  validationEvidence: StoredSpatialInterpolationValidationContextEvaluation | null | undefined,
): SpatialMethodComparison[] {
  const parameters = [...new Set(
    validationEvidence?.status === "RECORDED"
      ? validationEvidence.entries.map((entry) => entry.parameterCode)
      : [],
  )].sort((a, b) => a.localeCompare(b));

  return parameters.map((parameterCode) =>
    compareValidatedSpatialMethods({ parameterCode, validationEvidence })
  );
}
