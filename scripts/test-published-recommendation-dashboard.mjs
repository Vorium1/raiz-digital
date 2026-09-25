import assert from "node:assert/strict";
import { buildPublishedRecommendationDashboard } from "../src/domain/published-recommendation-dashboard.ts";
import { producerFacingRecommendationText, recommendationInputLabel } from "../src/domain/recommendation-display.ts";

const groups = buildPublishedRecommendationDashboard({
  areaHa: 10,
  recommendations: [
    { inputType: "CALCARIO_PRNT100", quantity: 2.5, unit: "t/ha", rationale: "Correção aprovada." },
    { inputType: "K2O", quantity: 75, unit: "kg/ha", rationale: "Potássio aprovado." },
    { inputType: "B", quantity: 1.2, unit: "kg/ha", rationale: "Boro aprovado." },
    { inputType: "FOLIAR_X", quantity: 2, unit: "L/ha", rationale: "Aplicação complementar." },
  ],
});

assert.deepEqual(groups.map((group) => group.category), ["CORRECTION", "MACRO", "MICRO", "OTHER"]);

const correction = groups[0].rows[0];
assert.equal(correction.label, "Calcário — necessidade equivalente PRNT 100%");
assert.equal(correction.totalQuantity, 25);
assert.equal(correction.totalUnit, "t");

const macro = groups[1].rows[0];
assert.equal(macro.label, "Potássio (K₂O)");
assert.equal(macro.totalQuantity, 750);
assert.equal(macro.totalUnit, "kg");

const micro = groups[2].rows[0];
assert.equal(micro.label, "Boro (B)");
assert.equal(micro.totalQuantity, 12);
assert.equal(micro.totalUnit, "kg");

const other = groups[3].rows[0];
assert.equal(other.totalQuantity, null);
assert.equal(other.totalUnit, null);

assert.equal(recommendationInputLabel("ZN"), "Zinco (Zn)");
assert.equal(recommendationInputLabel("MO"), "Molibdênio (Mo)");
assert.equal(
  producerFacingRecommendationText("Dose definida por RULE_ENGINE_INTERNAL. Aplicar conforme aprovado."),
  "Dose definida por. Aplicar conforme aprovado.",
);

const ignored = buildPublishedRecommendationDashboard({
  areaHa: 10,
  recommendations: [
    { inputType: "K2O", quantity: 0, unit: "kg/ha" },
    { inputType: "", quantity: 10, unit: "kg/ha" },
    { inputType: "B", quantity: Number.NaN, unit: "kg/ha" },
  ],
});
assert.deepEqual(ignored, []);

console.log("published-recommendation-dashboard: grupos, totais, micros e limpeza producer-facing aprovados");
