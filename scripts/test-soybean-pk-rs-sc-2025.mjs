import assert from "node:assert/strict";
import { SOJA_DOSE_TABLE } from "../src/domain/fertilizer-dose-engine.ts";
import { evaluateAgronomicRuleAutomation } from "../src/domain/agronomic-rule-catalog.ts";
import {
  SOJA_RS_SC_2025_DOSE_TABLE,
  SOYBEAN_PK_RS_SC_2025_POLICY,
  convertSoybeanPkToMehlich1RsSc2025,
  evaluateSoybeanPkCorrectionStrategyRsSc2025,
  evaluateSoybeanPkFurrowPlacementRsSc2025,
  evaluateSoybeanPkMarketAdjustmentRsSc2025,
} from "../src/domain/soybean-pk-rs-sc-2025.ts";

const rule = evaluateAgronomicRuleAutomation("PK-SOJA-RS-SC-2025");
assert.equal(rule.allowed, true);
assert.equal(rule.status, "READY_FOR_IMPLEMENTATION");
assert.equal(rule.rule?.sourceYear, 2025);

// A publicação regional 2025 mantém a tabela numérica oriunda da CQFS 2016.
assert.deepEqual(SOJA_RS_SC_2025_DOSE_TABLE.p2o5, SOJA_DOSE_TABLE.p2o5);
assert.deepEqual(SOJA_RS_SC_2025_DOSE_TABLE.k2o, SOJA_DOSE_TABLE.k2o);
assert.equal(SOJA_RS_SC_2025_DOSE_TABLE.referenceYieldTonPerHa, 3);
assert.deepEqual(SOJA_RS_SC_2025_DOSE_TABLE.perExtraTon, { p2o5: 15, k2o: 25 });
assert.match(SOJA_RS_SC_2025_DOSE_TABLE.source, /2025/);

const pM1 = convertSoybeanPkToMehlich1RsSc2025({
  region: "RS",
  nutrient: "P",
  method: "MEHLICH_1",
  valueMgDm3: 12.5,
});
assert.equal(pM1.ready, true);
assert.equal(pM1.valueMehlich1MgDm3, 12.5);
assert.equal(pM1.conversionApplied, false);

const kM3 = convertSoybeanPkToMehlich1RsSc2025({
  region: "SC",
  nutrient: "K",
  method: "MEHLICH_3",
  valueMgDm3: 100,
});
assert.equal(kM3.ready, true);
assert.equal(kM3.valueMehlich1MgDm3, 83);
assert.equal(kM3.equation, "KM1=KM3*0.83");

const pM3 = convertSoybeanPkToMehlich1RsSc2025({
  region: "RS",
  nutrient: "P",
  method: "MEHLICH_3",
  valueMgDm3: 30,
  clayPctByHydrometer: 25,
});
assert.equal(pM3.ready, true);
assert.equal(pM3.valueMehlich1MgDm3, 20);
assert.equal(pM3.equation, "PM1=PM3/[2.0-(0.02*clay)]");

const pM3NoClay = convertSoybeanPkToMehlich1RsSc2025({
  region: "RS",
  nutrient: "P",
  method: "MEHLICH_3",
  valueMgDm3: 30,
});
assert.equal(pM3NoClay.ready, false);
assert.ok(pM3NoClay.blockers.includes("P_MEHLICH3_REQUIRES_VALID_CLAY_BY_HYDROMETER"));

const unsupportedMethod = convertSoybeanPkToMehlich1RsSc2025({
  region: "RS",
  nutrient: "K",
  method: "OTHER_OR_UNKNOWN",
  valueMgDm3: 100,
});
assert.equal(unsupportedMethod.ready, false);
assert.ok(unsupportedMethod.blockers.includes("PK_ANALYTICAL_METHOD_UNSUPPORTED"));

const totalVeryLow = evaluateSoybeanPkCorrectionStrategyRsSc2025({
  region: "RS",
  soilLevel: "Muito Baixo",
  requestedMode: "TOTAL",
  clayPct: 35,
  ctcPh7CmolcDm3: 10,
  economicContextReviewed: true,
});
assert.equal(totalVeryLow.allowedForProfessionalPlan, true);
assert.equal(totalVeryLow.automaticModeSelectionAllowed, false);

const totalMedium = evaluateSoybeanPkCorrectionStrategyRsSc2025({
  region: "RS",
  soilLevel: "Médio",
  requestedMode: "TOTAL",
  clayPct: 35,
  ctcPh7CmolcDm3: 10,
  economicContextReviewed: true,
});
assert.equal(totalMedium.allowedForProfessionalPlan, false);
assert.ok(totalMedium.blockers.includes("TOTAL_CORRECTION_ONLY_FOR_VERY_LOW_OR_LOW"));

