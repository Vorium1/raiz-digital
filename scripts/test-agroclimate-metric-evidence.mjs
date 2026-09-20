import assert from "node:assert/strict";
import { resolveAgroclimateMetricEvidence } from "../src/domain/agroclimate-metric-evidence.ts";

const base = {
  issuedAt: "2026-09-20T12:00:00-03:00",
  validFrom: "2026-09-20T00:00:00-03:00",
  validUntil: "2026-09-21T23:59:59-03:00",
  technicalRegionCodes: ["BR-RS", "RS-PLANALTO-MEDIO"],
  latitude: -28.26,
  longitude: -52.41,
};

const resolved = resolveAgroclimateMetricEvidence({
  targetDateTime: "2026-09-20T15:00:00-03:00",
  technicalRegionCodes: ["BR-RS", "RS-PLANALTO-MEDIO"],
  requiredMetrics: ["NIGHT_MEAN_TEMP_C", "SUNSHINE_HOURS"],
  evidence: [
    {
      ...base,
      metric: "NIGHT_MEAN_TEMP_C",
      value: 24.8,
      evidenceKind: "FORECAST_MODEL",
      source: "CPTEC_INPE",
      sourceRecordId: "cptec-night-1",
      spatialResolutionKm: 10,
    },
    {
      ...base,
      metric: "SUNSHINE_HOURS",
      value: 5.5,
      evidenceKind: "OBSERVED_STATION",
      source: "INMET",
      sourceRecordId: "inmet-sun-1",
    },
  ],
});
assert.equal(resolved.blockers.length, 0);
assert.equal(resolved.snapshot.NIGHT_MEAN_TEMP_C, 24.8);
assert.equal(resolved.snapshot.SUNSHINE_HOURS, 5.5);
assert.equal(resolved.provenance.NIGHT_MEAN_TEMP_C?.source, "CPTEC_INPE");

const conflict = resolveAgroclimateMetricEvidence({
  targetDateTime: "2026-09-20T15:00:00-03:00",
  technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  requiredMetrics: ["NIGHT_MEAN_TEMP_C"],
  evidence: [
    {
      ...base,
      metric: "NIGHT_MEAN_TEMP_C",
      value: 24.8,
      evidenceKind: "FORECAST_MODEL",
      source: "CPTEC_INPE",
      sourceRecordId: "cptec-night-1",
    },
    {
      ...base,
      metric: "NIGHT_MEAN_TEMP_C",
      value: 22.9,
      evidenceKind: "FORECAST_MODEL",
      source: "INMET",
      sourceRecordId: "inmet-night-1",
    },
  ],
});
assert.equal(conflict.snapshot.NIGHT_MEAN_TEMP_C, undefined);
assert.equal(conflict.blockers[0]?.code, "AMBIGUOUS_METRIC_EVIDENCE");
assert.equal(conflict.rejected.filter((item) => item.reason === "CONFLICTING_APPLICABLE_VALUE").length, 2);

const derived = resolveAgroclimateMetricEvidence({
  targetDateTime: "2026-09-20T15:00:00-03:00",
  technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
  evidence: [{
    ...base,
    metric: "DIURNAL_TEMP_RANGE_C",
    value: 14,
    evidenceKind: "DERIVED",
    source: "OTHER_OFFICIAL",
    sourceRecordId: "derived-amplitude-1",
    derivationRuleId: "DAY_MAX_MINUS_NIGHT_MIN-V1",
  }],
});
assert.equal(derived.snapshot.DIURNAL_TEMP_RANGE_C, 14);
assert.equal(derived.provenance.DIURNAL_TEMP_RANGE_C?.derivationRuleId, "DAY_MAX_MINUS_NIGHT_MIN-V1");

assert.throws(
  () => resolveAgroclimateMetricEvidence({
    targetDateTime: "2026-09-20T15:00:00-03:00",
    technicalRegionCodes: ["RS-PLANALTO-MEDIO"],
    evidence: [{
      ...base,
      metric: "DIURNAL_TEMP_RANGE_C",
      value: 14,
      evidenceKind: "DERIVED",
      source: "OTHER_OFFICIAL",
      sourceRecordId: "derived-invalid",
    }],
  }),
  /derivationRuleId/,
);

const outsideRegion = resolveAgroclimateMetricEvidence({
  targetDateTime: "2026-09-20T15:00:00-03:00",
  technicalRegionCodes: ["BR-SC"],
  requiredMetrics: ["NIGHT_MEAN_TEMP_C"],
  evidence: [{
    ...base,
    metric: "NIGHT_MEAN_TEMP_C",
    value: 24.8,
    evidenceKind: "FORECAST_MODEL",
    source: "CPTEC_INPE",
    sourceRecordId: "cptec-rs-only",
  }],
});
assert.equal(outsideRegion.blockers[0]?.code, "NO_APPLICABLE_EVIDENCE");
assert.ok(outsideRegion.rejected.some((item) => item.reason === "OUTSIDE_TECHNICAL_REGION"));

console.log("agroclimate-metric-evidence: geografia, validade, derivação e conflito validados");
