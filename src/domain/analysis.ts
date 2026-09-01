export const analysisStatuses = [
  "DRAFT",
  "COLLECTION_SCHEDULED",
  "COLLECTION_IN_PROGRESS",
  "AWAITING_LAB",
  "IMPORTED",
  "INCONSISTENT",
  "READY_TO_INTERPRET",
  "INTERPRETED",
  "AWAITING_REVIEW",
  "APPROVED",
  "REPORT_SENT",
  "ARCHIVED",
] as const;

export type AnalysisStatus = (typeof analysisStatuses)[number];

export type ConfidenceDimension = {
  key: "completeness" | "laboratory" | "ruleCompatibility" | "context" | "spatialQuality";
  label: string;
  score: number;
  weight: number;
};

export type TechnicalConfidence = {
  score: number;
  level: "HIGH" | "ADEQUATE" | "LIMITED" | "INSUFFICIENT";
  dimensions: ConfidenceDimension[];
  blockers: string[];
};

export type SoilResult = {
  parameter: string;
  value: number;
  unit: string;
  method: string;
  classification: "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | "NOT_CLASSIFIED";
  source: "MEASURED" | "CALCULATED";
};

export type InterpretationTrace = {
  ruleSetCode: string;
  ruleSetVersion: string;
  ruleSetHash: string;
  generatedAt: string;
  sourceResultIds: string[];
};

export type InterpretationOutput = {
  executiveSummary: string;
  limitingFactors: Array<{ label: string; severity: "LOW" | "MEDIUM" | "HIGH" }>;
  recommendations: Array<{
    title: string;
    rationale: string;
    priority: number;
    requiresReview: boolean;
  }>;
  assumptions: string[];
  warnings: string[];
  confidence: TechnicalConfidence;
  trace: InterpretationTrace;
};

export const interpretationWorkflow = [
  "IMPORTED",
  "VALIDATED",
  "CALCULATED",
  "AI_NARRATIVE_GENERATED",
  "IN_REVIEW",
  "APPROVED",
  "PUBLISHED",
] as const;
