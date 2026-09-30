import assert from "node:assert/strict";
import { evaluateReportPublicationGate } from "../src/domain/report-publication-gate.ts";
import { evaluateOfficialResultCompleteness } from "../src/domain/official-result-completeness.ts";

const missing = evaluateReportPublicationGate({ interpretationExists: false, interpretationStatus: null, interpretationEvidenceCurrent: false, prescriptionId: null, prescriptionStatus: null });
assert.equal(missing.allowed, false);
assert.match(missing.reason, /não encontrada/i);

for (const status of ["CALCULATED", "IN_REVIEW", "REJECTED"]) {
  const result = evaluateReportPublicationGate({ interpretationExists: true, interpretationStatus: status, interpretationEvidenceCurrent: true, prescriptionId: null, prescriptionStatus: null });
  assert.equal(result.allowed, false, `${status} não pode publicar`);
  assert.match(result.reason, /interpretação precisa estar aprovada/i);
}

const supersededInterpretation = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: false,
  interpretationEvidenceCurrent: true,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: true,
});
assert.equal(supersededInterpretation.allowed, false);
assert.match(supersededInterpretation.reason, /superada/i);

const staleLabEvidence = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: true,
  interpretationEvidenceCurrent: false,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: true,
});
assert.equal(staleLabEvidence.allowed, false);
assert.match(staleLabEvidence.reason, /dados ou as regras agronômicas/i);

const sourceRequired = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: true,
  interpretationEvidenceCurrent: true,
  sourceVerificationRequired: true,
  sourceHumanVerified: false,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: true,
});
assert.equal(sourceRequired.allowed, false);
assert.match(sourceRequired.reason, /conferência humana/i);

const noPrescription = evaluateReportPublicationGate({ interpretationExists: true, interpretationStatus: "APPROVED", interpretationEvidenceCurrent: true, prescriptionId: null, prescriptionStatus: null });
assert.equal(noPrescription.allowed, false);
assert.match(noPrescription.reason, /conclusão técnica/i);

for (const status of ["PENDING_REVIEW", "CHANGES_REQUESTED", "REJECTED"]) {
  const result = evaluateReportPublicationGate({ interpretationExists: true, interpretationStatus: "APPROVED", interpretationEvidenceCurrent: true, prescriptionId: "00000000-0000-4000-8000-000000000001", prescriptionStatus: status });
  assert.equal(result.allowed, false, `prescrição ${status} não pode publicar`);
}

const stalePrescription = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: true,
  interpretationEvidenceCurrent: true,
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
  interpretationEvidenceCurrent: true,
  sourceVerificationRequired: true,
  sourceHumanVerified: true,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: true,
});
assert.equal(approved.allowed, true);
assert.equal(approved.reason, null);
assert.equal(approved.prescriptionStatus, "APPROVED");

const incompletePrescription = evaluateReportPublicationGate({
  interpretationExists: true,
  interpretationStatus: "APPROVED",
  interpretationIsLatest: true,
  interpretationEvidenceCurrent: true,
  prescriptionId: "00000000-0000-4000-8000-000000000001",
  prescriptionStatus: "APPROVED",
  prescriptionCurrent: true,
  prescriptionCompletenessReady: false,
  prescriptionCompletenessReason: "Laudo final ainda não pode ser publicado: Calagem pendente.",
});
assert.equal(incompletePrescription.allowed, false);
assert.match(incompletePrescription.reason, /Calagem pendente/);

const missingLiming = evaluateOfficialResultCompleteness({
  prescription: {
    limingDecision: null,
    limingMethodSelection: { samplingProfile: "INTEGRATED_0_20" },
    spatialNutrientPlan: { nutrients: [] },
    soilComplementActions: [],
    recommendations: [],
  },
});
assert.equal(missingLiming.ready, false);
assert.ok(missingLiming.blockers.some((item) => item.code === "LIMING_DECISION_MISSING"));

const unresolvedBoron = evaluateOfficialResultCompleteness({
  prescription: {
    limingDecision: { status: "UNIFORM_NO_APPLY" },
    limingMethodSelection: { samplingProfile: "SPLIT_0_10_10_20" },
    spatialNutrientPlan: { nutrients: [] },
    soilComplementActions: [{
      parameterCode: "B",
      label: "Boro",
      status: "LOW_REQUIRES_COMPLEMENT_REVIEW",
      action: "Definir correção de Boro.",
    }],
    recommendations: [],
  },
});
assert.equal(unresolvedBoron.ready, false);
assert.ok(unresolvedBoron.blockers.some((item) => item.code === "SOIL_COMPLEMENT_B"));

const resolvedBoron = evaluateOfficialResultCompleteness({
  prescription: {
    limingDecision: { status: "UNIFORM_NO_APPLY" },
    limingMethodSelection: { samplingProfile: "SPLIT_0_10_10_20" },
    spatialNutrientPlan: { nutrients: [] },
    soilComplementActions: [{
      parameterCode: "B",
      label: "Boro",
      status: "LOW_REQUIRES_COMPLEMENT_REVIEW",
      action: "Definir correção de Boro.",
    }],
    recommendations: [{ inputType: "B", quantity: 1, unit: "kg/ha" }],
  },
});
assert.equal(resolvedBoron.ready, true);

const integrated020NotClosed = evaluateOfficialResultCompleteness({
  prescription: {
    limingDecision: { status: "BLOCKED", blockers: ["NO_TILL_CONSOLIDATED_10_20_CONDITION_REQUIRED"] },
    limingMethodSelection: { samplingProfile: "INTEGRATED_0_20", selectedMethodId: "CQFS-RS-SC-2016-INTEGRATED-0-20" },
    limingLayerRequirement: { status: "SPATIAL" },
    spatialNutrientPlan: { nutrients: [] },
    soilComplementActions: [],
    recommendations: [],
  },
});
assert.equal(integrated020NotClosed.ready, false);
assert.ok(integrated020NotClosed.blockers.some((item) => item.code === "LIMING_APPLICATION_METHOD_NOT_CLOSED"));
assert.match(integrated020NotClosed.blockers[0].message, /laudo 0–20 já sustenta cálculo SMP/i);

console.log("report publication gate: interpretação/regra corrente + fonte + conclusão técnica aprovada enforced");
