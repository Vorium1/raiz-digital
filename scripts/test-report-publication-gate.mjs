import assert from "node:assert/strict";
import { evaluateReportPublicationGate } from "../src/domain/report-publication-gate.ts";

const missing = evaluateReportPublicationGate({ interpretationExists: false, interpretationStatus: null, prescriptionId: null, prescriptionStatus: null });
assert.equal(missing.allowed, false);
assert.match(missing.reason, /não encontrada/i);

for (const status of ["CALCULATED", "IN_REVIEW", "REJECTED"]) {
  const result = evaluateReportPublicationGate({ interpretationExists: true, interpretationStatus: status, prescriptionId: null, prescriptionStatus: null });
  assert.equal(result.allowed, false, `${status} não pode publicar`);
  assert.match(result.reason, /interpretação precisa estar aprovada/i);
}

const supersededInterpretation = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: false,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: true,
});
assert.equal(supersededInterpretation.allowed, false);
assert.match(supersededInterpretation.reason, /superada/i);

const sourceRequired = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: true,
  sourceVerificationRequired: true,
  sourceHumanVerified: false,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: true,
});
assert.equal(sourceRequired.allowed, false);
assert.match(sourceRequired.reason, /conferência humana/i);

const noPrescription = evaluateReportPublicationGate({ interpretationExists: true, interpretationStatus: "APPROVED", prescriptionId: null, prescriptionStatus: null });
assert.equal(noPrescription.allowed, false);
assert.match(noPrescription.reason, /recomendação assistida raiz/i);

for (const status of ["PENDING_REVIEW", "CHANGES_REQUESTED", "REJECTED"]) {
  const result = evaluateReportPublicationGate({ interpretationExists: true, interpretationStatus: "APPROVED", prescriptionId: "00000000-0000-4000-8000-000000000001", prescriptionStatus: status });
  assert.equal(result.allowed, false, `prescrição ${status} não pode publicar`);
}

const stalePrescription = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: true,
  sourceVerificationRequired: true,
  sourceHumanVerified: true,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: false,
});
assert.equal(stalePrescription.allowed, false);
assert.match(stalePrescription.reason, /contexto agronômico anterior/i);

const approved = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: true,
  sourceVerificationRequired: true,
  sourceHumanVerified: true,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: true,
});
assert.equal(approved.allowed, true);
assert.equal(approved.reason, null);
assert.equal(approved.prescriptionStatus, "APPROVED");

console.log("report publication gate: latest interpretation + source verification policy + current prescription enforced");
