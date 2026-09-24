import assert from "node:assert/strict";
import { buildProducerResultSummary } from "../src/domain/producer-result-summary.ts";

const potassium = buildProducerResultSummary({
  areaHa: 50,
  recommendations: [{ inputType: "K2O", quantity: 75, unit: "kg/ha" }],
});
assert.equal(potassium.hasUniformRecommendations, true);
assert.equal(potassium.rows.length, 1);
assert.equal(potassium.rows[0].label, "Potássio (K₂O)");
assert.equal(potassium.rows[0].doseQuantity, 75);
assert.equal(potassium.rows[0].totalQuantity, 3750);
assert.equal(potassium.rows[0].totalUnit, "kg");
assert.equal(potassium.rows[0].quantityKind, "NUTRIENT_EQUIVALENT");
assert.equal(potassium.showsNutrientEquivalentNote, true);
assert.equal(potassium.costFrozenInOfficialReport, false);

const lime = buildProducerResultSummary({
  areaHa: 10,
  recommendations: [{ inputType: "CALCARIO_PRNT100", quantity: 2.2, unit: "t/ha" }],
});
assert.equal(lime.rows[0].totalQuantity, 22);
assert.equal(lime.rows[0].totalUnit, "t");
assert.equal(lime.rows[0].quantityKind, "LIME_PRNT100_EQUIVALENT");
assert.equal(lime.showsLimeEquivalentNote, true);

const unsupportedUnit = buildProducerResultSummary({
  areaHa: 20,
  recommendations: [{ inputType: "B", quantity: 0.5, unit: "g/planta" }],
});
assert.equal(unsupportedUnit.rows.length, 1);
assert.equal(unsupportedUnit.rows[0].totalQuantity, null);
assert.equal(unsupportedUnit.rows[0].totalUnit, null);

const noArea = buildProducerResultSummary({
  areaHa: 0,
  recommendations: [{ inputType: "P2O5", quantity: 60, unit: "kg/ha" }],
});
assert.equal(noArea.rows[0].totalQuantity, null);

const empty = buildProducerResultSummary({ areaHa: 42, recommendations: [] });
assert.equal(empty.hasUniformRecommendations, false);
assert.deepEqual(empty.rows, []);

const invalid = buildProducerResultSummary({
  areaHa: 42,
  recommendations: [
    { inputType: "", quantity: 10, unit: "kg/ha" },
    { inputType: "K2O", quantity: Number.NaN, unit: "kg/ha" },
    { inputType: "K2O", quantity: 0, unit: "kg/ha" },
  ],
});
assert.equal(invalid.rows.length, 0);

console.log("producer-result-summary: totais da área, equivalência e fail-closed aprovados");
