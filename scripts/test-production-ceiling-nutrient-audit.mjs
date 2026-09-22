import assert from "node:assert/strict";
import { auditProductionCeilingNutrient } from "../src/domain/production-ceiling-nutrient-audit.ts";

const p = auditProductionCeilingNutrient({
  cropCode: "SOJA",
  targetYieldTonPerHa: 4.8,
  nutrient: "P2O5",
  availabilityStatus: "LOW",
  deterministicRequirement: { amount: 80, unit: "kg/ha", ruleId: "TEST-P" },
});
assert.equal(p.status, "NEEDS_DETERMINISTIC_SUPPLY");
assert.equal(p.exactRequirement?.amount, 80);
assert.equal(p.yieldScalingAllowed, true);
assert.deepEqual(p.preferredRoutes, ["SOIL"]);

const sulfur = auditProductionCeilingNutrient({
  cropCode: "SOJA",
  targetYieldTonPerHa: 4.8,
  nutrient: "S",
  availabilityStatus: "LOW",
  deterministicRequirement: { amount: 20, unit: "kg/ha", ruleId: "S-SOJA-RS-SC-2025" },
});
assert.equal(sulfur.exactRequirement?.amount, 20);
assert.equal(sulfur.yieldScalingAllowed, false);
assert.ok(sulfur.warnings.includes("SULFUR_REQUIREMENT_MUST_NOT_BE_YIELD_SCALED_UNLESS_THE_ACTIVE_RULE_EXPLICITLY_ALLOWS_IT"));

const moHighTargetOnly = auditProductionCeilingNutrient({
  cropCode: "SOJA",
  targetYieldTonPerHa: 4.8,
  nutrient: "Mo",
  availabilityStatus: "UNKNOWN",
  soilPhWater: 6,
  earlyNitrogenDeficiencyObserved: false,
});
assert.equal(moHighTargetOnly.status, "NO_AUTOMATIC_SUPPLEMENT");
assert.equal(moHighTargetOnly.referenceDoseRange, null);
assert.equal(moHighTargetOnly.yieldScalingAllowed, false);

const moResponseContext = auditProductionCeilingNutrient({
  cropCode: "SOJA",
  targetYieldTonPerHa: 4.8,
  nutrient: "Mo",
  availabilityStatus: "UNKNOWN",
  soilPhWater: 5.2,
  earlyNitrogenDeficiencyObserved: true,
});
assert.equal(moResponseContext.status, "REVIEW_CORRECTION");
assert.deepEqual(moResponseContext.preferredRoutes, ["FOLIAR"]);
assert.deepEqual(moResponseContext.referenceDoseRange, {
  min: 25,
  max: 50,
  unit: "g/ha",
  ruleId: "MO-SOJA-RS-SC-2025-FOLIAR-REFERENCE",
});
assert.equal(moResponseContext.agronomistReviewRequired, true);

const mnWithoutVisual = auditProductionCeilingNutrient({
  cropCode: "SOJA",
  targetYieldTonPerHa: 4.8,
  nutrient: "Mn",
  availabilityStatus: "LOW",
  visualDeficiencyObserved: false,
});
assert.equal(mnWithoutVisual.status, "REVIEW_CORRECTION");
assert.equal(mnWithoutVisual.referenceDoseRange, null);
assert.deepEqual(mnWithoutVisual.preferredRoutes, ["SOIL"]);

const mnVisual = auditProductionCeilingNutrient({
  cropCode: "SOJA",
  targetYieldTonPerHa: 4.8,
  nutrient: "Mn",
  availabilityStatus: "LOW",
  visualDeficiencyObserved: true,
});
assert.deepEqual(mnVisual.preferredRoutes, ["FOLIAR"]);
assert.deepEqual(mnVisual.referenceDoseRange, {
  min: 350,
  max: 350,
  unit: "g/ha",
  ruleId: "EMBRAPA-SOJA-MN-FOLIAR-VISUAL-DEFICIENCY",
});

const magnesium = auditProductionCeilingNutrient({
  cropCode: "SOJA",
  targetYieldTonPerHa: 4.8,
  nutrient: "Mg",
  availabilityStatus: "LOW",
});
assert.equal(magnesium.status, "REVIEW_CORRECTION");
assert.equal(magnesium.referenceDoseRange, null);
assert.deepEqual(magnesium.preferredRoutes, ["LIMING_REVIEW", "SOIL"]);

const boron = auditProductionCeilingNutrient({
  cropCode: "SOJA",
  targetYieldTonPerHa: 4.8,
  nutrient: "B",
  availabilityStatus: "LOW",
});
assert.equal(boron.status, "REVIEW_CORRECTION");
assert.deepEqual(boron.preferredRoutes, ["SOIL"]);
assert.equal(boron.referenceDoseRange, null);
assert.ok(boron.warnings.includes("CROP_REGION_DOSE_RULE_REQUIRED"));

console.log("production-ceiling-nutrient-audit: meta produtiva, suficiência, vias e não-invenção validadas");
