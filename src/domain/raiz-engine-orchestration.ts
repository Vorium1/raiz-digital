export type EngineRegionResolution =
  | "POLYGON"
  | "MUNICIPALITY"
  | "STATE"
  | "COUNTRY"
  | "UNRESOLVED";

export type SharedEngineLocationContext = {
  countryCode: string;
  stateCode: string | null;
  municipalityCode: string | null;
  latitude: number | null;
  longitude: number | null;
  technicalRegionCodes: string[];
  resolution: EngineRegionResolution;
};

export type SharedEngineCropContext = {
  cropCode: string;
  phenologicalStage: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  targetYieldTonPerHa: number | null;
};

export type SharedEngineSoilCycleContext = {
  analysisId: string;
  fieldId: string;
  fertilityPlanningHorizonYears: 2 | 3 | 4 | 5 | null;
};

export type RaizSharedEngineContext = {
  schemaVersion: 1;
  location: SharedEngineLocationContext;
  crop: SharedEngineCropContext;
  soilCycle: SharedEngineSoilCycleContext;
};

export type FertilityEngineState = {
  status: "READY" | "PARTIAL" | "BLOCKED";
  sourceGenerationId: string | null;
  deterministicCorrectionReady: boolean;
  annualMaintenanceReady: boolean;
};

export type AgroclimateEngineState = {
  status: "READY" | "PARTIAL" | "BLOCKED";
  sourceGenerationId: string | null;
  matchedClimateProfileIds: string[];
  riskDriverCount: number;
};

export type InvestmentEngineReadiness = {
  canCompareCorrectionCashFlow: boolean;
  canUseClimatePreference: boolean;
  canUseYieldScenarioPosture: boolean;
  blockers: string[];
  warnings: string[];
};

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function validDate(value: string | null) {
  if (value == null) return true;
  return Number.isFinite(Date.parse(value));
}

function validateSharedContext(context: RaizSharedEngineContext) {
  if (context.schemaVersion !== 1) throw new Error("Versão de contexto dos motores não suportada.");
  if (!normalized(context.location.countryCode)) throw new Error("País é obrigatório no contexto compartilhado.");
  if (!normalized(context.crop.cropCode)) throw new Error("Cultura é obrigatória no contexto compartilhado.");
  if (!context.soilCycle.analysisId.trim()) throw new Error("analysisId é obrigatório.");
  if (!context.soilCycle.fieldId.trim()) throw new Error("fieldId é obrigatório.");

  if (!validDate(context.crop.plannedStart) || !validDate(context.crop.plannedEnd)) {
    throw new Error("Janela planejada da cultura contém data inválida.");
  }
  if (
    context.crop.plannedStart
    && context.crop.plannedEnd
    && Date.parse(context.crop.plannedEnd) < Date.parse(context.crop.plannedStart)
  ) {
    throw new Error("Janela planejada termina antes de começar.");
  }

  if (
    context.crop.targetYieldTonPerHa != null
    && (!Number.isFinite(context.crop.targetYieldTonPerHa) || context.crop.targetYieldTonPerHa <= 0)
  ) {
    throw new Error("Meta produtiva deve ser nula ou maior que zero.");
  }

  const hasLat = Number.isFinite(context.location.latitude);
  const hasLon = Number.isFinite(context.location.longitude);
  if (hasLat !== hasLon) throw new Error("Latitude e longitude devem ser informadas juntas.");
  if (hasLat && (context.location.latitude! < -90 || context.location.latitude! > 90)) {
    throw new Error("Latitude fora do intervalo válido.");
  }
  if (hasLon && (context.location.longitude! < -180 || context.location.longitude! > 180)) {
    throw new Error("Longitude fora do intervalo válido.");
  }
}

/**
 * Contrato de coordenação dos três motores RAIZ.
 *
 * 1. FERTILIDADE: decide correção/construção/manutenção deterministicamente.
 * 2. AGROCLIMA: interpreta risco por cultura × região × estádio × janela.
 * 3. INVESTIMENTO: compara timing/custo usando SOMENTE saídas dos dois anteriores.
 *
 * Nenhum motor ganha permissão para fazer o trabalho do outro.
 */
export function resolveThreeEngineReadiness(input: {
  context: RaizSharedEngineContext;
  fertility: FertilityEngineState;
  agroclimate: AgroclimateEngineState;
}): InvestmentEngineReadiness {
  validateSharedContext(input.context);

  const blockers: string[] = [];
  const warnings: string[] = [];

  const canCompareCorrectionCashFlow = input.fertility.deterministicCorrectionReady;
  if (!canCompareCorrectionCashFlow) {
    blockers.push("DETERMINISTIC_CORRECTION_NOT_READY");
  }

  if (!input.fertility.annualMaintenanceReady) {
    warnings.push("ANNUAL_MAINTENANCE_PARTIAL");
  }

  const locationResolved =
    input.context.location.resolution !== "UNRESOLVED"
    && input.context.location.technicalRegionCodes.length > 0;

  if (!locationResolved) {
    warnings.push("TECHNICAL_REGION_NOT_RESOLVED");
  }

  const cropWindowResolved = Boolean(
    input.context.crop.phenologicalStage
    && input.context.crop.plannedStart
    && input.context.crop.plannedEnd,
  );
  if (!cropWindowResolved) {
    warnings.push("CROP_STAGE_OR_WINDOW_NOT_RESOLVED");
  }

  const climateProfileResolved =
    input.agroclimate.status === "READY"
    && input.agroclimate.matchedClimateProfileIds.length > 0;

  if (!climateProfileResolved) {
    warnings.push("AGROCLIMATE_PROFILE_NOT_READY");
  }

  const canUseClimatePreference =
    canCompareCorrectionCashFlow
    && locationResolved
    && cropWindowResolved
    && climateProfileResolved;

  const canUseYieldScenarioPosture =
    canUseClimatePreference
    && input.context.crop.targetYieldTonPerHa != null;

  return {
    canCompareCorrectionCashFlow,
    canUseClimatePreference,
    canUseYieldScenarioPosture,
    blockers,
    warnings: [...new Set(warnings)],
  };
}

export function normalizeSharedEngineContext(
  input: RaizSharedEngineContext,
): RaizSharedEngineContext {
  validateSharedContext(input);
  return {
    ...input,
    location: {
      ...input.location,
      countryCode: normalized(input.location.countryCode),
      stateCode: input.location.stateCode ? normalized(input.location.stateCode) : null,
      municipalityCode: input.location.municipalityCode?.trim() || null,
      technicalRegionCodes: [...new Set(input.location.technicalRegionCodes.map(normalized).filter(Boolean))],
    },
    crop: {
      ...input.crop,
      cropCode: normalized(input.crop.cropCode),
      phenologicalStage: input.crop.phenologicalStage ? normalized(input.crop.phenologicalStage) : null,
    },
  };
}
