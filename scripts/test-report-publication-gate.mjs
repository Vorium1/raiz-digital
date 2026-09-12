import assert from "node:assert/strict";
import { evaluateReportPublicationGate } from "../src/domain/report-publication-gate.ts";

const base = { reportExists: false };

const missing = evaluateReportPublicationGate({ ...base, interpretationExists: false, interpretationStatus: null, prescriptionId: null, prescriptionStatus: null });
assert.equal(missing.allowed, false);
assert.match(missing.reason, /não encontrada/i);

for (const status of ["CALCULATED", "IN_REVIEW", "REJECTED"]) {
  const result = evaluateReportPublicationGate({ ...base, interpretationExists: true, interpretationStatus: status, prescriptionId: null, prescriptionStatus: null });
  assert.equal(result.allowed, false, `${status} não pode publicar`);
  assert.match(result.reason, /interpretação precisa estar aprovada/i);
}

const noPrescription = evaluateReportPublicationGate({ ...base, interpretationExists: true, interpretationStatus: "APPROVED", prescriptionId: null, prescriptionStatus: null });
assert.equal(noPrescription.allowed, false);
assert.match(noPrescription.reason, /recomendação assistida raiz/i);

for (const status of ["PENDING_REVIEW", "CHANGES_REQUESTED", "REJECTED"]) {
  const result = evaluateReportPublicationGate({ ...base, interpretationExists: true, interpretationStatus: "APPROVED", prescriptionId: "00000000-0000-4000-8000-000000000001", prescriptionStatus: status });
  assert.equal(result.allowed, false, `prescrição ${status} não pode publicar`);
}

const approved = evaluateReportPublicationGate({ ...base, interpretationExists: true, interpretationStatus: "APPROVED", prescriptionId: "00000000-0000-4000-8000-000000000001", prescriptionStatus: "APPROVED" });
assert.equal(approved.allowed, true);
assert.equal(approved.reason, null);
assert.equal(approved.prescriptionStatus, "APPROVED");
assert.equal(approved.alreadyPublished, false);

const alreadyPublished = evaluateReportPublicationGate({ interpretationExists: true, interpretationStatus: "APPROVED", prescriptionId: "00000000-0000-4000-8000-000000000001", prescriptionStatus: "APPROVED", reportExists: true });
assert.equal(alreadyPublished.allowed, false);
assert.equal(alreadyPublished.alreadyPublished, true);
assert.match(alreadyPublished.reason, /já possui uma decisão oficial publicada/i);

console.log("report publication gate: ok");
