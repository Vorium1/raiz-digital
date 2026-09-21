import assert from "node:assert/strict";
import {
  assessInmetStationApplicability,
  previousCompleteUtcDate,
} from "../src/domain/inmet-station-applicability.ts";

const fieldRegions=[
  {code:"BR",specificityScore:100},
  {code:"BR-RS",specificityScore:200},
  {code:"RS-PLANALTO-MEDIO",specificityScore:400},
];

const sameSpecificRegion=assessInmetStationApplicability({
  fieldRegions,
  stationRegions:[
    {code:"BR",specificityScore:100},
    {code:"BR-RS",specificityScore:200},
    {code:"RS-PLANALTO-MEDIO",specificityScore:400},
  ],
  distanceKm:4.2,
});
assert.equal(sameSpecificRegion.applicable,true);
assert.equal(sameSpecificRegion.status,"APPLICABLE_REGIONAL_OBSERVATION");
assert.deepEqual(sameSpecificRegion.sharedTechnicalRegionCodes,["RS-PLANALTO-MEDIO"]);
assert.equal(sameSpecificRegion.fieldRequiredSpecificityScore,400);
assert.equal(sameSpecificRegion.matchedSpecificityScore,400);
assert.ok(sameSpecificRegion.warnings.includes("INMET_DISTANCE_RECORDED_WITHOUT_HOMOLOGATED_MAX_DISTANCE_POLICY"));

const broadOnly=assessInmetStationApplicability({
  fieldRegions,
  stationRegions:[
    {code:"BR",specificityScore:100},
    {code:"BR-RS",specificityScore:200},
    {code:"RS-CAMPANHA",specificityScore:400},
  ],
  distanceKm:80,
});
assert.equal(broadOnly.applicable,false);
assert.equal(broadOnly.status,"FIELD_SPECIFIC_REGION_NOT_SHARED");
assert.equal(broadOnly.matchedSpecificityScore,200);
assert.ok(broadOnly.warnings.includes("BROAD_REGION_MATCH_REJECTED_WHEN_FIELD_HAS_MORE_SPECIFIC_REGION"));

const onlyStateField=assessInmetStationApplicability({
  fieldRegions:[{code:"BR",specificityScore:100},{code:"BR-RS",specificityScore:200}],
  stationRegions:[{code:"BR",specificityScore:100},{code:"BR-RS",specificityScore:200}],
  distanceKm:40,
});
assert.equal(onlyStateField.applicable,true);
assert.equal(onlyStateField.matchedSpecificityScore,200);

const distancePolicy=assessInmetStationApplicability({
  fieldRegions:[{code:"RS-PLANALTO-MEDIO",specificityScore:400}],
  stationRegions:[{code:"RS-PLANALTO-MEDIO",specificityScore:400}],
  distanceKm:42,
  maxDistanceKm:30,
});
assert.equal(distancePolicy.applicable,false);
assert.equal(distancePolicy.status,"DISTANCE_POLICY_EXCEEDED");

const distanceOkay=assessInmetStationApplicability({
  fieldRegions:[{code:"RS-PLANALTO-MEDIO",specificityScore:400}],
  stationRegions:[{code:"RS-PLANALTO-MEDIO",specificityScore:400}],
  distanceKm:29.9,
  maxDistanceKm:30,
});
assert.equal(distanceOkay.applicable,true);
assert.deepEqual(distanceOkay.warnings,[]);

assert.equal(
  assessInmetStationApplicability({
    fieldRegions:[],
    stationRegions:[{code:"BR-RS",specificityScore:200}],
    distanceKm:3,
  }).status,
  "FIELD_TECHNICAL_REGION_UNRESOLVED",
);

assert.equal(
  assessInmetStationApplicability({
    fieldRegions:[{code:"BR-RS",specificityScore:200}],
    stationRegions:[],
    distanceKm:3,
  }).status,
  "STATION_TECHNICAL_REGION_UNRESOLVED",
);

assert.equal(
  assessInmetStationApplicability({
    fieldRegions:[{code:"BR-RS",specificityScore:200}],
    stationRegions:[{code:"BR-SC",specificityScore:200}],
    distanceKm:3,
  }).status,
  "TECHNICAL_REGION_MISMATCH",
);

assert.equal(previousCompleteUtcDate(new Date("2026-09-21T00:15:00Z")),"2026-09-20");
assert.equal(previousCompleteUtcDate(new Date("2026-01-01T12:00:00Z")),"2025-12-31");
assert.throws(()=>previousCompleteUtcDate(new Date("invalid")),/INMET_REFERENCE_TIME_INVALID/);
assert.throws(
  ()=>assessInmetStationApplicability({
    fieldRegions:[{code:"BR-RS",specificityScore:200}],
    stationRegions:[{code:"BR-RS",specificityScore:200}],
    distanceKm:-1,
  }),
  /INMET_STATION_DISTANCE_INVALID/,
);

console.log("inmet-station-applicability: região específica, distância e dia UTC completo validados");
