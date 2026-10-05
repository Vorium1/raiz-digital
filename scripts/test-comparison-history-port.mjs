import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildParameterComparisonRows } from "../src/domain/comparison-compatibility.ts";

function aggregate(overrides = {}) {
  return {
    parameterCode: "P",
    n: 2,
    avg: 10,
    units: ["mg/dm³"],
    methods: ["Mehlich-1"],
    sampleTypes: ["SOIL"],
    depths: [{ from: 0, to: 20 }],
    ...overrides,
  };
}
function row(a, b) {
  return buildParameterComparisonRows(
    new Map([["P", a]]),
    new Map([["P", b]]),
    new Map(),
    new Map(),
  )[0];
}

assert.equal(row(aggregate({ avg: 10 }), aggregate({ avg: 12 })).absoluteDifference, 2);
assert.equal(row(aggregate({ depths: [{ from: 0, to: 20 }] }), aggregate({ depths: [{ from: 10, to: 30 }] })).comparable, false);
assert.equal(row(aggregate({ methods: ["Mehlich-1", "Resina"] }), aggregate()).comparable, false);

const page = readFileSync("src/app/(platform)/historico/page.tsx", "utf8");
const route = readFileSync("src/app/api/comparisons/route.ts", "utf8");
const historyRoute = readFileSync("src/app/api/comparisons/history/route.ts", "utf8");
const repo = readFileSync("src/lib/repositories/comparisons.ts", "utf8");

assert.match(page, /HistoricalComparisonExplorer/);
assert.match(route, /mode === "history"/);
assert.match(historyRoute, /getPlatformSession/);
assert.match(repo, /Evolução temporal só compara análises do mesmo talhão/);
assert.match(repo, /Selecione duas coletas distintas/);
assert.match(repo, /exactPointLayoutMatch/);
assert.match(repo, /tenant_id = \$1::uuid/);

console.log("comparison history port: ok");
