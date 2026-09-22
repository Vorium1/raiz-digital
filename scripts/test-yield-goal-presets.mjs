import assert from "node:assert/strict";
import {
  displayYieldFromTonPerHa,
  manualYieldToTonPerHa,
  yieldGoalPresetConfig,
} from "../src/domain/yield-goal-presets.ts";

const soy = yieldGoalPresetConfig("SOJA");
assert.ok(soy);
assert.equal(soy.displayUnit, "sc/ha");
assert.equal(soy.sackKg, 60);
assert.equal(soy.presets.find((item) => item.id === "70-80")?.targetTonPerHa, 4.8);
assert.equal(manualYieldToTonPerHa("SOJA", 80), 4.8);
assert.equal(displayYieldFromTonPerHa("SOJA", 4.8), 80);

const corn = yieldGoalPresetConfig("MILHO");
assert.ok(corn);
assert.equal(corn.presets.find((item) => item.id === "250-280")?.targetTonPerHa, 16.8);
assert.equal(manualYieldToTonPerHa("MILHO", 280), 16.8);

const rice = yieldGoalPresetConfig("ARROZ");
assert.ok(rice);
assert.equal(rice.displayUnit, "sc/ha");
assert.equal(rice.sackKg, 50);
assert.equal(rice.presets.find((item) => item.id === "160-180")?.targetTonPerHa, 9);
assert.equal(manualYieldToTonPerHa("ARROZ", 180), 9);
assert.equal(displayYieldFromTonPerHa("ARROZ", 9), 180);

const wheat = yieldGoalPresetConfig("TRIGO");
assert.ok(wheat);
assert.equal(wheat.presets.find((item) => item.id === "90-100")?.targetTonPerHa, 6);

const canola = yieldGoalPresetConfig("CANOLA");
assert.ok(canola);
assert.equal(canola.presets.find((item) => item.id === "2.5-3")?.targetTonPerHa, 3);

assert.equal(yieldGoalPresetConfig("CARINATA"), null);
assert.equal(manualYieldToTonPerHa("CARINATA", 2.4), 2.4);

console.log("yield-goal-presets: faixas por cultura, pesos de saca e conversões validados");
