import assert from "node:assert/strict";
import {
  computeRiceContinuousPotassium,
  RICE_K_SOSBAI_2025_PROFILE,
} from "../src/domain/rice-potassium-sosbai-2025.ts";

const classes = [
  ["MUITO_BAIXO", [100, 120, 140]],
  ["BAIXO", [80, 100, 120]],
  ["MEDIO", [60, 80, 100]],
  ["ALTO", [40, 60, 80]],
];
const responses = ["MEDIA", "ALTA", "MUITO_ALTA"];

for (const [potassiumClass, doses] of classes) {
  for (let i = 0; i < responses.length; i += 1) {
    const result = computeRiceContinuousPotassium({
      profileId: RICE_K_SOSBAI_2025_PROFILE,
      potassiumClass,
      classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
      potassiumMethod: "MEHLICH_1",
      responseClass: responses[i],
      responseClassApproved: true,
      ctcPh7CmolcPerDm3: 10,
      ctcUnit: "cmolc/dm3",
    });
    assert.deepEqual(result.dose, { kind: "EXACT", kgPerHa: doses[i] });
    assert.equal(result.ctcAdjustmentKgPerHa, 0);
    assert.equal(result.splitApplicationAutomated, false);
    assert.equal(result.grainExportSubstitutionAutomated, false);
  }
}

for (let i = 0; i < responses.length; i += 1) {
  const result = computeRiceContinuousPotassium({
    profileId: RICE_K_SOSBAI_2025_PROFILE,
    potassiumClass: "MUITO_ALTO",
    classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
    potassiumMethod: "MEHLICH_1",
    responseClass: responses[i],
    responseClassApproved: true,
    ctcPh7CmolcPerDm3: 10,
    ctcUnit: "cmolc/dm3",
  });
  assert.deepEqual(result.dose, { kind: "UPPER_BOUND", maxKgPerHa: [40, 60, 80][i] });
  assert.equal(result.veryHighReductionAutomated, false);
}

const ctcExactly15 = computeRiceContinuousPotassium({
  profileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumClass: "BAIXO",
  classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumMethod: "MEHLICH_1",
  responseClass: "ALTA",
  responseClassApproved: true,
  ctcPh7CmolcPerDm3: 15,
  ctcUnit: "cmolc/dm3",
});
assert.deepEqual(ctcExactly15.dose, { kind: "EXACT", kgPerHa: 100 });
assert.equal(ctcExactly15.ctcAdjustmentKgPerHa, 0);

const highCtc = computeRiceContinuousPotassium({
  profileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumClass: "BAIXO",
  classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumMethod: "MEHLICH_1",
  responseClass: "ALTA",
  responseClassApproved: true,
  ctcPh7CmolcPerDm3: 15.01,
  ctcUnit: "cmolc/dm3",
});
assert.deepEqual(highCtc.baseDose, { kind: "EXACT", kgPerHa: 100 });
assert.deepEqual(highCtc.dose, { kind: "EXACT", kgPerHa: 120 });
assert.equal(highCtc.ctcAdjustmentKgPerHa, 20);

const highCtcUpper = computeRiceContinuousPotassium({
  profileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumClass: "MUITO_ALTO",
  classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumMethod: "MEHLICH_1",
  responseClass: "MUITO_ALTA",
  responseClassApproved: true,
  ctcPh7CmolcPerDm3: 16,
  ctcUnit: "cmolc/dm3",
});
assert.deepEqual(highCtcUpper.baseDose, { kind: "UPPER_BOUND", maxKgPerHa: 80 });
assert.deepEqual(highCtcUpper.dose, { kind: "UPPER_BOUND", maxKgPerHa: 100 });

assert.throws(() => computeRiceContinuousPotassium({
  profileId: "CQFS_SEQUEIRO",
  potassiumClass: "MEDIO",
  classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumMethod: "MEHLICH_1",
  responseClass: "MEDIA",
  responseClassApproved: true,
  ctcPh7CmolcPerDm3: 10,
  ctcUnit: "cmolc/dm3",
}), /Perfil de arroz incompatível/);

assert.throws(() => computeRiceContinuousPotassium({
  profileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumClass: "MEDIO",
  classificationProfileId: "OUTRO_PERFIL",
  potassiumMethod: "MEHLICH_1",
  responseClass: "MEDIA",
  responseClassApproved: true,
  ctcPh7CmolcPerDm3: 10,
  ctcUnit: "cmolc/dm3",
}), /Classe de K sem proveniência/);

assert.throws(() => computeRiceContinuousPotassium({
  profileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumClass: "MEDIO",
  classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumMethod: "OTHER",
  responseClass: "MEDIA",
  responseClassApproved: true,
  ctcPh7CmolcPerDm3: 10,
  ctcUnit: "cmolc/dm3",
}), /exige Mehlich-1/);

assert.throws(() => computeRiceContinuousPotassium({
  profileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumClass: "MEDIO",
  classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumMethod: "MEHLICH_1",
  responseClass: "MEDIA",
  responseClassApproved: false,
  ctcPh7CmolcPerDm3: 10,
  ctcUnit: "cmolc/dm3",
}), /explicitamente validada/);

for (const invalidCtc of [-0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => computeRiceContinuousPotassium({
    profileId: RICE_K_SOSBAI_2025_PROFILE,
    potassiumClass: "MEDIO",
    classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
    potassiumMethod: "MEHLICH_1",
    responseClass: "MEDIA",
    responseClassApproved: true,
    ctcPh7CmolcPerDm3: invalidCtc,
    ctcUnit: "cmolc/dm3",
  }), /CTC pH 7,0/);
}

assert.throws(() => computeRiceContinuousPotassium({
  profileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumClass: "MEDIO",
  classificationProfileId: RICE_K_SOSBAI_2025_PROFILE,
  potassiumMethod: "MEHLICH_1",
  responseClass: "MEDIA",
  responseClassApproved: true,
  ctcPh7CmolcPerDm3: 10,
  ctcUnit: "meq/100g",
}), /Unidade incompatível/);

console.log("rice-potassium-sosbai-2025: tabela 4.7, CTC >15 e limites superiores validados; reduções/parcelamento permanecem não automatizados");
