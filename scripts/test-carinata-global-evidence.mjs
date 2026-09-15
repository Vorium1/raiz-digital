import assert from "node:assert/strict";
import {
  CARINATA_EVIDENCE_OBSERVATIONS,
  buildCarinataNutrientEvidenceBrief,
  evaluateCarinataCoastalPlainNitrogenEvidence,
} from "../src/domain/carinata-global-evidence.ts";

assert.ok(CARINATA_EVIDENCE_OBSERVATIONS.length >= 6);
assert.equal(
  new Set(CARINATA_EVIDENCE_OBSERVATIONS.map((source) => source.sourceId)).size,
  CARINATA_EVIDENCE_OBSERVATIONS.length,
);
assert.ok(CARINATA_EVIDENCE_OBSERVATIONS.every((source) => source.quantitativePrescriptionAllowed === false));
assert.ok(CARINATA_EVIDENCE_OBSERVATIONS.every((source) => /^https:\/\//.test(source.doiOrUrl)));

const ifas = CARINATA_EVIDENCE_OBSERVATIONS.find((source) => source.sourceId === "CARINATA-UF-IFAS-GUIDE");
assert.ok(ifas);
assert.equal(ifas.publicationYear, null);
assert.match(ifas.observation, /ano permanece nulo/i);

const exactObservedContext = evaluateCarinataCoastalPlainNitrogenEvidence({
  crop: "CARINATA",
  waterRegime: "RAINFED",
  soilTextureGroup: "SANDY_LOAM",
  soilPH: 6.2,
  soilPHMethod: "1_1_SOIL_WATER",
  soilSamplingDepthToCm: 15,
});
assert.equal(exactObservedContext.applicability, "STRONGLY_COMPARABLE");
assert.equal(exactObservedContext.canSupportContextualAdvice, true);
assert.equal(exactObservedContext.canSupportQuantitativeRecommendation, false);
assert.equal(exactObservedContext.quantitativeRuleId, null);
assert.ok(exactObservedContext.reasons.includes("QUANTITATIVE_RULE_NOT_HOMOLOGATED"));
assert.ok(exactObservedContext.reasons.includes("QUANTITATIVE_APPLICABILITY_NOT_APPROVED"));

const unknownMethod = evaluateCarinataCoastalPlainNitrogenEvidence({
  crop: "CARINATA",
  waterRegime: "RAINFED",
  soilTextureGroup: "SANDY_LOAM",
  soilPH: 6.2,
  soilPHMethod: "UNKNOWN",
  soilSamplingDepthToCm: 15,
});
assert.equal(unknownMethod.applicability, "INSUFFICIENT_CONTEXT");
assert.equal(unknownMethod.canSupportContextualAdvice, false);
assert.equal(unknownMethod.canSupportQuantitativeRecommendation, false);
assert.deepEqual(unknownMethod.missingTargetCriticalDimensions, ["soilPHMethod"]);

const wrongDepth = evaluateCarinataCoastalPlainNitrogenEvidence({
  crop: "CARINATA",
  waterRegime: "RAINFED",
  soilTextureGroup: "SANDY_LOAM",
  soilPH: 6.2,
  soilPHMethod: "1_1_SOIL_WATER",
  soilSamplingDepthToCm: 20,
});
assert.equal(wrongDepth.applicability, "NOT_COMPARABLE");
assert.ok(wrongDepth.mismatchedCriticalDimensions.includes("soilSamplingDepthToCm"));
assert.equal(wrongDepth.canSupportQuantitativeRecommendation, false);

const irrigated = evaluateCarinataCoastalPlainNitrogenEvidence({
  crop: "CARINATA",
  waterRegime: "IRRIGATED",
  soilTextureGroup: "SANDY_LOAM",
  soilPH: 6.2,
  soilPHMethod: "1_1_SOIL_WATER",
  soilSamplingDepthToCm: 15,
});
assert.equal(irrigated.applicability, "NOT_COMPARABLE");
assert.ok(irrigated.mismatchedCriticalDimensions.includes("waterRegime"));

const unknownTexture = evaluateCarinataCoastalPlainNitrogenEvidence({
  crop: "CARINATA",
  waterRegime: "RAINFED",
  soilTextureGroup: "UNKNOWN",
  soilPH: 6.2,
  soilPHMethod: "1_1_SOIL_WATER",
  soilSamplingDepthToCm: 15,
});
assert.equal(unknownTexture.applicability, "INSUFFICIENT_CONTEXT");
assert.ok(unknownTexture.missingTargetCriticalDimensions.includes("soilTextureGroup"));

const outsidePH = evaluateCarinataCoastalPlainNitrogenEvidence({
  crop: "CARINATA",
  waterRegime: "RAINFED",
  soilTextureGroup: "SANDY_LOAM",
  soilPH: 6.8,
  soilPHMethod: "1_1_SOIL_WATER",
  soilSamplingDepthToCm: 15,
});
assert.equal(outsidePH.applicability, "NOT_COMPARABLE");
assert.ok(outsidePH.mismatchedCriticalDimensions.includes("soilPH"));
assert.equal(outsidePH.canSupportQuantitativeRecommendation, false);

const brief = buildCarinataNutrientEvidenceBrief();
assert.equal(brief.automaticDoseAllowed, false);
assert.equal(brief.canolaAnalogyAutomaticDoseAllowed, false);
assert.equal(brief.professionalReviewRequiredForTransferredRates, true);
assert.equal(brief.evidenceState, "GLOBAL_EVIDENCE_AVAILABLE_LOCAL_CALIBRATION_INCOMPLETE");
assert.match(brief.importantInterpretationRules.join(" "), /uptake or removal is not fertilizer requirement/i);

console.log("carinata-global-evidence: evidência global contextualizada; dose automática permanece bloqueada");
