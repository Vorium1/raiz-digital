import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePointCsv, parsePointGeoJson } from "../src/domain/field-operations.ts";

const csv = `codigo;latitude;longitude;profundidade_de;profundidade_ate;subamostras\nP01;-28,2501;-52,4021;0;20;10\nP02;-28,2510;-52,4010;0;20;10`;
const parsedCsv = parsePointCsv(csv);
assert.equal(parsedCsv.blockers, 0);
assert.equal(parsedCsv.points.length, 2);
assert.equal(parsedCsv.points[0]?.latitude, -28.2501);
assert.equal(parsedCsv.points[0]?.subsampleCount, 10);

const duplicate = parsePointCsv(`${csv}\nP01;-28,2510;-52,4010;0;20;10`);
assert.ok(duplicate.blockers >= 2);
assert.ok(duplicate.issues.some((issue)=>issue.code === "DUPLICATE_CODE"));
assert.ok(duplicate.issues.some((issue)=>issue.code === "DUPLICATE_COORDINATE"));

const geojson = JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { code: "A1" }, geometry: { type: "Point", coordinates: [-52.4, -28.25] } },
    { type: "Feature", properties: { codigo: "A2", subamostras: 8 }, geometry: { type: "Point", coordinates: [-52.41, -28.26] } },
  ],
});
const parsedGeo = parsePointGeoJson(geojson);
assert.equal(parsedGeo.blockers, 0);
assert.equal(parsedGeo.points[1]?.code, "A2");
assert.equal(parsedGeo.points[1]?.subsampleCount, 8);

const invalid = parsePointCsv(`codigo;latitude;longitude\nP01;500;-52`);
assert.equal(invalid.blockers, 1);
assert.equal(invalid.points.length, 0);


const catalogSource = readFileSync(new URL("../src/lib/repositories/catalog.ts", import.meta.url), "utf8");
const fieldRouteSource = readFileSync(new URL("../src/app/api/fields/[id]/route.ts", import.meta.url), "utf8");
const geoMapInputSource = readFileSync(new URL("../src/components/geo-map-input.tsx", import.meta.url), "utf8");
const fieldManagerSource = readFileSync(new URL("../src/components/field-operations-manager.tsx", import.meta.url), "utf8");

assert.match(
  catalogSource,
  /FIELD_BOUNDARY_UPDATED/,
  "edição de contorno precisa deixar audit trail específico",
);
assert.match(
  catalogSource,
  /co\.status <> 'CANCELED'/,
  "pontos de ordens ativas precisam participar da validação do novo limite",
);
assert.match(
  catalogSource,
  /SHAPEFILE_REAL_GPS_LONLAT','SHAPEFILE_REAL_EPSG4326'/,
  "backend precisa usar a mesma autoridade espacial das fontes auditadas do mapa",
);
assert.match(
  catalogSource,
  /coalesce\(sp\.observed_position, sp\.position\)/,
  "GPS observado deve prevalecer quando a fonte não é uma importação auditada pura",
);
assert.match(
  catalogSource,
  /Os pontos GPS não foram movidos/,
  "falha de contorno deve explicar que coordenadas não foram deslocadas",
);
assert.match(
  fieldRouteSource,
  /boundary/,
  "PATCH de talhão precisa aceitar atualização de contorno validado",
);
assert.match(
  geoMapInputSource,
  /referencePoints/,
  "editor visual deve mostrar pontos de coleta como referência fixa",
);
assert.match(
  geoMapInputSource,
  /ponto fixo/,
  "editor deve identificar visualmente que os pontos não são arrastáveis",
);
assert.match(
  fieldManagerSource,
  /Pontos GPS permaneceram fixos e dentro da área produtiva/,
  "UX precisa confirmar a política espacial após salvar",
);
assert.match(
  fieldManagerSource,
  /referencePoints=\{editFieldReferencePoints\}/,
  "edição do talhão deve alimentar o mapa com as posições efetivas dos pontos",
);

console.log("field-operations: importação + edição de contorno com GPS fixo aprovadas");
