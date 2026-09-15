import assert from "node:assert/strict";
import { evaluateAgronomicRuleAutomation } from "../src/domain/agronomic-rule-catalog.ts";
import { evaluateSoybeanSulfurRsSc2025 } from "../src/domain/soybean-sulfur-rs-sc-2025.ts";

const rule = evaluateAgronomicRuleAutomation("S-SOJA-RS-SC-2025");
assert.equal(rule.allowed, true);
assert.equal(rule.status, "READY_FOR_IMPLEMENTATION");
assert.equal(rule.rule?.sourceYear, 2025);

const base020 = {
  region: "RS",
  samplingProfile: "ZERO_TO_TWENTY_PLUS_20_40",
  unit: "mg/dm3",
  analysisMethodValidatedAgainstRegionalProtocol: true,
  sulfur0To20MgDm3: 9,
  sulfur20To40MgDm3: 9,
  intendedSourceForm: "SULFATE",
};

const lowSurface = evaluateSoybeanSulfurRsSc2025(base020);
assert.equal(lowSurface.contextReady, true);
assert.equal(lowSurface.interpretation, "DEFICIENT_APPLY_20_KG_S_HA");
assert.equal(lowSurface.recommendation.recommendedNutrientDoseKgSPerHa, 20);
assert.equal(lowSurface.recommendation.automaticNutrientDoseAllowed, true);
assert.equal(lowSurface.recommendation.automaticCommercialProductConversionAllowed, false);
assert.ok(lowSurface.warnings.includes("SULFATE_IS_PREFERRED_FAST_AVAILABLE_SOURCE"));

const adequate = evaluateSoybeanSulfurRsSc2025({
  ...base020,
  sulfur0To20MgDm3: 10.1,
  sulfur20To40MgDm3: 8.6,
});
assert.equal(adequate.interpretation, "SUFFICIENT_BY_PROFILE");
assert.equal(adequate.recommendation.recommendedNutrientDoseKgSPerHa, 0);

// A fonte escreve explicitamente >10 mg/dm3 na superfície e 8,5 mg/dm3 em 20-40 cm.
const exactSurfaceBoundary = evaluateSoybeanSulfurRsSc2025({
  ...base020,
  sulfur0To20MgDm3: 10,
  sulfur20To40MgDm3: 9,
});
assert.equal(exactSurfaceBoundary.interpretation, "DEFICIENT_APPLY_20_KG_S_HA");
assert.equal(exactSurfaceBoundary.recommendation.recommendedNutrientDoseKgSPerHa, 20);
assert.equal(exactSurfaceBoundary.thresholds.exactSurfaceBoundaryIsAdequate, false);

const exactDeepBoundary = evaluateSoybeanSulfurRsSc2025({
  ...base020,
  sulfur0To20MgDm3: 12,
  sulfur20To40MgDm3: 8.5,
});
assert.equal(exactDeepBoundary.interpretation, "SUFFICIENT_BY_PROFILE");
assert.equal(exactDeepBoundary.recommendation.recommendedNutrientDoseKgSPerHa, 0);
assert.equal(exactDeepBoundary.thresholds.exactSubsurfaceBoundaryIsAdequate, true);

const splitShallowNotConfirmed = evaluateSoybeanSulfurRsSc2025({
  region: "SC",
  samplingProfile: "SPLIT_ZERO_TEN_10_20_20_40",
  unit: "mg/dm³",
  analysisMethodValidatedAgainstRegionalProtocol: true,
  sulfur0To10MgDm3: 8,
  sulfur10To20MgDm3: 9.5,
  sulfur20To40MgDm3: 9,
  intendedSourceForm: "OTHER_OR_UNKNOWN",
});
assert.equal(splitShallowNotConfirmed.contextReady, true);
assert.equal(splitShallowNotConfirmed.interpretation, "SHALLOW_LOW_NOT_CONFIRMED_NO_AUTOMATIC_APPLICATION");
assert.equal(splitShallowNotConfirmed.recommendation.recommendedNutrientDoseKgSPerHa, 0);
assert.equal(splitShallowNotConfirmed.observations.shallowLowNotConfirmedAtDepth, true);
assert.ok(splitShallowNotConfirmed.warnings.includes("SHALLOW_LOW_S_NOT_CONFIRMED_AT_DEPTH"));

const splitDeepLow = evaluateSoybeanSulfurRsSc2025({
  region: "SC",
  samplingProfile: "SPLIT_ZERO_TEN_10_20_20_40",
  unit: "mg/dm3",
  analysisMethodValidatedAgainstRegionalProtocol: true,
  sulfur0To10MgDm3: 12,
  sulfur10To20MgDm3: 11,
  sulfur20To40MgDm3: 8.4,
  intendedSourceForm: "ELEMENTAL",
});
assert.equal(splitDeepLow.interpretation, "DEFICIENT_APPLY_20_KG_S_HA");
assert.equal(splitDeepLow.recommendation.recommendedNutrientDoseKgSPerHa, 20);
assert.equal(splitDeepLow.policy.professionalReviewRequiredForElementalSourceTiming, true);
assert.ok(splitDeepLow.warnings.includes("ELEMENTAL_S_SHORT_TERM_AVAILABILITY_IS_UNCERTAIN"));

const missingDeep = evaluateSoybeanSulfurRsSc2025({
  ...base020,
  sulfur20To40MgDm3: null,
});
assert.equal(missingDeep.contextReady, false);
assert.equal(missingDeep.recommendation.recommendedNutrientDoseKgSPerHa, null);
assert.ok(missingDeep.blockers.includes("SULFUR_20_40_MISSING_OR_INVALID"));

const methodMismatch = evaluateSoybeanSulfurRsSc2025({
  ...base020,
  analysisMethodValidatedAgainstRegionalProtocol: false,
});
assert.equal(methodMismatch.contextReady, false);
assert.ok(methodMismatch.blockers.includes("SULFUR_ANALYSIS_METHOD_NOT_VALIDATED"));

const wrongUnit = evaluateSoybeanSulfurRsSc2025({ ...base020, unit: "ppm" });
assert.equal(wrongUnit.contextReady, false);
assert.ok(wrongUnit.blockers.includes("SULFUR_UNIT_MUST_BE_MG_DM3"));

const outside = evaluateSoybeanSulfurRsSc2025({ ...base020, region: "OTHER" });
assert.equal(outside.contextReady, false);
assert.ok(outside.blockers.includes("REGIONAL_PROFILE_OUTSIDE_RS_SC"));

assert.equal(lowSurface.recommendation.automaticYieldScalingAllowed, false);
assert.equal(lowSurface.recommendation.referenceExportYieldTonPerHaApprox, 4);
assert.deepEqual(lowSurface.recommendation.atmosphericDepositionContextKgSPerHaYear, { min: 3.3, max: 4.5 });

console.log("soybean-sulfur-rs-sc-2025: profundidade, limites exatos, método, fonte e 20 kg S/ha protegidos por gates explícitos");
