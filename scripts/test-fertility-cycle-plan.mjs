import assert from "node:assert/strict";
import { buildFertilityCyclePlan } from "../src/domain/fertility-cycle-plan.ts";

const plan = buildFertilityCyclePlan({
  horizonYears: 3,
  phosphorusLevel: "Baixo",
  potassiumLevel: "Baixo",
  correctionStrategy: "GRADUAL_TWO_CROPS",
  seasons: [
    { order: 1, cropCode: "SOJA", targetYieldTonPerHa: 4.8 },
    { order: 2, cropCode: "TRIGO", targetYieldTonPerHa: 4.2 },
    { order: 3, cropCode: "SOJA", targetYieldTonPerHa: 4.8 },
    { order: 4, cropCode: "MILHO", targetYieldTonPerHa: 12 },
  ],
});

assert.deepEqual(plan.correctionTotalKgPerHa, { P2O5: 80, K2O: 60 });
assert.deepEqual(plan.correctionScheduleKgPerHa, [
  { order: 1, P2O5: 53.3, K2O: 40 },
  { order: 2, P2O5: 26.7, K2O: 20 },
]);

const first = plan.seasonPlans[0];
assert.equal(first.cropCode, "SOJA");
assert.equal(first.maintenanceKgPerHa.P2O5, 72);
assert.equal(first.maintenanceKgPerHa.K2O, 120);
assert.equal(first.totalPlannedKgPerHa.P2O5, 125.3);
assert.equal(first.totalPlannedKgPerHa.K2O, 160);

const second = plan.seasonPlans[1];
assert.equal(second.cropCode, "TRIGO");
assert.equal(second.maintenanceKgPerHa.P2O5, 63);
assert.equal(second.maintenanceKgPerHa.K2O, 42);
assert.equal(second.totalPlannedKgPerHa.P2O5, 89.7);
assert.equal(second.totalPlannedKgPerHa.K2O, 62);

assert.equal(plan.planningStatus, "READY");
assert.equal(plan.correctionOnlyScenario.productivityForecastAllowed, false);
assert.equal(plan.correctionOnlyScenario.expectedYieldTonPerHa, null);
assert.ok(plan.correctionOnlyScenario.skippedMaintenanceKgPerHa.P2O5 > 0);
assert.ok(plan.correctionOnlyScenario.skippedMaintenanceKgPerHa.K2O > 0);
assert.deepEqual(plan.principles.limeTypicalResidualYears, { min: 3, max: 5 });
assert.equal(plan.principles.annualMaintenanceStillRequired, true);

const totalNow = buildFertilityCyclePlan({
  horizonYears: 2,
  phosphorusLevel: "Muito Baixo",
  potassiumLevel: "Médio",
  correctionStrategy: "TOTAL_AT_START",
  seasons: [
    { order: 1, cropCode: "SOJA", targetYieldTonPerHa: 3 },
    { order: 2, cropCode: "SOJA", targetYieldTonPerHa: 3 },
  ],
});
assert.deepEqual(totalNow.correctionTotalKgPerHa, { P2O5: 160, K2O: 30 });
assert.deepEqual(totalNow.correctionScheduleKgPerHa, [{ order: 1, P2O5: 160, K2O: 30 }]);
assert.equal(totalNow.seasonPlans[1].correctionKgPerHa.P2O5, 0);

const partial = buildFertilityCyclePlan({
  horizonYears: 4,
  phosphorusLevel: "Médio",
  potassiumLevel: "Alto",
  correctionStrategy: "GRADUAL_TWO_CROPS",
  seasons: [
    { order: 1, cropCode: "CANOLA", targetYieldTonPerHa: 2.5 },
    { order: 2, cropCode: "SOJA", targetYieldTonPerHa: null },
  ],
});
assert.equal(partial.planningStatus, "PARTIAL");
assert.ok(partial.blockers.some((item) => item.code === "CROP_MAINTENANCE_TABLE_NOT_HOMOLOGATED"));
assert.ok(partial.blockers.some((item) => item.code === "TARGET_YIELD_MISSING_FOR_MAINTENANCE"));

console.log("fertility-cycle-plan: correção multi-ano, manutenção e cenário sem reinvestimento validados");
