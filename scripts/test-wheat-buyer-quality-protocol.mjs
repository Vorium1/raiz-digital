import assert from "node:assert/strict";
import {
  BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026,
  ammoniumSulfateNutrientsFromProductMass,
  evaluateBe8WheatVitalGlutenProtocol,
} from "../src/domain/wheat-buyer-quality-protocol.ts";

assert.equal(BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.policy.buyerProtocolIsAgronomicUniversalRule, false);
assert.equal(BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.policy.requiresExplicitBuyerProtocolSelection, true);
assert.equal(BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.policy.complianceGuaranteesPremium, false);
assert.equal(BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.policy.recommendedItemAffectsMandatoryCompliance, false);
assert.equal(BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.policy.missingOptionalDataBlocksBaseNitrogenRecommendation, false);

const full = evaluateBe8WheatVitalGlutenProtocol({
  sowingBaseNitrogenKgN: 25,
  seedRateKgPerHa: 160,
  firstNitrogenApplicationKgN: 75,
  firstNitrogenLatestStage: 7,
  secondNitrogenApplication: {
    product: "Sulfato de amônio",
    displayedAmountKg: 175,
    sourceAmountBasisConfirmed: true,
  },
  fungalApplicationDeclared: true,
});
assert.equal(full.mandatoryCompliance, "COMPLIANT");
assert.equal(full.premiumGuaranteed, false);
assert.equal(full.checks.firstNitrogenApplicationRecommended, "FOLLOWED");
assert.ok(full.limitations.includes("BE8_SECOND_N_AREA_BASIS_NOT_EXPLICIT_IN_SOURCE"));
assert.ok(full.limitations.includes("BE8_FUNGAL_APPLICATION_PRODUCT_NOT_SPECIFIED_IN_SOURCE"));
assert.ok(full.limitations.includes("BE8_FUNGAL_APPLICATION_DOSE_NOT_SPECIFIED_IN_SOURCE"));

const optionalFirstNNotFollowed = evaluateBe8WheatVitalGlutenProtocol({
  sowingBaseNitrogenKgN: 25,
  seedRateKgPerHa: 160,
  firstNitrogenApplicationKgN: 50,
  firstNitrogenLatestStage: 8,
  secondNitrogenApplication: {
    product: "(NH4)2SO4",
    displayedAmountKg: 180,
    sourceAmountBasisConfirmed: true,
  },
  fungalApplicationDeclared: true,
});
assert.equal(optionalFirstNNotFollowed.checks.firstNitrogenApplicationRecommended, "NOT_FOLLOWED");
assert.equal(
  optionalFirstNNotFollowed.mandatoryCompliance,
  "COMPLIANT",
  "item recomendado não pode virar cadeado comercial",
);

const ambiguousAreaBasis = evaluateBe8WheatVitalGlutenProtocol({
  sowingBaseNitrogenKgN: 25,
  seedRateKgPerHa: 160,
  secondNitrogenApplication: {
    product: "Sulfato de amônio",
    displayedAmountKg: 175,
  },
  fungalApplicationDeclared: true,
});
assert.equal(ambiguousAreaBasis.checks.secondNitrogenApplication, "UNVERIFIED");
assert.equal(ambiguousAreaBasis.mandatoryCompliance, "UNVERIFIED");
assert.ok(ambiguousAreaBasis.limitations.includes("BE8_SECOND_N_AMOUNT_BASIS_NOT_CONFIRMED"));

const wrongSeedRate = evaluateBe8WheatVitalGlutenProtocol({
  sowingBaseNitrogenKgN: 25,
  seedRateKgPerHa: 150,
  secondNitrogenApplication: {
    product: "AMMONIUM SULFATE",
    displayedAmountKg: 180,
    sourceAmountBasisConfirmed: true,
  },
  fungalApplicationDeclared: true,
});
assert.equal(wrongSeedRate.checks.seedRate, "NON_COMPLIANT");
assert.equal(wrongSeedRate.mandatoryCompliance, "NON_COMPLIANT");

const wrongSecondProduct = evaluateBe8WheatVitalGlutenProtocol({
  sowingBaseNitrogenKgN: 25,
  seedRateKgPerHa: 160,
  secondNitrogenApplication: {
    product: "Ureia",
    displayedAmountKg: 180,
    sourceAmountBasisConfirmed: true,
  },
  fungalApplicationDeclared: true,
});
assert.equal(wrongSecondProduct.checks.secondNitrogenApplication, "NON_COMPLIANT");
assert.equal(wrongSecondProduct.mandatoryCompliance, "NON_COMPLIANT");

const missingMandatory = evaluateBe8WheatVitalGlutenProtocol({
  sowingBaseNitrogenKgN: 25,
  seedRateKgPerHa: 160,
});
assert.equal(missingMandatory.mandatoryCompliance, "UNVERIFIED");
assert.equal(missingMandatory.checks.secondNitrogenApplication, "UNVERIFIED");
assert.equal(missingMandatory.checks.fungalApplication, "UNVERIFIED");

const baseTooLow = evaluateBe8WheatVitalGlutenProtocol({
  sowingBaseNitrogenKgN: 15,
  seedRateKgPerHa: 160,
  secondNitrogenApplication: {
    product: "Sulfato de amônio",
    displayedAmountKg: 175,
    sourceAmountBasisConfirmed: true,
  },
  fungalApplicationDeclared: true,
});
assert.equal(baseTooLow.checks.sowingBaseNitrogen, "NON_COMPLIANT");
assert.equal(baseTooLow.mandatoryCompliance, "NON_COMPLIANT");

const nutrientMin = ammoniumSulfateNutrientsFromProductMass(150);
assert.equal(nutrientMin.nitrogenKg, 31.5);
assert.equal(nutrientMin.sulfurKg, 36);
assert.equal(nutrientMin.areaBasis, "NOT_EXPLICIT_IN_GRAPHIC");

const nutrientMax = ammoniumSulfateNutrientsFromProductMass(200);
assert.equal(nutrientMax.nitrogenKg, 42);
assert.equal(nutrientMax.sulfurKg, 48);

assert.throws(() => ammoniumSulfateNutrientsFromProductMass(-1), /inválida/);

console.log("wheat-buyer-quality-protocol: mandatory locks enforced, recommended N remains optional, premium not guaranteed");
