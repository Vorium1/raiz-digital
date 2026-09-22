import assert from "node:assert/strict";
import { collectInmetRegionalObservation } from "../src/lib/agroclimate/inmet-regional-observation.ts";

const station={
  stationCode:"A839",name:"PASSO FUNDO",stateCode:"RS",latitude:-28.2268,longitude:-52.4036,
  altitudeM:684,entity:"INMET",stationType:"AUTOMATICA",status:"OPERANTE",
  operationStartedAt:null,operationEndedAt:null,
};

const nearestFetcher=async()=>({
  station,
  distanceKm:4.1,
  selectionRule:"NEAREST_OPERATIVE_INMET_AUTOMATIC_STATION",
  provider:"INMET",
  sourceUrl:"https://apitempo.inmet.gov.br/estacoes/T",
});

const observations=Array.from({length:72},(_,index)=>({
  stationCode:"A839",
  observedAtUtc:new Date(Date.UTC(2026,8,18,0,0,0)+index*3_600_000).toISOString(),
  temperatureC:10+(index%24),
  precipitationMm:index<50?0.4:index===60?3:0,
  windGustMps:4,
  globalRadiationKjM2:1000,
}));

let observationFetchInput=null;
const observationFetcher=async(input)=>{
  observationFetchInput=input;
  return {
    provider:"INMET",
    sourceUrl:"https://apitempo.inmet.gov.br/estacao/2026-09-18/2026-09-20/A839",
    retrievedAt:"2026-09-21T00:15:00.000Z",
    stationCode:"A839",
    observations,
    warnings:["INMET_AUTOMATIC_STATION_DATA_RAW_NOT_QUALITY_CONTROLLED_BY_RAIZ"],
  };
};

const ready=await collectInmetRegionalObservation({
  fieldLatitude:-28.26,
  fieldLongitude:-52.41,
  fieldRegions:[
    {code:"BR-RS",specificityScore:200},
    {code:"RS-PLANALTO-MEDIO",specificityScore:400},
  ],
  resolveStationRegions:async()=>[
    {code:"BR-RS",specificityScore:200},
    {code:"RS-PLANALTO-MEDIO",specificityScore:400},
  ],
  nearestFetcher,
  observationFetcher,
  now:()=>new Date("2026-09-21T00:15:00Z"),
});
assert.equal(ready.status,"READY");
assert.equal(ready.role,"REGIONAL_OBSERVED_STATION");
assert.equal(ready.observedDateUtc,"2026-09-20");
assert.equal(ready.observationWindowFromUtc,"2026-09-18");
assert.equal(ready.observationWindowToUtc,"2026-09-20");
assert.equal(observationFetchInput?.dateFrom,"2026-09-18");
assert.equal(observationFetchInput?.dateTo,"2026-09-20");
assert.equal(ready.station?.code,"A839");
assert.equal(ready.applicability?.applicable,true);
assert.deepEqual(ready.applicability?.sharedTechnicalRegionCodes,["RS-PLANALTO-MEDIO"]);
assert.ok(ready.metricEvidence.some(item=>item.metric==="PRECIPITATION_MM" && Math.abs(item.value-3.8)<1e-9));
assert.ok(ready.metricEvidence.some(item=>item.metric==="CONTINUOUS_RAIN_HOURS" && item.value===50));
assert.ok(ready.warnings.includes("INMET_AUTOMATIC_STATION_DATA_RAW_NOT_QUALITY_CONTROLLED_BY_RAIZ"));

