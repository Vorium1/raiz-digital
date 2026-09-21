import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ndviRasterBboxContainsBoundary } from "../src/domain/ndvi-raster-spatial-validity.ts";

const audit = await readFile(new URL("./audit-ndvi-raster-custody.mjs", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/api/fields/[id]/ndvi/route.ts", import.meta.url), "utf8");
const mapRoute = await readFile(new URL("../src/app/api/fields/[id]/ndvi/map/route.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../src/lib/repositories/ndvi.ts", import.meta.url), "utf8");

assert.match(audit, /EARTH_SEARCH_NDVI_MOSAICKING_ORDER/);
assert.doesNotMatch(audit, /COPERNICUS_NDVI_MOSAICKING_ORDER/);
assert.match(audit, /key\.startsWith\("inline-ndvi:v1:"\)/);
assert.match(audit, /key\.startsWith\("s3:v1:"\)/);
assert.match(audit, /RASTER_STORAGE_NOT_DURABLE/);
assert.doesNotMatch(audit, /provider !== "s3"/);
assert.doesNotMatch(audit, /A prova de homologação exige STORAGE_PROVIDER=s3/);
assert.match(audit, /BEGIN TRANSACTION READ ONLY/);
assert.match(audit, /ROLLBACK/);
assert.match(audit, /readNdviRasterArtifact/);
assert.match(audit, /pngSignatureVerified: true/);
assert.match(audit, /databaseImmutabilityVerified: true/);
assert.match(audit, /runtimeDeletePrivilegeRevoked: true/);
assert.doesNotMatch(audit, /rasterObjectKey[^\n]*console/);

assert.match(route, /getSatelliteNdviReadiness\(process\.env\)/);
assert.doesNotMatch(route, /\(process\.env\.NDVI_SATELLITE_PROVIDER \?\? "earth-search"\)\.trim\(\)\.toLowerCase\(\)/);
assert.match(route, /const satelliteConfigured = satelliteReadiness\.ready/);
assert.match(route, /rasterMatchesCurrentBoundary/);
assert.match(route, /replaceExistingRasterSha256/);
assert.match(mapRoute, /NDVI_RASTER_BOUNDARY_MISMATCH/);
assert.match(repository, /replaceExistingRasterSha256/);

const currentBoundary = {
  coordinates: [[[
    [-52.1251, -28.2447],
    [-52.1215, -28.2447],
    [-52.1215, -28.2430],
    [-52.1251, -28.2430],
    [-52.1251, -28.2447],
  ]]],
};
assert.equal(ndviRasterBboxContainsBoundary([-52.126, -28.245, -52.121, -28.242], currentBoundary), true);
assert.equal(ndviRasterBboxContainsBoundary([-51.906, -28.176, -51.902, -28.174], currentBoundary), false);
assert.equal(ndviRasterBboxContainsBoundary(null, currentBoundary), false);

console.log("ndvi-custody-contract: inline Neon/S3, Earth Search, integridade espacial e read-only aprovados");
