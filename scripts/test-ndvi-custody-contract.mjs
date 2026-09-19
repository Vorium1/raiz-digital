import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const audit = await readFile(new URL("./audit-ndvi-raster-custody.mjs", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/api/fields/[id]/ndvi/route.ts", import.meta.url), "utf8");

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

console.log("ndvi-custody-contract: inline Neon/S3, Earth Search, integridade e read-only aprovados");
