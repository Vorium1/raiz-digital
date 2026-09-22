import assert from "node:assert/strict";
import { evaluateAgronomicRuleAutomation } from "../src/domain/agronomic-rule-catalog.ts";
import {
  computeFloodedRiceCaMgLiming,
  RICE_FLOODED_LIMING_PROFILE,
} from "../src/domain/rice-liming-pregerminated-sosbai-2025.ts";

const catalogDecision = evaluateAgronomicRuleAutomation("CALAGEM-ARROZ-PREG-TRANS-SOSBAI-2025");
assert.equal(catalogDecision.allowed, true);
assert.equal(catalogDecision.status, "READY_FOR_IMPLEMENTATION");

const formulaApplied = computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "PRE_GERMINATED",
  waterRegime: "FLOODED_FROM_START",
  baseSaturationPct: 30,
  ctcPh7CmolcPerDm3: 10,
  exchangeableCaCmolcPerDm3: 2,
  exchangeableMgCmolcPerDm3: 0.5,
});
assert.equal(formulaApplied.needed, true);
assert.equal(formulaApplied.requirementTPerHaPrnt100, 1);
assert.equal(formulaApplied.decisionReason, "FORMULA_APPLIED");
assert.equal(formulaApplied.purpose, "CA_MG_CORRECTION_NOT_ACIDITY_CORRECTION");
assert.equal(formulaApplied.referencePrntPct, 100);
assert.equal(formulaApplied.commercialPrntAdjustmentApplied, false);

const transplant = computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "TRANSPLANTED_SEEDLINGS",
  waterRegime: "FLOODED_FROM_START",
  baseSaturationPct: 20,
  ctcPh7CmolcPerDm3: 15,
  exchangeableCaCmolcPerDm3: 3,
  exchangeableMgCmolcPerDm3: 0.8,
});
assert.equal(transplant.requirementTPerHaPrnt100, 3);

const caMgException = computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "PRE_GERMINATED",
  waterRegime: "FLOODED_FROM_START",
  baseSaturationPct: 25,
  ctcPh7CmolcPerDm3: 12,
  exchangeableCaCmolcPerDm3: 4,
  exchangeableMgCmolcPerDm3: 1,
});
assert.equal(caMgException.needed, false);
assert.equal(caMgException.requirementTPerHaPrnt100, 0);
assert.equal(caMgException.decisionReason, "CA_MG_ALREADY_ADEQUATE");

const onlyCaAdequate = computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "PRE_GERMINATED",
  waterRegime: "FLOODED_FROM_START",
  baseSaturationPct: 30,
  ctcPh7CmolcPerDm3: 10,
  exchangeableCaCmolcPerDm3: 4,
  exchangeableMgCmolcPerDm3: 0.9,
});
assert.equal(onlyCaAdequate.requirementTPerHaPrnt100, 1, "A exceção SOSBAI exige Ca e Mg simultaneamente adequados");

const thresholdV = computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "PRE_GERMINATED",
  waterRegime: "FLOODED_FROM_START",
  baseSaturationPct: 40,
  ctcPh7CmolcPerDm3: 10,
  exchangeableCaCmolcPerDm3: 2,
  exchangeableMgCmolcPerDm3: 0.5,
});
assert.equal(thresholdV.requirementTPerHaPrnt100, 0);
assert.equal(thresholdV.decisionReason, "FORMULA_APPLIED");

const aboveV = computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "TRANSPLANTED_SEEDLINGS",
  waterRegime: "FLOODED_FROM_START",
  baseSaturationPct: 40.01,
  ctcPh7CmolcPerDm3: 10,
  exchangeableCaCmolcPerDm3: 2,
  exchangeableMgCmolcPerDm3: 0.5,
});
assert.equal(aboveV.requirementTPerHaPrnt100, 0);
assert.equal(aboveV.decisionReason, "BASE_SATURATION_ABOVE_40");

assert.throws(() => computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "DRY_SEEDED",
  waterRegime: "FLOODED_FROM_START",
  baseSaturationPct: 30,
  ctcPh7CmolcPerDm3: 10,
  exchangeableCaCmolcPerDm3: 2,
  exchangeableMgCmolcPerDm3: 0.5,
}), /Sistema de estabelecimento incompatível/);

assert.throws(() => computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "PRE_GERMINATED",
  waterRegime: "INTERMITTENT",
  baseSaturationPct: 30,
  ctcPh7CmolcPerDm3: 10,
  exchangeableCaCmolcPerDm3: 2,
  exchangeableMgCmolcPerDm3: 0.5,
}), /Regime hídrico incompatível/);

assert.throws(() => computeFloodedRiceCaMgLiming({
  profileId: RICE_FLOODED_LIMING_PROFILE,
  establishmentSystem: "PRE_GERMINATED",
  waterRegime: "FLOODED_FROM_START",
  baseSaturationPct: 101,
  ctcPh7CmolcPerDm3: 10,
  exchangeableCaCmolcPerDm3: 2,
  exchangeableMgCmolcPerDm3: 0.5,
}), /Saturação por bases/);

console.log("rice-liming-pregerminated-sosbai-2025: V<=40, exceção Ca+Mg, fórmula PRNT100 e contexto hídrico/sistema validados");
