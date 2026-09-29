import assert from "node:assert/strict";
import { collectOfficialAgroclimateEnrichment } from "../src/lib/agroclimate/official-enrichment.ts";
import { buildReportAgroclimateSnapshot } from "../src/domain/report-agroclimate-snapshot.ts";

const metricEvidence=[{
  metric:"DAY_MAX_TEMP_C",
  value:27,
  evidenceKind:"FORECAST_MODEL",
  source:"CPTEC_INPE",
  sourceRecordId:"cptec:test",
  issuedAt:"2026-09-20T23:00:00Z",
  validFrom:"2026-09-21T00:00:00-03:00",
  validUntil:"2026-09-21T23:59:59-03:00",
  technicalRegionCodes:["BR-RS"],
}];

const zarcResource={
  datasetId:"6d3d141c-885e-41a4-ab7f-dc8ff323b96f",
  resourceId:"resource-2026",
  name:"Tábua de risco - Safra 2026/2027",
  seasonStartYear:2026,
  seasonEndYear:2027,
  format:"CSV",
  state:"active",
  downloadUrl:"https://dados.agricultura.gov.br/zarc.csv",
  lastModified:"2026-09-19T08:00:00Z",
  revisionId:"rev-1",
  urlType:"upload",
  catalogMetadataModified:"2026-09-19T10:00:00Z",
};

const ready=await collectOfficialAgroclimateEnrichment({
  latitude:-28.26,
  longitude:-52.41,
  utcOffset:"-03:00",
  technicalRegionCodes:["br-rs","BR-RS"],
  zarcSeason:{startYear:2026,endYear:2027},
  sourceTimeoutMs:2500,
  cptecFetcher:async(input)=>{
    assert.equal(input.timeoutMs,2500);
    assert.deepEqual(input.technicalRegionCodes,["BR-RS"]);
    return {
      evidence:metricEvidence,
      dailyContext:[{date:"2026-09-21",weatherCode:"pn",uvIndex:7}],
      sourceUpdatedOn:"2026-09-20",
      warnings:["CPTEC_IUV_IS_UV_INDEX_NOT_GLOBAL_SOLAR_RADIATION"],
      provider:"CPTEC_INPE",
      sourceUrl:"https://servicos.cptec.inpe.br/XML/test.xml",
      retrievedAt:"2026-09-20T23:00:00Z",
    };
  },
  zarcFetcher:async(input)=>{
    assert.equal(input.timeoutMs,2500);
    return zarcResource;
  },
});
assert.equal(ready.status,"READY");
assert.equal(ready.cptec.status,"READY");
assert.equal(ready.cptec.forecastScope,"SHORT_RANGE_7_DAY");
assert.equal(ready.zarc.status,"READY");
assert.equal(ready.zarc.role,"PLANTING_RISK_ZONING");
assert.equal(ready.metricEvidence.length,1);
assert.equal(ready.zarc.resource?.resourceId,"resource-2026");
assert.ok(ready.warnings.includes("CPTEC_IUV_IS_UV_INDEX_NOT_GLOBAL_SOLAR_RADIATION"));

const partial=await collectOfficialAgroclimateEnrichment({
  latitude:-28.26,
  longitude:-52.41,
  utcOffset:"-03:00",
  technicalRegionCodes:["BR-RS"],
  zarcSeason:{startYear:2026,endYear:2027},
  cptecFetcher:async()=>{throw new Error("CPTEC_HTTP_503");},
  zarcFetcher:async()=>zarcResource,
});
assert.equal(partial.status,"PARTIAL");
assert.equal(partial.cptec.status,"UNAVAILABLE");
assert.equal(partial.cptec.errorCode,"CPTEC_HTTP_503");
assert.equal(partial.zarc.status,"READY");
assert.equal(partial.metricEvidence.length,0);
assert.ok(partial.warnings.includes("CPTEC_OPTIONAL_ENRICHMENT_UNAVAILABLE"));

const networkDown=await collectOfficialAgroclimateEnrichment({
  latitude:-28.26,
  longitude:-52.41,
  utcOffset:"-03:00",
  technicalRegionCodes:["BR-RS"],
  cptecFetcher:async()=>{throw new Error("OFFICIAL_SOURCE_TIMEOUT");},
});
assert.equal(networkDown.status,"UNAVAILABLE");
assert.equal(networkDown.cptec.status,"UNAVAILABLE");
assert.equal(networkDown.cptec.errorCode,"OFFICIAL_SOURCE_TIMEOUT");

