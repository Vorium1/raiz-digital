import assert from "node:assert/strict";
import {
  evaluatePersistedSpatialProvenance,
} from "../src/domain/spatial-provenance-audit.ts";

const good = {
  expectedPointCount: 8,
  expectedAreaHa: 4.32,
  areaTolerancePct: 5,
  boundary: { exists: true, valid: true, srid: 4326, areaHa: 4.289 },
  points: {
    count: 8,
    distinctCodeCount: 8,
    positionedCount: 8,
    srid4326Count: 8,
    acceptedGpsSourceCount: 8,
    spatiallyCoherentCount: 8,
    gpsSources: ["SHAPEFILE_REAL_GPS_LONLAT"],
  },
  audit: { auditedRealPointCount: 8, validBoundaryImportEvents: 1 },
};

const accepted = evaluatePersistedSpatialProvenance(good);
assert.equal(accepted.ready, true);
assert.deepEqual(accepted.blockers, []);
assert.ok(accepted.areaDifferencePct > 0 && accepted.areaDifferencePct < 1);

const legacyEstimated = evaluatePersistedSpatialProvenance({
  ...good,
  points: { ...good.points, acceptedGpsSourceCount: 0, gpsSources: ["ESTIMATED_FROM_FIELD_CENTER"] },
  audit: { auditedRealPointCount: 0, validBoundaryImportEvents: 1 },
});
assert.equal(legacyEstimated.ready, false);
assert.ok(legacyEstimated.blockers.includes("POINT_SOURCE_NOT_REAL_GPS"));
assert.ok(legacyEstimated.blockers.includes("POINT_IMPORT_AUDIT_INCOMPLETE"));

const missingPoint = evaluatePersistedSpatialProvenance({
  ...good,
  points: {
    ...good.points,
    count: 7,
    distinctCodeCount: 7,
    positionedCount: 7,
    srid4326Count: 7,
    acceptedGpsSourceCount: 7,
    spatiallyCoherentCount: 7,
  },
  audit: { auditedRealPointCount: 7, validBoundaryImportEvents: 1 },
});
assert.equal(missingPoint.ready, false);
assert.ok(missingPoint.blockers.includes("POINT_COUNT_MISMATCH"));
assert.ok(missingPoint.blockers.includes("POINT_CODES_NOT_UNIQUE"));
assert.ok(missingPoint.blockers.includes("POINT_POSITION_MISSING"));
assert.ok(missingPoint.blockers.includes("POINT_IMPORT_AUDIT_INCOMPLETE"));

const wrongBoundary = evaluatePersistedSpatialProvenance({
  ...good,
  boundary: { exists: true, valid: true, srid: 4326, areaHa: 3.5 },
});
assert.equal(wrongBoundary.ready, false);
assert.ok(wrongBoundary.blockers.includes("BOUNDARY_AREA_OUTSIDE_TOLERANCE"));

const missingAudit = evaluatePersistedSpatialProvenance({
  ...good,
  audit: { auditedRealPointCount: 8, validBoundaryImportEvents: 0 },
});
assert.equal(missingAudit.ready, false);
assert.ok(missingAudit.blockers.includes("BOUNDARY_IMPORT_AUDIT_MISSING"));

const wrongSrid = evaluatePersistedSpatialProvenance({
  ...good,
  boundary: { ...good.boundary, srid: 31982 },
  points: { ...good.points, srid4326Count: 0 },
});
assert.equal(wrongSrid.ready, false);
assert.ok(wrongSrid.blockers.includes("BOUNDARY_SRID_NOT_4326"));
assert.ok(wrongSrid.blockers.includes("POINT_SRID_NOT_4326"));

console.log("spatial-provenance-audit: GPS real, audit trail, área, SRID e coerência espacial validados");
