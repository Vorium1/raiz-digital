import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildParameterComparisonRows,
} from "../src/domain/comparison-compatibility.ts";

function aggregate(overrides = {}) {
  return {
    parameterCode: "P",
    n: 4,
    avg: 12,
    units: ["mg/dm³"],
    methods: ["Mehlich-1"],
    sampleTypes: ["SOIL"],
    depths: [{ from: 0, to: 20 }],
    ...overrides,
  };
}

function compare(a, b) {
  return buildParameterComparisonRows(
    new Map([["P", a]]),
    new Map([["P", b]]),
    new Map(),
    new Map(),
  )[0];
}

const valid = compare(aggregate({ avg: 10 }), aggregate({ avg: 12.5 }));
assert.equal(valid.comparable, true);
assert.equal(valid.absoluteDifference, 2.5);
assert.equal(valid.direction, "INCREASE");
assert.deepEqual(valid.depthA, { from: 0, to: 20 });

const decrease = compare(aggregate({ avg: 15 }), aggregate({ avg: 12 }));
assert.equal(decrease.direction, "DECREASE");
assert.equal(decrease.absoluteDifference, -3);

const equal = compare(aggregate({ avg: 12 }), aggregate({ avg: 12 }));
assert.equal(equal.direction, "NO_CHANGE");
assert.equal(equal.absoluteDifference, 0);

const mixedMethod = compare(
  aggregate({ methods: ["Mehlich-1", "Resina"] }),
  aggregate({ methods: ["Mehlich-1"] }),
);
assert.equal(mixedMethod.comparable, false);
assert.equal(mixedMethod.absoluteDifference, null);
assert.equal(mixedMethod.direction, "NOT_COMPARABLE");
assert.match(mixedMethod.incompatibilityReasons.join(" "), /Mais de um método analítico/i);

const differentMethod = compare(
  aggregate({ methods: ["Mehlich-1"] }),
  aggregate({ methods: ["Resina"] }),
);
assert.equal(differentMethod.comparable, false);
assert.match(differentMethod.incompatibilityReasons.join(" "), /Método analíticos diferentes/i);

const mixedDepth = compare(
  aggregate({ depths: [{ from: 0, to: 20 }, { from: 20, to: 40 }] }),
  aggregate({ depths: [{ from: 0, to: 20 }] }),
);
assert.equal(mixedDepth.comparable, false);
assert.match(mixedDepth.incompatibilityReasons.join(" "), /Mais de um intervalo de profundidade/i);

const overlappingButDifferentDepth = compare(
  aggregate({ depths: [{ from: 0, to: 20 }] }),
  aggregate({ depths: [{ from: 10, to: 30 }] }),
);
assert.equal(overlappingButDifferentDepth.comparable, false);
assert.equal(overlappingButDifferentDepth.absoluteDifference, null);
assert.match(overlappingButDifferentDepth.incompatibilityReasons.join(" "), /Profundidades diferentes/i);

const missingDepth = compare(
  aggregate({ depths: [] }),
  aggregate({ depths: [{ from: 0, to: 20 }] }),
);
assert.equal(missingDepth.comparable, false);
assert.match(missingDepth.incompatibilityReasons.join(" "), /Profundidade não registrada/i);

const mixedSampleType = compare(
  aggregate({ sampleTypes: ["SOIL", "TISSUE"] }),
  aggregate({ sampleTypes: ["SOIL"] }),
);
assert.equal(mixedSampleType.comparable, false);
assert.match(mixedSampleType.incompatibilityReasons.join(" "), /Mais de um tipo de amostra/i);

const differentUnits = compare(
  aggregate({ units: ["mg/dm³"] }),
  aggregate({ units: ["cmolc/dm³"] }),
);
assert.equal(differentUnits.comparable, false);
assert.match(differentUnits.incompatibilityReasons.join(" "), /Unidades diferentes/i);

const percent = compare(
  aggregate({ units: ["%"], avg: 40 }),
  aggregate({ units: ["%"], avg: 44 }),
);
assert.equal(percent.comparable, true);
assert.equal(percent.isPercentUnit, true);
assert.equal(percent.absoluteDifference, 4);

const missingSide = buildParameterComparisonRows(
  new Map([["P", aggregate()]]),
  new Map(),
  new Map(),
  new Map(),
)[0];
assert.equal(missingSide.comparable, false);
assert.match(missingSide.incompatibilityReasons.join(" "), /Sem resultado.*lado B/i);

const repositorySource = readFileSync("src/lib/repositories/comparisons.ts", "utf8");
assert.match(repositorySource, /buildParameterComparisonRows/);
assert.match(repositorySource, /lr\.numeric_value IS NOT NULL/);
assert.match(repositorySource, /array_agg\(DISTINCT jsonb_build_object/);
assert.doesNotMatch(repositorySource, /Profundidades sem sobreposição/);

console.log("comparison compatibility: ok");
