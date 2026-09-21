import { buildRuleTrace } from "./agronomic-rule-catalog.ts";
import type { NitrogenRecommendation } from "./nitrogen-dose-engine.ts";

export const PRESCRIPTION_NITROGEN_RULE_IDS = [
  "N-MILHO-CQFS-2016",
  "N-TRIGO-EMBRAPA-2026",
  "N-CANOLA-CQFS-2016",
  "N-GRAMINEA-INVERNO-CQFS-2016",
] as const;

export type PrescriptionNitrogenRuleId = typeof PRESCRIPTION_NITROGEN_RULE_IDS[number];

export type PersistedNitrogenExecution = {
  id: string;
  ruleId: string;
  ruleVersion: string;
  sourceSnapshotId: string;
  executionStatus: string;
  createdAt: string;
  inputPayload: unknown;
  outputPayload: unknown;
};

export type NitrogenExecutionEvidence =
  | {
      status: "CURRENT";
      executionId: string;
      executionStatus: "READY_FOR_IMPLEMENTATION" | "REQUIRES_AGRONOMIST_REVIEW";
      recommendation: NitrogenRecommendation;
      ruleId: PrescriptionNitrogenRuleId;
      ruleVersion: string;
      sourceSnapshotId: string;
      createdAt: string;
      limitations: string[];
    }
  | {
      status: "STALE" | "INVALID";
      executionId: string | null;
      recommendation: null;
      ruleId: string | null;
      limitations: string[];
    }
  | {
      status: "NOT_AVAILABLE";
      executionId: null;
      recommendation: null;
      ruleId: null;
      limitations: string[];
    };

