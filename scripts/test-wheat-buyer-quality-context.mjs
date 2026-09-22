import assert from "node:assert/strict";
import {
  EMPTY_WHEAT_BUYER_QUALITY_CONTEXT,
  evaluateSelectedWheatBuyerQualityContext,
  evaluateStoredWheatBuyerQualityContext,
  parseWheatBuyerQualityContext,
} from "../src/domain/wheat-buyer-quality-context.ts";

assert.deepEqual(parseWheatBuyerQualityContext(null), EMPTY_WHEAT_BUYER_QUALITY_CONTEXT);

const notSelected = evaluateSelectedWheatBuyerQualityContext(parseWheatBuyerQualityContext({}));
assert.equal(notSelected.status, "NOT_SELECTED");
assert.equal(notSelected.policy.blocksBaseNitrogenRecommendation, false);
assert.equal(notSelected.policy.blocksSoilOpinion, false);
assert.equal(notSelected.policy.buyerProtocolAutoSelected, false);

const selectedPartial = evaluateStoredWheatBuyerQualityContext({
  protocolId: "BE8_WHEAT_VITAL_GLUTEN_2026",
  sowingBaseNitrogenKgN: 25,
  seedRateKgPerHa: 160,
  secondNitrogenProduct: "Sulfato de amônio",
  secondNitrogenDisplayedAmountKg: 175,
  fungalApplicationDeclared: true,
}, "TRIGO");
assert.equal(selectedPartial.status, "EVALUATED");
assert.equal(selectedPartial.evaluation?.mandatoryCompliance, "UNVERIFIED");
assert.equal(selectedPartial.evaluation?.checks.secondNitrogenApplication, "UNVERIFIED");
assert.ok(selectedPartial.evaluation?.limitations.includes("BE8_SECOND_N_AMOUNT_BASIS_NOT_CONFIRMED"));
assert.equal(selectedPartial.policy.blocksBaseNitrogenRecommendation, false);

const selectedConfirmed = evaluateStoredWheatBuyerQualityContext({
  protocolId: "BE8_WHEAT_VITAL_GLUTEN_2026",
  sowingBaseNitrogenKgN: 25,
  seedRateKgPerHa: 160,
  firstNitrogenApplicationKgN: 75,
  firstNitrogenLatestStage: 7,
  secondNitrogenProduct: "(NH4)2SO4",
  secondNitrogenDisplayedAmountKg: 175,
  secondNitrogenSourceAmountBasisConfirmed: true,
  fungalApplicationDeclared: true,
}, "TRIGO");
assert.equal(selectedConfirmed.status, "EVALUATED");
assert.equal(selectedConfirmed.evaluation?.mandatoryCompliance, "COMPLIANT");
assert.equal(selectedConfirmed.evaluation?.premiumGuaranteed, false);

const wrongCrop = evaluateStoredWheatBuyerQualityContext({
  protocolId: "BE8_WHEAT_VITAL_GLUTEN_2026",
}, "SOJA");
assert.equal(wrongCrop.status, "NOT_APPLICABLE");

const invalidStored = evaluateStoredWheatBuyerQualityContext({
  protocolId: "PROTOCOLO_INVENTADO",
}, "TRIGO");
assert.equal(invalidStored.status, "INVALID_OPTIONAL_EVIDENCE");
assert.equal(invalidStored.policy.blocksBaseNitrogenRecommendation, false);

assert.throws(
  () => parseWheatBuyerQualityContext({
    protocolId: "BE8_WHEAT_VITAL_GLUTEN_2026",
    firstNitrogenLatestStage: 7.5,
  }),
  /inteiro/,
);

assert.throws(
  () => parseWheatBuyerQualityContext({
    protocolId: "BE8_WHEAT_VITAL_GLUTEN_2026",
    seedRateKgPerHa: -1,
  }),
  /maior ou igual a zero/,
);

console.log("wheat-buyer-quality-context: explicit selection, non-blocking partial checklist and fail-closed buyer evidence passed");
