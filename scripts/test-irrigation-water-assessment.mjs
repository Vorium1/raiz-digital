import assert from "node:assert/strict";
import { evaluateIrrigationWaterEvidence as evaluate } from "../src/domain/irrigation-water-assessment.ts";

const empty = evaluate({ waterRegime: "" });
assert.equal(empty.resolution, "NOT_EVALUATED");
assert.equal(empty.policy.missingDataBlocksOfficialReport, false);
assert.equal(empty.policy.unknownComponentsAssumedZero, false);

const etoOnly = evaluate({ waterRegime: "", referenceEtMm: 4.8 });
assert.equal(etoOnly.resolution, "CONTEXT_ONLY");
assert.equal(etoOnly.demand, null);
assert.ok(etoOnly.limitations.includes("REFERENCE_ET_IS_NOT_CROP_ET"));

const rainOnly = evaluate({ waterRegime: "", precipitationMm: 20 });
assert.equal(rainOnly.resolution, "CONTEXT_ONLY");
assert.ok(rainOnly.limitations.includes("TOTAL_RAIN_IS_NOT_EFFECTIVE_RAIN"));

const demand = evaluate({ waterRegime: "IRRIGADO", cropEtMm: 6.2 });
assert.equal(demand.resolution, "DEMAND_AVAILABLE");
assert.equal(demand.demand.cropEtMm, 6.2);
assert.equal(demand.balance, null);
assert.ok(demand.limitations.includes("IRRIGATED_REGIME_DOES_NOT_PROVE_DAILY_NET_IRRIGATION"));

const unaligned = evaluate({
  waterRegime: "IRRIGADO",
  sourceAlignment: "UNVERIFIED",
  cropEtMm: 8,
  effectivePrecipitationMm: 5,
  netIrrigationMm: 10,
  capillaryRiseMm: 0,
  previousRootZoneDepletionMm: 40,
  rootZoneTotalAvailableWaterMm: 120,
  readilyAvailableWaterMm: 60,
});
assert.equal(unaligned.resolution, "UNALIGNED_EVIDENCE");
assert.equal(unaligned.balance, null);

const adequate = evaluate({
  waterRegime: "IRRIGADO",
  sourceAlignment: "ALIGNED",
  cropEtMm: 8,
  effectivePrecipitationMm: 5,
  netIrrigationMm: 10,
  capillaryRiseMm: 0,
  previousRootZoneDepletionMm: 40,
  rootZoneTotalAvailableWaterMm: 120,
  readilyAvailableWaterMm: 60,
});
assert.equal(adequate.resolution, "BALANCE_AVAILABLE");
assert.equal(adequate.balance.nextRootZoneDepletionMm, 33);
assert.equal(adequate.balance.deepPercolationMm, 0);
assert.equal(adequate.balance.state, "WATER_SUPPLY_ADEQUATE");
assert.equal(adequate.policy.automaticIrrigationDepthRecommendationAllowed, false);

const threshold = evaluate({
  waterRegime: "SEQUEIRO",
  sourceAlignment: "ALIGNED",
  cropEtMm: 5,
  effectivePrecipitationMm: 0,
  capillaryRiseMm: 0,
  previousRootZoneDepletionMm: 58,
  rootZoneTotalAvailableWaterMm: 120,
  readilyAvailableWaterMm: 60,
});
assert.equal(threshold.resolution, "BALANCE_AVAILABLE");
assert.equal(threshold.balance.netIrrigationMm, 0, "declared rainfed system is explicit zero supplemental irrigation");
assert.equal(threshold.balance.nextRootZoneDepletionMm, 63);
assert.equal(threshold.balance.state, "IRRIGATION_THRESHOLD_REACHED");

const percolation = evaluate({
  waterRegime: "SEQUEIRO",
  sourceAlignment: "ALIGNED",
  cropEtMm: 5,
  effectivePrecipitationMm: 20,
  capillaryRiseMm: 0,
  previousRootZoneDepletionMm: 5,
  rootZoneTotalAvailableWaterMm: 120,
  readilyAvailableWaterMm: 60,
});
assert.equal(percolation.balance.nextRootZoneDepletionMm, 0);
assert.equal(percolation.balance.deepPercolationMm, 10);

const stress = evaluate({
  waterRegime: "SEQUEIRO",
  sourceAlignment: "ALIGNED",
  cropEtMm: 30,
  effectivePrecipitationMm: 0,
  capillaryRiseMm: 0,
  previousRootZoneDepletionMm: 100,
  rootZoneTotalAvailableWaterMm: 120,
  readilyAvailableWaterMm: 60,
});
assert.equal(stress.balance.state, "WATER_STRESS_ESTIMATED");
assert.ok(stress.limitations.includes("ESTIMATED_DEPLETION_EXCEEDS_ROOT_ZONE_TOTAL_AVAILABLE_WATER"));

const unknownRegime = evaluate({
  waterRegime: "",
  sourceAlignment: "ALIGNED",
  cropEtMm: 5,
  effectivePrecipitationMm: 0,
  capillaryRiseMm: 0,
  previousRootZoneDepletionMm: 20,
  rootZoneTotalAvailableWaterMm: 100,
  readilyAvailableWaterMm: 50,
});
assert.notEqual(unknownRegime.resolution, "BALANCE_AVAILABLE");
assert.ok(unknownRegime.limitations.includes("WATER_REGIME_UNKNOWN_DOES_NOT_PROVE_ZERO_IRRIGATION"));

for (const invalid of [
  { cropEtMm: -1 },
  { effectivePrecipitationMm: Number.NaN },
  { rootZoneTotalAvailableWaterMm: 0 },
  { rootZoneTotalAvailableWaterMm: 100, readilyAvailableWaterMm: 110 },
  { rootZoneTotalAvailableWaterMm: 100, previousRootZoneDepletionMm: 110 },
]) {
  const result = evaluate({ waterRegime: "SEQUEIRO", ...invalid });
  assert.equal(result.resolution, "INVALID_OPTIONAL_EVIDENCE");
  assert.equal(result.policy.missingDataBlocksOfficialReport, false);
}

console.log("irrigation-water-assessment: progressive evidence, no silent zeros, aligned balance and non-blocking policy passed");
