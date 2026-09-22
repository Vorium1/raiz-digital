import type { AnalysisEvidence, EvidenceStatus } from "./analysis-depth-readiness";
import type { IrrigationApplication } from "./irrigation-applications";

export type WaterRegime = "" | "SEQUEIRO" | "IRRIGADO";

export type AnalysisContextDraft = {
  schemaVersion: 1;
  objective: string;
  samplingDepthLabel: string;
  waterRegime: WaterRegime;
  irrigationSystem: string;
  irrigationDepthMm: number | null;
  irrigationFrequencyDays: number | null;
  irrigationApplicationTime: string;
  irrigationNotes: string;
  irrigationApplications?: IrrigationApplication[];
  tillageSystem: string;
  managementHistoryStatus: EvidenceStatus;
  managementHistoryNotes: string;
  plannedManagementNotes: string;
  fertilityPlanningHorizonYears: 2 | 3 | 4 | 5 | null;
  fertilityCyclePlanNotes: string;
  soilContextNotes: string;
  yieldHistoryStatus: EvidenceStatus;
  yieldHistoryNotes: string;
  waterHistoryStatus: EvidenceStatus;
  waterHistoryNotes: string;
  multiSeasonHistoryStatus: EvidenceStatus;
  multiSeasonHistoryNotes: string;
  weatherContextStatus: EvidenceStatus;
  weatherContextNotes: string;
  spatialRequested: boolean;
  samplesGeoreferenced: boolean;
};

export const EMPTY_ANALYSIS_CONTEXT_DRAFT: AnalysisContextDraft = {
  schemaVersion: 1,
  objective: "",
  samplingDepthLabel: "",
  waterRegime: "",
  irrigationSystem: "",
  irrigationDepthMm: null,
  irrigationFrequencyDays: null,
  irrigationApplicationTime: "",
  irrigationNotes: "",
  tillageSystem: "",
  managementHistoryStatus: "MISSING",
  managementHistoryNotes: "",
  plannedManagementNotes: "",
  fertilityPlanningHorizonYears: null,
  fertilityCyclePlanNotes: "",
  soilContextNotes: "",
  yieldHistoryStatus: "MISSING",
  yieldHistoryNotes: "",
  waterHistoryStatus: "MISSING",
  waterHistoryNotes: "",
  multiSeasonHistoryStatus: "MISSING",
  multiSeasonHistoryNotes: "",
  weatherContextStatus: "MISSING",
  weatherContextNotes: "",
  spatialRequested: false,
  samplesGeoreferenced: false,
};

export function buildAnalysisEvidence(
  draft: AnalysisContextDraft,
  external: {
    currentSoilAnalysis: boolean;
    crop: boolean;
    yieldGoal: boolean;
    yieldUnit: boolean;
    fieldBoundaryGeoreferenced: boolean;
    registeredSoilContext?: boolean;
  },
): AnalysisEvidence {
  return {
    currentSoilAnalysis: external.currentSoilAnalysis,
    samplingDepth: draft.samplingDepthLabel.trim().length > 0,
    crop: external.crop,
    yieldGoal: external.yieldGoal,
    yieldUnit: external.yieldUnit,
    waterRegime: draft.waterRegime !== "",
    tillageSystem: draft.tillageSystem.trim().length > 0,
    managementHistory: draft.managementHistoryStatus,
    soilContext: Boolean(external.registeredSoilContext) || draft.soilContextNotes.trim().length > 0,
    yieldHistory: draft.yieldHistoryStatus,
    waterHistory: draft.waterHistoryStatus,
    multiSeasonHistory: draft.multiSeasonHistoryStatus,
    weatherContext: draft.weatherContextStatus,
    spatialRequested: draft.spatialRequested,
    fieldBoundaryGeoreferenced: external.fieldBoundaryGeoreferenced,
    samplesGeoreferenced: draft.samplesGeoreferenced,
  };
}
