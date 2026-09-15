import assert from "node:assert/strict";
import {
  canonicalCommercialTarget,
  deriveCommercialTargets,
} from "../src/domain/commercial-recommendation-targets.ts";

assert.equal(canonicalCommercialTarget("P2O5"), "P2O5");
assert.equal(canonicalCommercialTarget("Fósforo P2O5"), "P2O5");
assert.equal(canonicalCommercialTarget("Potássio K2O"), "K2O");
assert.equal(canonicalCommercialTarget("Calcário equivalente PRNT 100"), "LIME_PRNT100");
assert.equal(canonicalCommercialTarget("MAP 11-52-00"), null, "nome de produto não pode virar nutriente por inferência");

const state = deriveCommercialTargets([
  {
    recommendationId: "11111111-1111-4111-8111-111111111111",
    inputType: "P2O5",
    recommendedQuantity: 80,
    recommendedUnit: "kg/ha",
    calculationSource: "cqfs:p2o5:v1",
    recommendedAt: "2026-09-14T08:00:00.000Z",
    sourceGenerationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    recommendationCurrent: true,
    recommendationCurrentCode: "CURRENT",
  },
  { inputType: "K2O", recommendedQuantity: 60, recommendedUnit: "kg ha-1", recommendationCurrent: true },
  { inputType: "N", recommendedQuantity: 120, recommendedUnit: "kg/ha", recommendationCurrent: false, recommendationCurrentReason: "Safra alterada depois da recomendação." },
  { inputType: "Calcário PRNT 100", recommendedQuantity: 4.7, recommendedUnit: "t/ha", recommendationCurrent: true },
  { inputType: "S", recommendedQuantity: 20, recommendedUnit: "sc/ha", recommendationCurrent: true },
  { inputType: "MAP 11-52-00", recommendedQuantity: 150, recommendedUnit: "kg/ha", recommendationCurrent: true },
]);

assert.equal(state.nutrientTargetsKgPerHa.P2O5, 80);
assert.equal(state.nutrientTargetsKgPerHa.K2O, 60);
assert.equal(state.nutrientTargetsKgPerHa.N, undefined, "recomendação stale nunca alimenta simulação corrente");
assert.equal(state.nutrientTargetsKgPerHa.S, undefined, "unidade não homologada não pode ser convertida por suposição");
assert.equal(state.limingRequirementTonPerHaPrnt100, 4.7);
assert.ok(state.blockers.some((item) => item.code === "STALE_RECOMMENDATION" && item.inputType === "N"));
assert.ok(state.blockers.some((item) => item.code === "UNSUPPORTED_UNIT" && item.inputType === "S"));
assert.ok(state.blockers.some((item) => item.code === "UNSUPPORTED_INPUT_TYPE" && item.inputType === "MAP 11-52-00"));

const pSource = state.sourceRows.find((row) => row.canonicalTarget === "P2O5");
assert.ok(pSource, "alvo P2O5 deve manter origem rastreável");
assert.equal(pSource.recommendationId, "11111111-1111-4111-8111-111111111111");
assert.equal(pSource.calculationSource, "cqfs:p2o5:v1");
assert.equal(pSource.recommendedAt, "2026-09-14T08:00:00.000Z");
assert.equal(pSource.sourceGenerationId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
assert.equal(pSource.freshnessCode, "CURRENT");

const ambiguous = deriveCommercialTargets([
  { recommendationId: "22222222-2222-4222-8222-222222222222", inputType: "P2O5", recommendedQuantity: 80, recommendedUnit: "kg/ha", recommendationCurrent: true },
  { recommendationId: "33333333-3333-4333-8333-333333333333", inputType: "Fósforo P2O5", recommendedQuantity: 85, recommendedUnit: "kg/ha", recommendationCurrent: true },
]);
assert.equal(ambiguous.nutrientTargetsKgPerHa.P2O5, undefined, "alvo divergente precisa falhar fechado");
assert.ok(ambiguous.blockers.some((item) => item.code === "AMBIGUOUS_TARGET"));
assert.equal(ambiguous.sourceRows.some((row) => row.canonicalTarget === "P2O5"), false, "alvo ambíguo também sai do pacote de evidência utilizável");

const sameAlias = deriveCommercialTargets([
  { inputType: "P2O5", recommendedQuantity: 80, recommendedUnit: "kg/ha", recommendationCurrent: true },
  { inputType: "Fósforo P2O5", recommendedQuantity: 80, recommendedUnit: "kg/ha", recommendationCurrent: true },
]);
assert.equal(sameAlias.nutrientTargetsKgPerHa.P2O5, 80);
assert.ok(!sameAlias.blockers.some((item) => item.code === "AMBIGUOUS_TARGET"));

console.log("commercial-recommendation-targets: corrente, unidade explícita, alvo inequívoco e proveniência preservada");