const broadMismatch=await collectInmetRegionalObservation({
  fieldLatitude:-28.26,fieldLongitude:-52.41,
  fieldRegions:[
    {code:"BR-RS",specificityScore:200},
    {code:"RS-PLANALTO-MEDIO",specificityScore:400},
  ],
  resolveStationRegions:async()=>[
    {code:"BR-RS",specificityScore:200},
    {code:"RS-CAMPANHA",specificityScore:400},
  ],
  nearestFetcher,
  observationFetcher:async()=>{throw new Error("SHOULD_NOT_FETCH");},
  now:()=>new Date("2026-09-21T00:15:00Z"),
});
assert.equal(broadMismatch.status,"NOT_APPLICABLE");
assert.equal(broadMismatch.applicability?.status,"FIELD_SPECIFIC_REGION_NOT_SHARED");
assert.equal(broadMismatch.metricEvidence.length,0);

const skipped=await collectInmetRegionalObservation({
  fieldLatitude:null,fieldLongitude:null,fieldRegions:[],
  resolveStationRegions:async()=>[],
  nearestFetcher:async()=>{throw new Error("SHOULD_NOT_FETCH");},
});
assert.equal(skipped.status,"SKIPPED");
assert.equal(skipped.station,null);

const discoveryDown=await collectInmetRegionalObservation({
  fieldLatitude:-28.26,fieldLongitude:-52.41,
  fieldRegions:[{code:"BR-RS",specificityScore:200}],
  resolveStationRegions:async()=>[],
  nearestFetcher:async()=>{throw new Error("INMET_STATIONS_HTTP_503");},
});
assert.equal(discoveryDown.status,"UNAVAILABLE");
assert.equal(discoveryDown.errorCode,"INMET_STATIONS_HTTP_503");

const regionDown=await collectInmetRegionalObservation({
  fieldLatitude:-28.26,fieldLongitude:-52.41,
  fieldRegions:[{code:"BR-RS",specificityScore:200}],
  resolveStationRegions:async()=>{throw new Error("REGION_DB_DOWN");},
  nearestFetcher,
});
assert.equal(regionDown.status,"UNAVAILABLE");
assert.equal(regionDown.errorCode,"REGION_DB_DOWN");
assert.equal(regionDown.station?.code,"A839");

const observationDown=await collectInmetRegionalObservation({
  fieldLatitude:-28.26,fieldLongitude:-52.41,
  fieldRegions:[{code:"BR-RS",specificityScore:200}],
  resolveStationRegions:async()=>[{code:"BR-RS",specificityScore:200}],
  nearestFetcher,
  observationFetcher:async()=>{throw new Error("INMET_OBSERVATIONS_HTTP_503");},
  now:()=>new Date("2026-09-21T00:15:00Z"),
});
assert.equal(observationDown.status,"UNAVAILABLE");
assert.equal(observationDown.observedDateUtc,"2026-09-20");
assert.equal(observationDown.errorCode,"INMET_OBSERVATIONS_HTTP_503");
assert.equal(observationDown.metricEvidence.length,0);

const incomplete=await collectInmetRegionalObservation({
  fieldLatitude:-28.26,fieldLongitude:-52.41,
  fieldRegions:[{code:"BR-RS",specificityScore:200}],
  resolveStationRegions:async()=>[{code:"BR-RS",specificityScore:200}],
  nearestFetcher,
  observationFetcher:async(input)=>({
    ...(await observationFetcher(input)),
    observations:observations.filter((_,index)=>index!==71),
  }),
  now:()=>new Date("2026-09-21T00:15:00Z"),
});
assert.equal(incomplete.status,"PARTIAL");
assert.equal(incomplete.metricEvidence.length,0);
assert.ok(incomplete.warnings.includes("INMET_INCOMPLETE_UTC_DAY_NOT_AGGREGATED"));
assert.ok(incomplete.warnings.includes("INMET_RAIN_DURATION_WINDOW_INCOMPLETE"));

await assert.rejects(
  collectInmetRegionalObservation({
    fieldLatitude:-28.26,fieldLongitude:null,
    fieldRegions:[],resolveStationRegions:async()=>[],
  }),
  /INMET_FIELD_COORDINATES_INCOMPLETE/,
);

console.log("inmet-regional-observation: fonte oficial é espacialmente gated e não bloqueante");
