import assert from "node:assert/strict";
import { evaluateAgronomicRuleAutomation } from "../src/domain/agronomic-rule-catalog.ts";
import { buildSoybeanGypsumRsSc2025Review } from "../src/domain/soybean-gypsum-rs-sc-2025.ts";

const catalogRule = evaluateAgronomicRuleAutomation("GYPSUM-SOYBEAN-RS-SC-2025");
assert.equal(catalogRule.allowed, false);
assert.equal(catalogRule.status, "REQUIRES_AGRONOMIST_REVIEW");
assert.equal(catalogRule.rule?.sourceYear, 2025);

const base = {
  region: "RS",
  managementSystem: "NO_TILL",
  diagnosticLayer: "20_40_CM",
  alSaturationPct: 15,
  alSaturationSourceValidated: true,
  exchangeableCaCmolcDm3: 1.2,
  waterContext: "DEFICIT_PRESENT",
  soilOrder: "OXISOL",
  clayPct: 40,
  surfaceMagnesiumStatus: "ADEQUATE",
  limingCompletedBeforeGypsum: true,
};

const deficitHigh = buildSoybeanGypsumRsSc2025Review(base);
assert.equal(deficitHigh.responseClass, "HIGH_RESPONSE_CONTEXT");
assert.equal(deficitHigh.evidenceObservation.regionalProbabilityPositiveResponsePct, 97);
assert.equal(deficitHigh.evidenceObservation.metaAnalysisProbabilityPositiveResponsePct, 88);
assert.equal(deficitHigh.evidenceObservation.averageYieldIncreasePct, 12);
assert.equal(deficitHigh.evidenceObservation.probabilityMetricConflictPreserved, true);
assert.ok(deficitHigh.warnings.includes("POSITIVE_RESPONSE_PROBABILITY_DIFFERS_BY_SOURCE_METRIC"));
assert.equal(deficitHigh.doseEvidence.clayFormulaReferenceKgHa, 2000);
assert.deepEqual(deficitHigh.doseEvidence.oxisolPublishedRangeKgHa, {
  min: 2000,
  max: 3000,
  statedTarget: "UP_TO_95_PERCENT_MAXIMUM_YIELD",
});
assert.equal(deficitHigh.doseEvidence.automaticDoseKgHa, null);
assert.equal(deficitHigh.doseEvidence.automaticPrescriptionAllowed, false);
assert.equal(deficitHigh.safety.professionalReviewRequired, true);
assert.equal(deficitHigh.safety.applicationBlocked, false);

const noDeficitHigh = buildSoybeanGypsumRsSc2025Review({
  ...base,
  alSaturationPct: 41,
  waterContext: "NO_DEFICIT",
});
assert.equal(noDeficitHigh.responseClass, "HIGH_RESPONSE_CONTEXT");
assert.equal(noDeficitHigh.evidenceObservation.regionalProbabilityPositiveResponsePct, 40);
assert.equal(noDeficitHigh.evidenceObservation.metaAnalysisProbabilityPositiveResponsePct, null);
assert.equal(noDeficitHigh.evidenceObservation.averageYieldIncreasePct, 5);
assert.equal(noDeficitHigh.evidenceObservation.probabilityMetricConflictPreserved, false);

const lowAl = buildSoybeanGypsumRsSc2025Review({ ...base, alSaturationPct: 4.9 });
assert.equal(lowAl.responseClass, "LOW_OR_NULL_RESPONSE_CONTEXT");
assert.equal(lowAl.evidenceObservation.regionalProbabilityPositiveResponsePct, null);

const exactDeficitThreshold = buildSoybeanGypsumRsSc2025Review({ ...base, alSaturationPct: 10 });
assert.equal(exactDeficitThreshold.responseClass, "INTERMEDIATE_REVIEW_CONTEXT");

const exactNoDeficitThreshold = buildSoybeanGypsumRsSc2025Review({
  ...base,
  alSaturationPct: 40,
  waterContext: "NO_DEFICIT",
});
assert.equal(exactNoDeficitThreshold.responseClass, "INTERMEDIATE_REVIEW_CONTEXT");

const lowClayLowMg = buildSoybeanGypsumRsSc2025Review({
  ...base,
  clayPct: 14,
  surfaceMagnesiumStatus: "LOW",
});
assert.ok(lowClayLowMg.blockers.includes("LOW_CLAY_LOW_MAGNESIUM_NEGATIVE_RESPONSE_RISK"));
assert.equal(lowClayLowMg.safety.lowClayLowMgHardBlock, true);
assert.equal(lowClayLowMg.safety.applicationBlocked, true);
assert.equal(lowClayLowMg.doseEvidence.clayFormulaReferenceKgHa, 700);

const limingUnknown = buildSoybeanGypsumRsSc2025Review({
  ...base,
  limingCompletedBeforeGypsum: null,
});
assert.ok(limingUnknown.blockers.includes("LIMING_PREREQUISITE_UNKNOWN"));
assert.equal(limingUnknown.responseClass, "INSUFFICIENT_CONTEXT");
assert.equal(limingUnknown.safety.applicationBlocked, true);

const outsideRegion = buildSoybeanGypsumRsSc2025Review({ ...base, region: "OTHER" });
assert.equal(outsideRegion.responseClass, "OUTSIDE_REGIONAL_PROFILE");
assert.ok(outsideRegion.blockers.includes("REGIONAL_PROFILE_OUTSIDE_RS_SC"));

const outsideManagement = buildSoybeanGypsumRsSc2025Review({ ...base, managementSystem: "OTHER" });
assert.equal(outsideManagement.responseClass, "OUTSIDE_REGIONAL_PROFILE");
assert.ok(outsideManagement.blockers.includes("OUTSIDE_NO_TILL_EVIDENCE_DOMAIN"));

const lowland = buildSoybeanGypsumRsSc2025Review({ ...base, soilOrder: "LOWLAND_SOIL" });
assert.ok(lowland.warnings.includes("LOWLAND_SOIL_HAS_HIGHER_EVIDENCE_UNCERTAINTY"));
assert.equal(lowland.doseEvidence.oxisolPublishedRangeKgHa, null);

const invalidClay = buildSoybeanGypsumRsSc2025Review({ ...base, clayPct: 101 });
assert.ok(invalidClay.blockers.includes("CLAY_PCT_INVALID"));
assert.equal(invalidClay.doseEvidence.clayFormulaReferenceKgHa, null);

console.log("soybean-gypsum-rs-sc-2025: contexto hídrico/Al, referências de dose, conflito de probabilidade e gates de segurança preservados");
