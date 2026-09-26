import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inferScreenState, parseAssistantScreenState } from "../src/lib/ai/assistant-screen.ts";
import { deriveContextLabel } from "../src/lib/ai/assistant-context-label.ts";

const POINT_ID = "9f8b6e2a-4c1d-4a7e-9b3a-2f6d8c1e5a90";
const ORDER_ID = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";

function params(input) {
  const map = new Map(Object.entries(input));
  return { get: (key) => map.get(key) ?? null };
}

assert.deepEqual(
  inferScreenState("/mapas", params({ ordem: ORDER_ID, ponto: POINT_ID, parametro: "P" })),
  {
    screen: "map",
    collectionOrderId: ORDER_ID,
    pointId: POINT_ID,
    parameter: "P",
    status: undefined,
    satellite: false,
  },
);

assert.deepEqual(
  parseAssistantScreenState({ screen: "map", collectionOrderId: ORDER_ID, pointId: POINT_ID, parameter: "P" }),
  {
    screen: "map",
    collectionOrderId: ORDER_ID,
    pointId: POINT_ID,
    parameter: "P",
    status: undefined,
    satellite: false,
  },
);

assert.equal(
  deriveContextLabel({
    found: true,
    kind: "map",
    evidence: {
      delegatedTo: "field",
      field: { field: { name: "Área 01" } },
      selectedPoint: { code: "P2" },
    },
    entityIds: { fieldId: "field", pointId: POINT_ID },
  }),
  "Mapa · Área 01 · Ponto P2",
);

const mapExplorer = readFileSync("src/components/agronomic-map-explorer.tsx", "utf8");
const mapTypes = readFileSync("src/components/spatial-map-types.ts", "utf8");
const leaflet = readFileSync("src/components/leaflet-field-map.tsx", "utf8");
const google = readFileSync("src/components/google-field-map.tsx", "utf8");
const mapbox = readFileSync("src/components/mapbox-field-map.tsx", "utf8");
const evidence = readFileSync("src/lib/ai/assistant-evidence.ts", "utf8");
const lightLabel = readFileSync("src/lib/ai/assistant-context-label-light.ts", "utf8");
const provider = readFileSync("src/lib/ai/providers/local-intent-assistant-provider.ts", "utf8");
const widget = readFileSync("src/components/assistant-raiz-widget.tsx", "utf8");

assert.match(mapExplorer, /searchParams\.get\("ponto"\)/);
assert.match(mapExplorer, /onPointSelect=\{\(point\) => updateUrl\(\{ ponto: point\?\.id \?\? "" \}\)\}/);
assert.match(mapTypes, /selectedPointId\?: string \| null/);
assert.match(mapTypes, /onPointSelect\?: \(point: MapPoint \| null\) => void/);
assert.match(leaflet, /onPointSelectRef\.current\?\.\(point\)/);
assert.match(google, /onPointSelectRef\.current\?\.\(point\)/);
assert.match(mapbox, /onPointSelectRef\.current\?\.\(point\)/);

assert.match(evidence, /sp\.collection_order_id = \$2::uuid/);
assert.match(evidence, /sp\.id = \$3::uuid/);
assert.match(evidence, /if \(s\.pointId && !selectedPoint\)/);
assert.match(evidence, /entityIds\.pointId = evidence\.selectedPoint\.id/);
assert.match(evidence, /AUDITED_POINT_SOURCES/);
assert.match(evidence, /positionKind: "OBSERVED" \| "AUDITED_SOURCE" \| "PLANNED"/);

assert.match(lightLabel, /sp\.collection_order_id = co\.id/);
assert.match(lightLabel, /sp\.id = \$3::uuid/);
assert.match(lightLabel, /return row \? .*Ponto/);
assert.match(provider, /Nenhum ponto válido está selecionado no mapa/);
assert.match(provider, /Este ponto não tem GPS observado nem fonte espacial real auditada/);
assert.match(widget, /"Explique este ponto\."/);
assert.match(widget, /contextValid/);

console.log("assistant exact point context: ok");
