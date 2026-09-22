import assert from "node:assert/strict";
import {
  buildRegionalYieldScenario,
  evaluateYieldForecastReadiness,
  kgHaToScHa,
  percentile,
  toKgHa,
} from "../src/domain/yield-outlook.ts";

assert.equal(toKgHa(60, "sc/ha"), 3600);
assert.equal(toKgHa(3.6, "t/ha"), 3600);
assert.equal(toKgHa(3600, "kg/ha"), 3600);
assert.equal(toKgHa(70, "@/ha"), null);
assert.equal(kgHaToScHa(3600), 60);
assert.equal(percentile([1000, 2000, 3000, 4000], 0.75), 3250);

const regional = buildRegionalYieldScenario([
  { year: 2020, yieldKgHa: 2000 },
  { year: 2021, yieldKgHa: 3000 },
  { year: 2022, yieldKgHa: 4000 },
  { year: 2023, yieldKgHa: 5000 },
]);
assert.equal(regional.sampleYears, 4);
assert.equal(regional.latest?.year, 2023);
assert.equal(regional.medianKgHa, 3500);
assert.equal(regional.goodYearScenarioKgHa, 4250);

const blocked = evaluateYieldForecastReadiness({
  cropCurrent: null,
  cultivar: null,
  yieldHistory: [],
  ndviSeries: [{ capturedAt: "2026-09-18", meanNdvi: 0.7 }],
});
assert.equal(blocked.ready, false);
assert.ok(blocked.blockers.includes("CURRENT_CROP_NOT_CONFIRMED"));
assert.ok(blocked.blockers.includes("FIELD_HISTORY_INSUFFICIENT"));
assert.ok(blocked.blockers.includes("NDVI_SERIES_INSUFFICIENT"));
assert.ok(blocked.blockers.includes("CULTIVAR_NOT_INFORMED"));
assert.ok(blocked.blockers.includes("FORECAST_MODEL_NOT_CALIBRATED"));

const calibratedInputsStillBlockedUntilModelExists = evaluateYieldForecastReadiness({
  cropCurrent: "Soja",
  cultivar: "Cultivar informada",
  yieldHistory: [
    { seasonLabel: "2023/24", crop: "Soja", yieldValue: 60, yieldUnit: "sc/ha" },
    { seasonLabel: "2024/25", crop: "Soja", yieldValue: 65, yieldUnit: "sc/ha" },
    { seasonLabel: "2025/26", crop: "Soja", yieldValue: 58, yieldUnit: "sc/ha" },
  ],
  ndviSeries: [
    { capturedAt: "2026-01-01", meanNdvi: 0.4 },
    { capturedAt: "2026-02-01", meanNdvi: 0.7 },
    { capturedAt: "2026-03-01", meanNdvi: 0.8 },
  ],
});
assert.deepEqual(calibratedInputsStillBlockedUntilModelExists.blockers, ["FORECAST_MODEL_NOT_CALIBRATED"]);

console.log("yield outlook domain contracts: ok");
