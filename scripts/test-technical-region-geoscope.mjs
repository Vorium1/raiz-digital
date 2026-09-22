import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("db/migrations/040_technical_region_geoscope.sql", "utf8");
const repo = readFileSync("src/lib/repositories/agronomic-profiles.ts", "utf8");
const route = readFileSync("src/app/api/technical-regions/resolve/route.ts", "utf8");

assert.match(migration, /geometry\(MultiPolygon, 4326\)/);
assert.match(migration, /USING gist \(boundary\)/);
assert.match(migration, /BR-RS/);
assert.match(migration, /BR-SC/);
assert.match(migration, /BR-PR/);

assert.match(repo, /ST_Covers\(tr\.boundary, l\.point\)/);
assert.match(repo, /specificityScore/);
assert.match(repo, /WHEN tr\.boundary IS NOT NULL THEN 400/);
assert.match(repo, /cardinality\(tr\.municipality_codes\) > 0 THEN 300/);
assert.match(repo, /cardinality\(tr\.state_codes\) > 0 THEN 200/);
assert.match(repo, /ELSE 100/);

// Um polígono cadastrado não pode cair silenciosamente para município/UF.
assert.match(repo, /tr\.boundary IS NULL[\s\S]*cardinality\(tr\.municipality_codes\) > 0/);
assert.match(repo, /tr\.boundary IS NULL[\s\S]*cardinality\(tr\.state_codes\) > 0/);

assert.match(route, /resolveTechnicalRegionsForLocation/);
assert.match(route, /Latitude e longitude devem ser informadas juntas/);

console.log("technical-region-geoscope: PostGIS, precedência espacial e escopos-base validados");