const totalSandy = evaluateSoybeanPkCorrectionStrategyRsSc2025({
  region: "SC",
  soilLevel: "Baixo",
  requestedMode: "TOTAL",
  clayPct: 19.9,
  ctcPh7CmolcDm3: 10,
  economicContextReviewed: true,
});
assert.equal(totalSandy.allowedForProfessionalPlan, false);
assert.ok(totalSandy.blockers.includes("TOTAL_CORRECTION_AVOID_SANDY_OR_LOW_CTC"));

const totalLowCtc = evaluateSoybeanPkCorrectionStrategyRsSc2025({
  region: "SC",
  soilLevel: "Baixo",
  requestedMode: "TOTAL",
  clayPct: 35,
  ctcPh7CmolcDm3: 7.49,
  economicContextReviewed: true,
});
assert.equal(totalLowCtc.allowedForProfessionalPlan, false);
assert.ok(totalLowCtc.blockers.includes("TOTAL_CORRECTION_AVOID_SANDY_OR_LOW_CTC"));

const totalNoEconomicReview = evaluateSoybeanPkCorrectionStrategyRsSc2025({
  region: "RS",
  soilLevel: "Baixo",
  requestedMode: "TOTAL",
  clayPct: 35,
  ctcPh7CmolcDm3: 10,
  economicContextReviewed: false,
});
assert.equal(totalNoEconomicReview.allowedForProfessionalPlan, false);
assert.ok(totalNoEconomicReview.blockers.includes("TOTAL_CORRECTION_REQUIRES_ECONOMIC_REVIEW"));

const boundaryFurrow = evaluateSoybeanPkFurrowPlacementRsSc2025({
  region: "RS",
  placement: "NO_OFFSET_OR_UNKNOWN",
  plannedP2O5KgHa: 120,
  plannedK2OKgHa: 80,
});
assert.equal(boundaryFurrow.placementAllowed, true);

const excessFurrow = evaluateSoybeanPkFurrowPlacementRsSc2025({
  region: "RS",
  placement: "NO_OFFSET_OR_UNKNOWN",
  plannedP2O5KgHa: 120.1,
  plannedK2OKgHa: 80.1,
});
assert.equal(excessFurrow.placementAllowed, false);
assert.ok(excessFurrow.blockers.includes("FURROW_P2O5_EXCEEDS_120_WITHOUT_SAFE_OFFSET"));
assert.ok(excessFurrow.blockers.includes("FURROW_K2O_EXCEEDS_80_WITHOUT_SAFE_OFFSET"));

const confirmedOffset = evaluateSoybeanPkFurrowPlacementRsSc2025({
  region: "RS",
  placement: "OFFSET_5_CM_BELOW_AND_5_CM_SIDE_CONFIRMED",
  plannedP2O5KgHa: 155,
  plannedK2OKgHa: 155,
});
assert.equal(confirmedOffset.placementAllowed, true);
assert.ok(confirmedOffset.warnings.includes("CURRENT_PROFILE_ALLOWS_INTEGRAL_FURROW_APPLICATION_WITH_CONFIRMED_5X5_OFFSET"));

const marketPlusTen = evaluateSoybeanPkMarketAdjustmentRsSc2025({
  deterministicDoseKgHa: 95,
  proposedDoseKgHa: 105,
  commercialFormulationConstraintDocumented: true,
});
assert.equal(marketPlusTen.allowed, true);
assert.equal(marketPlusTen.automaticAiAdjustmentAllowed, false);

const marketTooFar = evaluateSoybeanPkMarketAdjustmentRsSc2025({
  deterministicDoseKgHa: 95,
  proposedDoseKgHa: 105.1,
  commercialFormulationConstraintDocumented: true,
});
assert.equal(marketTooFar.allowed, false);
assert.equal(marketTooFar.blocker, "PK_MARKET_ADJUSTMENT_EXCEEDS_PLUS_MINUS_10");

const marketUndocumented = evaluateSoybeanPkMarketAdjustmentRsSc2025({
  deterministicDoseKgHa: 95,
  proposedDoseKgHa: 100,
  commercialFormulationConstraintDocumented: false,
});
assert.equal(marketUndocumented.allowed, false);
assert.equal(marketUndocumented.blocker, "PK_MARKET_ADJUSTMENT_REQUIRES_DOCUMENTED_FORMULATION_CONSTRAINT");

assert.deepEqual(SOYBEAN_PK_RS_SC_2025_POLICY.maintenanceAtReferenceYieldKgHa, { P2O5: 45, K2O: 75 });
assert.equal(SOYBEAN_PK_RS_SC_2025_POLICY.totalCorrectionAutomaticSelectionAllowed, false);
assert.equal(SOYBEAN_PK_RS_SC_2025_POLICY.marketAdjustmentAutomaticWithoutContextAllowed, false);

console.log("soybean-pk-rs-sc-2025: fonte corrente, conversões, correção, posicionamento e ajuste comercial protegidos por gates explícitos");
