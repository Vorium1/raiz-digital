import { pathToFileURL } from "node:url";
import {
  evaluateHomologationReadiness,
  sanitizeHomologationReadinessForApi,
} from "../src/domain/homologation-readiness.ts";

export function buildHomologationReadinessEvidence(env = process.env) {
  const result = evaluateHomologationReadiness(env);
  const sanitized = sanitizeHomologationReadinessForApi(result);

  return {
    schemaVersion: 1,
    evidenceType: "RAIZ_HOMOLOGATION_READINESS",
    ...sanitized,
    releaseReady: false,
  };
}

export function printHomologationReadinessEvidence(evidence, output = process.stdout) {
  output.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    const evidence = buildHomologationReadinessEvidence(process.env);
    printHomologationReadinessEvidence(evidence);
    if (!evidence.automatedOk) process.exitCode = 2;
  } catch {
    const unavailable = {
      schemaVersion: 1,
      evidenceType: "RAIZ_HOMOLOGATION_READINESS",
      status: "unavailable",
      releaseReady: false,
    };
    printHomologationReadinessEvidence(unavailable);
    process.exitCode = 3;
  }
}
