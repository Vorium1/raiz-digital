import assert from "node:assert/strict";
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

console.log("field-operations: 4 cenários aprovados");