const withoutCoordinates=await collectOfficialAgroclimateEnrichment({
  zarcSeason:{startYear:2026,endYear:2027},
  zarcFetcher:async()=>zarcResource,
});
assert.equal(withoutCoordinates.status,"READY");
assert.equal(withoutCoordinates.cptec.status,"SKIPPED");
assert.equal(withoutCoordinates.zarc.status,"READY");

const nothingAvailable=await collectOfficialAgroclimateEnrichment({});
assert.equal(nothingAvailable.status,"UNAVAILABLE");
assert.equal(nothingAvailable.cptec.status,"SKIPPED");
assert.equal(nothingAvailable.zarc.status,"SKIPPED");
assert.ok(nothingAvailable.warnings.includes("NO_OFFICIAL_AGROCLIMATE_SOURCE_REQUESTED_OR_LOCATION_NOT_AVAILABLE"));

const missingTimezone=await collectOfficialAgroclimateEnrichment({
  latitude:-28.26,
  longitude:-52.41,
  technicalRegionCodes:["BR-RS"],
});
assert.equal(missingTimezone.status,"UNAVAILABLE");
assert.equal(missingTimezone.cptec.errorCode,"CPTEC_UTC_OFFSET_REQUIRED");

const missingRegion=await collectOfficialAgroclimateEnrichment({
  latitude:-28.26,
  longitude:-52.41,
  utcOffset:"-03:00",
});
assert.equal(missingRegion.status,"UNAVAILABLE");
assert.equal(missingRegion.cptec.errorCode,"CPTEC_TECHNICAL_REGION_REQUIRED");

await assert.rejects(
  collectOfficialAgroclimateEnrichment({latitude:-28.26}),
  /AGROCLIMATE_COORDINATES_INCOMPLETE/,
);
await assert.rejects(
  collectOfficialAgroclimateEnrichment({latitude:91,longitude:-52}),
  /AGROCLIMATE_LATITUDE_INVALID/,
);


const frozen=buildReportAgroclimateSnapshot({
  collectedAt:"2026-09-29T01:00:00Z",
  analysisId:"analysis-1",
  location:{
    state:"RS",
    municipality:"Passo Fundo",
    latitude:-28.26,
    longitude:-52.41,
    coordinateSource:"FIELD_BOUNDARY",
    timeZone:"America/Sao_Paulo",
    utcOffset:"-03:00",
  },
  season:{label:"2026/2027",zarcSeason:{startYear:2026,endYear:2027}},
  technicalRegionCodes:["BR-RS"],
  enrichment:{
    ...ready,
    metricEvidence:[
      metricEvidence[0],
      {...metricEvidence[0],value:31,sourceRecordId:"cptec:test:2",validFrom:"2026-09-22T00:00:00-03:00",validUntil:"2026-09-22T23:59:59-03:00"},
    ],
  },
  inmetObservation:{
    status:"READY",
    observedDateUtc:"2026-09-28",
    station:{code:"A001",name:"Passo Fundo",stateCode:"RS",distanceKm:12.4,sourceUrl:"https://portal.inmet.gov.br/"},
    metricEvidence:[{
      metric:"PRECIPITATION_MM",
      value:18.2,
      evidenceKind:"OBSERVED_STATION",
      source:"INMET",
      sourceRecordId:"inmet:a001:2026-09-28",
      issuedAt:"2026-09-29T00:00:00Z",
      validFrom:"2026-09-28T00:00:00Z",
      validUntil:"2026-09-28T23:59:59Z",
      technicalRegionCodes:["BR-RS"],
    }],
    warnings:[],
  },
  warnings:[],
});
assert.equal(frozen.status,"READY");
assert.equal(frozen.forecast.summaries[0].label,"Temperatura máxima");
assert.equal(frozen.forecast.summaries[0].min,27);
assert.equal(frozen.forecast.summaries[0].max,31);
assert.equal(frozen.forecast.summaries[0].sampleCount,2);
assert.equal(frozen.observed.summaries[0].label,"Precipitação");
assert.equal(frozen.observed.summaries[0].value,undefined);
assert.equal(frozen.observed.summaries[0].min,18.2);
assert.equal(frozen.automaticDoseAdjustmentAllowed,false);

console.log("official-enrichment: clima oficial é opcional, rastreável e não bloqueia o laudo-base");
