export type LimingRestrictionAssessmentContext = {
  yieldBelowLocalAverageEspeciallyInDrought: boolean | null;
  compactionRestrictsRootGrowthAtDepth: boolean | null;
  phosphorus10To20BelowCritical: boolean | null;
  agronomistConfirmedIncorporationDecision: boolean | null;
};

export type LimingManagementContext = {
  yearsSinceLastLiming: number | null;
  restrictionAssessment: LimingRestrictionAssessmentContext | null;
};

export const EMPTY_LIMING_RESTRICTION_ASSESSMENT: LimingRestrictionAssessmentContext = {
  yieldBelowLocalAverageEspeciallyInDrought: null,
  compactionRestrictsRootGrowthAtDepth: null,
  phosphorus10To20BelowCritical: null,
  agronomistConfirmedIncorporationDecision: null,
};

export const EMPTY_LIMING_MANAGEMENT_CONTEXT: LimingManagementContext = {
  yearsSinceLastLiming: null,
  restrictionAssessment: null,
};

function nullableBoolean(value: unknown, label: string): boolean | null {
  if (value == null || value === "") return null;
  if (value === true || value === false) return value;
  throw new Error(`${label} deve ser sim, não ou não informado.`);
}

function nullableYears(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Anos desde a última calagem deve ser um número finito maior ou igual a zero.");
  }
  return Math.round(number * 100) / 100;
}

/**
 * Contexto declarado/avaliado para a decisão de calagem.
 *
 * Campos desconhecidos permanecem null. Em especial, null NÃO é convertido em false:
 * ausência de evidência nunca significa ausência de restrição.
 */
export function parseLimingManagementContext(value: unknown): LimingManagementContext {
  if (value == null) return { ...EMPTY_LIMING_MANAGEMENT_CONTEXT };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Contexto de calagem inválido.");
  }
  const source = value as Record<string, unknown>;
  const restrictionRaw = source.restrictionAssessment;

  let restrictionAssessment: LimingRestrictionAssessmentContext | null = null;
  if (restrictionRaw != null) {
    if (typeof restrictionRaw !== "object" || Array.isArray(restrictionRaw)) {
      throw new Error("Avaliação de restrições 10–20 cm inválida.");
    }
    const restriction = restrictionRaw as Record<string, unknown>;
    restrictionAssessment = {
      yieldBelowLocalAverageEspeciallyInDrought: nullableBoolean(
        restriction.yieldBelowLocalAverageEspeciallyInDrought,
        "Produtividade abaixo da média local, especialmente em seca",
      ),
      compactionRestrictsRootGrowthAtDepth: nullableBoolean(
        restriction.compactionRestrictsRootGrowthAtDepth,
        "Compactação restringindo o crescimento radicular em profundidade",
      ),
      phosphorus10To20BelowCritical: nullableBoolean(
        restriction.phosphorus10To20BelowCritical,
        "Fósforo em 10–20 cm abaixo do crítico",
      ),
      agronomistConfirmedIncorporationDecision: nullableBoolean(
        restriction.agronomistConfirmedIncorporationDecision,
        "Confirmação profissional da decisão de incorporação",
      ),
    };
  }

  return {
    yearsSinceLastLiming: nullableYears(source.yearsSinceLastLiming),
    restrictionAssessment,
  };
}

export function limingManagementContextFromAnalysisContext(context: unknown): unknown {
  if (!context || typeof context !== "object" || Array.isArray(context)) return undefined;
  const draft = (context as { draft?: unknown }).draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return undefined;
  return (draft as { limingContext?: unknown }).limingContext;
}

export function evaluateStoredLimingManagementContext(value: unknown) {
  try {
    const context = parseLimingManagementContext(value);
    const assessment = context.restrictionAssessment;
    const hasRestrictionEvidence = Boolean(assessment && Object.values(assessment).some((item) => item !== null));
    return {
      status: context.yearsSinceLastLiming != null || hasRestrictionEvidence ? "AVAILABLE" as const : "NOT_PROVIDED" as const,
      context,
      limitations: [] as string[],
    };
  } catch (error) {
    return {
      status: "INVALID_OPTIONAL_EVIDENCE" as const,
      context: { ...EMPTY_LIMING_MANAGEMENT_CONTEXT },
      limitations: [error instanceof Error ? error.message : "Contexto de calagem inválido."],
    };
  }
}
