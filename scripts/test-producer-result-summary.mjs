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

// Regressões de rastreabilidade: total é calculado pela dose bruta, não por valor exibido.
const quantitativeMatrix = buildProducerResultSummary({
  areaHa: 10,
  recommendations: [{ inputType: "K2O", quantity: 60, unit: "kg/ha" }],
});
assert.equal(quantitativeMatrix.rows[0].totalQuantity, 600);
const phosphorusTotal = buildProducerResultSummary({ areaHa: 25, recommendations: [{ inputType: "P2O5", quantity: 80, unit: "kg/ha" }] });
assert.equal(phosphorusTotal.rows[0].totalQuantity, 2000);
const sulfurTotal = buildProducerResultSummary({ areaHa: 12.4, recommendations: [{ inputType: "S", quantity: 15, unit: "kg/ha" }] });
assert.equal(sulfurTotal.rows[0].totalQuantity, 186);
const preciseTotal = buildProducerResultSummary({ areaHa: 37.5, recommendations: [{ inputType: "K2O", quantity: 195.6522, unit: "kg/ha" }] });
assert.ok(Math.abs((preciseTotal.rows[0].totalQuantity ?? 0) - 7336.9575) < 1e-9);

const phosphorusAndSulfur = buildProducerResultSummary({
  areaHa: 12.5,
  recommendations: [
    { inputType: "P2O5", quantity: 48, unit: "kg/ha" },
    { inputType: "S", quantity: 20, unit: "kg/ha" },
  ],
});
assert.deepEqual(phosphorusAndSulfur.rows.map((row) => ({
  label: row.label,
  total: row.totalQuantity,
  kind: row.quantityKind,
})), [
  { label: "Fósforo (P₂O₅)", total: 600, kind: "NUTRIENT_EQUIVALENT" },
  { label: "Enxofre (S)", total: 250, kind: "NUTRIENT_EQUIVALENT" },
]);

const lime = buildProducerResultSummary({
  areaHa: 10,
  recommendations: [{ inputType: "CALCARIO_PRNT100", quantity: 2.2, unit: "t/ha" }],
});
assert.equal(lime.rows[0].totalQuantity, 22);
assert.equal(lime.rows[0].totalUnit, "t");
assert.equal(lime.rows[0].quantityKind, "LIME_PRNT100_EQUIVALENT");
assert.equal(lime.showsLimeEquivalentNote, true);
const limeArea = buildProducerResultSummary({ areaHa: 20, recommendations: [{ inputType: "CALCARIO_PRNT100", quantity: 3, unit: "t/ha" }] });
assert.equal(limeArea.rows[0].totalQuantity, 60);

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