function supportedRule(value: string): value is PrescriptionNitrogenRuleId {
  return (PRESCRIPTION_NITROGEN_RULE_IDS as readonly string[]).includes(value);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sameTimestamp(a: unknown, b: string) {
  if (typeof a !== "string") return false;
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function parseDose(value: unknown) {
  const candidate = object(value);
  if (!candidate || typeof candidate.kind !== "string") return null;
  if (candidate.kind === "EXACT" && typeof candidate.kgNPerHa === "number" && Number.isFinite(candidate.kgNPerHa) && candidate.kgNPerHa >= 0) {
    return { kind: "EXACT" as const, kgNPerHa: candidate.kgNPerHa };
  }
  if (
    candidate.kind === "RANGE"
    && typeof candidate.minKgNPerHa === "number"
    && typeof candidate.maxKgNPerHa === "number"
    && Number.isFinite(candidate.minKgNPerHa)
    && Number.isFinite(candidate.maxKgNPerHa)
    && candidate.minKgNPerHa >= 0
    && candidate.maxKgNPerHa >= candidate.minKgNPerHa
  ) {
    return { kind: "RANGE" as const, minKgNPerHa: candidate.minKgNPerHa, maxKgNPerHa: candidate.maxKgNPerHa };
  }
  if (candidate.kind === "BLOCKED" && typeof candidate.reason === "string" && candidate.reason.trim()) {
    return { kind: "BLOCKED" as const, reason: candidate.reason };
  }
  return null;
}

function parseRecommendation(value: unknown, expectedRuleId: PrescriptionNitrogenRuleId): NitrogenRecommendation | null {
  const candidate = object(value);
  if (!candidate) return null;
  if (candidate.ruleId !== expectedRuleId) return null;
  if (typeof candidate.crop !== "string") return null;
  if (typeof candidate.ruleVersion !== "string" || typeof candidate.sourceSnapshotId !== "string") return null;
  if (candidate.status !== "READY_FOR_IMPLEMENTATION" && candidate.status !== "REQUIRES_AGRONOMIST_REVIEW") return null;
  const dose = parseDose(candidate.dose);
  if (!dose) return null;
  if (!Array.isArray(candidate.blockers) || !candidate.blockers.every((item) => typeof item === "string")) return null;
  if (!Array.isArray(candidate.notes) || !candidate.notes.every((item) => typeof item === "string")) return null;
  if (typeof candidate.source !== "string") return null;

  // O restante é JSON congelado pelo próprio motor. O cast vem somente depois
  // de validar os campos que autorizam ou bloqueiam dose no laudo.
  return { ...candidate, dose } as NitrogenRecommendation;
}

/**
 * Prova que uma execução de N ainda representa exatamente a safra, a regra e
 * o conjunto de matéria orgânica usados pelo laudo corrente.
 *
 * Execuções antigas sem fingerprint permanecem históricas e nunca são
 * promovidas automaticamente.
 */
export function evaluatePersistedNitrogenExecution(input: {
  execution: PersistedNitrogenExecution | null | undefined;
  currentSeasonUpdatedAt: string;
  currentOrganicMatterFingerprint: string;
}): NitrogenExecutionEvidence {
  const execution = input.execution;
  if (!execution) {
    return {
      status: "NOT_AVAILABLE",
      executionId: null,
      recommendation: null,
      ruleId: null,
      limitations: ["N_EXECUTION_NOT_AVAILABLE"],
    };
  }

  if (!supportedRule(execution.ruleId)) {
    return {
      status: "INVALID",
      executionId: execution.id,
      recommendation: null,
      ruleId: execution.ruleId,
      limitations: ["N_EXECUTION_RULE_UNSUPPORTED"],
    };
  }

  const currentTrace = buildRuleTrace(execution.ruleId);
  const limitations: string[] = [];
  if (execution.ruleVersion !== currentTrace.ruleVersion) limitations.push("N_EXECUTION_RULE_VERSION_STALE");
  if (execution.sourceSnapshotId !== currentTrace.sourceSnapshotId) limitations.push("N_EXECUTION_SOURCE_SNAPSHOT_STALE");

  const persistedInput = object(execution.inputPayload);
  if (!persistedInput) limitations.push("N_EXECUTION_INPUT_INVALID");
  else {
    if (!sameTimestamp(persistedInput.seasonUpdatedAt, input.currentSeasonUpdatedAt)) {
      limitations.push("N_EXECUTION_SEASON_CONTEXT_STALE");
    }
    if (typeof persistedInput.organicMatterFingerprint !== "string") {
      limitations.push("N_EXECUTION_OM_FINGERPRINT_MISSING");
    } else if (persistedInput.organicMatterFingerprint !== input.currentOrganicMatterFingerprint) {
      limitations.push("N_EXECUTION_OM_FINGERPRINT_STALE");
    }
  }

  if (limitations.length > 0) {
    return {
      status: "STALE",
      executionId: execution.id,
      recommendation: null,
      ruleId: execution.ruleId,
      limitations,
    };
  }

  const recommendation = parseRecommendation(execution.outputPayload, execution.ruleId);
  if (!recommendation) {
    return {
      status: "INVALID",
      executionId: execution.id,
      recommendation: null,
      ruleId: execution.ruleId,
      limitations: ["N_EXECUTION_OUTPUT_INVALID"],
    };
  }

  if (recommendation.ruleVersion !== execution.ruleVersion || recommendation.sourceSnapshotId !== execution.sourceSnapshotId) {
    return {
      status: "INVALID",
      executionId: execution.id,
      recommendation: null,
      ruleId: execution.ruleId,
      limitations: ["N_EXECUTION_OUTPUT_TRACE_MISMATCH"],
    };
  }

  if (execution.executionStatus !== recommendation.status) {
    return {
      status: "INVALID",
      executionId: execution.id,
      recommendation: null,
      ruleId: execution.ruleId,
      limitations: ["N_EXECUTION_STATUS_MISMATCH"],
    };
  }

  return {
    status: "CURRENT",
    executionId: execution.id,
    executionStatus: recommendation.status,
    recommendation,
    ruleId: execution.ruleId,
    ruleVersion: execution.ruleVersion,
    sourceSnapshotId: execution.sourceSnapshotId,
    createdAt: execution.createdAt,
    limitations: [],
  };
}
