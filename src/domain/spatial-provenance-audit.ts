export type PersistedSpatialProvenanceEvidence = {
  expectedPointCount: number;
  expectedAreaHa: number;
  areaTolerancePct: number;
  boundary: {
    exists: boolean;
    valid: boolean;
    srid: number | null;
    areaHa: number | null;
  };
  points: {
    count: number;
    distinctCodeCount: number;
    positionedCount: number;
    srid4326Count: number;
    acceptedGpsSourceCount: number;
    spatiallyCoherentCount: number;
    gpsSources: string[];
  };
  audit: {
    auditedRealPointCount: number;
    validBoundaryImportEvents: number;
  };
};

export type PersistedSpatialProvenanceBlocker =
  | "BOUNDARY_MISSING"
  | "BOUNDARY_INVALID"
  | "BOUNDARY_SRID_NOT_4326"
  | "BOUNDARY_AREA_UNAVAILABLE"
  | "BOUNDARY_AREA_OUTSIDE_TOLERANCE"
  | "POINT_COUNT_MISMATCH"
  | "POINT_CODES_NOT_UNIQUE"
  | "POINT_POSITION_MISSING"
  | "POINT_SRID_NOT_4326"
  | "POINT_SOURCE_NOT_REAL_GPS"
  | "POINT_OUTSIDE_REAL_BOUNDARY"
  | "POINT_IMPORT_AUDIT_INCOMPLETE"
  | "BOUNDARY_IMPORT_AUDIT_MISSING";

export type PersistedSpatialProvenanceAudit = {
  ready: boolean;
  blockers: PersistedSpatialProvenanceBlocker[];
  areaDifferencePct: number | null;
  acceptedGpsSources: string[];
};

export const ACCEPTED_REAL_GPS_SOURCES = Object.freeze([
  "SHAPEFILE_REAL_GPS_LONLAT",
  "SHAPEFILE_REAL_EPSG4326",
]);

/**
 * Avalia apenas se a geometria REAL já persistida possui proveniência suficiente para ser tratada como
 * evidência espacial confiável pela RAIZ. Não gera taxa variável, não escolhe método de interpolação e
 * não substitui o gate espacial completo; ele apenas impede que posição estimada/legada seja confundida
 * com GPS real.
 */
export function evaluatePersistedSpatialProvenance(
  evidence: PersistedSpatialProvenanceEvidence,
): PersistedSpatialProvenanceAudit {
  const blockers: PersistedSpatialProvenanceBlocker[] = [];
  const expected = evidence.expectedPointCount;

  if (!evidence.boundary.exists) blockers.push("BOUNDARY_MISSING");
  if (evidence.boundary.exists && !evidence.boundary.valid) blockers.push("BOUNDARY_INVALID");
  if (evidence.boundary.exists && evidence.boundary.srid !== 4326) blockers.push("BOUNDARY_SRID_NOT_4326");

  let areaDifferencePct: number | null = null;
  if (evidence.boundary.areaHa == null || !Number.isFinite(evidence.boundary.areaHa)) {
    blockers.push("BOUNDARY_AREA_UNAVAILABLE");
  } else if (!Number.isFinite(evidence.expectedAreaHa) || evidence.expectedAreaHa <= 0) {
    blockers.push("BOUNDARY_AREA_UNAVAILABLE");
  } else {
    areaDifferencePct = Math.abs(evidence.boundary.areaHa - evidence.expectedAreaHa) / evidence.expectedAreaHa * 100;
    if (areaDifferencePct > evidence.areaTolerancePct) blockers.push("BOUNDARY_AREA_OUTSIDE_TOLERANCE");
  }

  if (evidence.points.count !== expected) blockers.push("POINT_COUNT_MISMATCH");
  if (evidence.points.distinctCodeCount !== expected) blockers.push("POINT_CODES_NOT_UNIQUE");
  if (evidence.points.positionedCount !== expected) blockers.push("POINT_POSITION_MISSING");
  if (evidence.points.srid4326Count !== expected) blockers.push("POINT_SRID_NOT_4326");
  if (evidence.points.acceptedGpsSourceCount !== expected) blockers.push("POINT_SOURCE_NOT_REAL_GPS");
  if (evidence.points.spatiallyCoherentCount !== expected) blockers.push("POINT_OUTSIDE_REAL_BOUNDARY");
  if (evidence.audit.auditedRealPointCount < expected) blockers.push("POINT_IMPORT_AUDIT_INCOMPLETE");
  if (evidence.audit.validBoundaryImportEvents < 1) blockers.push("BOUNDARY_IMPORT_AUDIT_MISSING");

  return {
    ready: blockers.length === 0,
    blockers,
    areaDifferencePct,
    acceptedGpsSources: [...ACCEPTED_REAL_GPS_SOURCES],
  };
}
