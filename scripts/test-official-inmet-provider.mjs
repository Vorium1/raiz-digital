import assert from "node:assert/strict";
import { aggregateInmetAutomaticStationDay } from "../src/domain/official-agroclimate-ingestion.ts";
import {
  INMET_AUTOMATIC_STATIONS_URL,
  adaptInmetAutomaticStationCatalog,
  adaptInmetHourlyApiRows,
  buildInmetHourlyStationUrl,
  selectNearestOperativeInmetAutomaticStation,
} from "../src/domain/inmet-official-observation.ts";
import {
  fetchInmetHourlyStationObservations,
  fetchNearestInmetAutomaticStation,
} from "../src/lib/agroclimate/official-source-provider.ts";

function response({ok=true,status=200,json=null}={}) {
  return {
    ok,status,
    async text(){return "";},
    async json(){return json;},
    headers:{get(){return null;}},
  };
}

const stationPayload=[
  {
    CD_ESTACAO:"A839",DC_NOME:"PASSO FUNDO",SG_ESTADO:"RS",SG_ENTIDADE:"INMET",
    TP_ESTACAO:"Automatica",CD_SITUACAO:"Operante",VL_LATITUDE:"-28.2268",
    VL_LONGITUDE:"-52.4036",VL_ALTITUDE:"684",DT_INICIO_OPERACAO:"2006-12-15T21:00:00.000-03:00",
  },
  {
    CD_ESTACAO:"A998",DC_NOME:"PANE MUITO PROXIMA",SG_ESTADO:"RS",SG_ENTIDADE:"INMET",
    TP_ESTACAO:"Automatica",CD_SITUACAO:"Pane",VL_LATITUDE:"-28.2601",
    VL_LONGITUDE:"-52.4101",VL_ALTITUDE:"650",
  },
  {
    CD_ESTACAO:"S777",DC_NOME:"PARCEIRA PROXIMA",SG_ESTADO:"RS",SG_ENTIDADE:"OUTRO",
    TP_ESTACAO:"Automatica",CD_SITUACAO:"Operante",VL_LATITUDE:"-28.2600",
    VL_LONGITUDE:"-52.4100",VL_ALTITUDE:"650",
  },
  {
    CD_ESTACAO:"A887",DC_NOME:"OUTRA OPERANTE",SG_ESTADO:"RS",SG_ENTIDADE:"INMET",
    TP_ESTACAO:"Automatica",CD_SITUACAO:"Operante",VL_LATITUDE:"-29.0",
    VL_LONGITUDE:"-53.0",VL_ALTITUDE:"500",
  },
];

const adaptedStations=adaptInmetAutomaticStationCatalog(stationPayload);
assert.equal(adaptedStations.length,3);
assert.equal(adaptedStations.some(item=>item.stationCode==="S777"),false);

const nearest=selectNearestOperativeInmetAutomaticStation({
  stations:adaptedStations,
  latitude:-28.26,
  longitude:-52.41,
});
assert.equal(nearest.station.stationCode,"A839");
assert.equal(nearest.selectionRule,"NEAREST_OPERATIVE_INMET_AUTOMATIC_STATION");
assert.ok(nearest.distanceKm>0 && nearest.distanceKm<10);

const stationCalls=[];
const fetchedStation=await fetchNearestInmetAutomaticStation({
  latitude:-28.26,longitude:-52.41,
  fetchImpl:async(url,init)=>{
    stationCalls.push({url,init});
    return response({json:stationPayload});
  },
});
assert.equal(fetchedStation.provider,"INMET");
assert.equal(fetchedStation.station.stationCode,"A839");
assert.equal(stationCalls[0]?.url,INMET_AUTOMATIC_STATIONS_URL);
assert.equal(stationCalls[0]?.init?.cache,"no-store");
assert.equal(stationCalls[0]?.init?.headers?.accept,"application/json");

const hourlyPayload=Array.from({length:24},(_,hour)=>({
  CD_ESTACAO:"A839",
  DT_MEDICAO:"2026-09-20",
  HR_MEDICAO:String(hour*100).padStart(4,"0"),
  TEM_INS:String(12+hour/2),
  CHUVA:hour===18?"2.5":"0",
  VEN_RAJ:"5",
  RAD_GLO:"1000",
}));
const adaptedRows=adaptInmetHourlyApiRows(hourlyPayload);
assert.equal(adaptedRows.length,24);
assert.equal(adaptedRows[0]?.observedAtUtc,"2026-09-20T00:00:00Z");
assert.equal(adaptedRows[23]?.observedAtUtc,"2026-09-20T23:00:00Z");
assert.equal(adaptedRows[18]?.precipitationMm,2.5);

const obsCalls=[];
const fetchedObs=await fetchInmetHourlyStationObservations({
  stationCode:"a839",dateFrom:"2026-09-20",dateTo:"2026-09-20",
  now:()=>new Date("2026-09-21T02:00:00Z"),
  fetchImpl:async(url,init)=>{
    obsCalls.push({url,init});
    return response({json:hourlyPayload});
  },
});
assert.equal(fetchedObs.provider,"INMET");
assert.equal(fetchedObs.stationCode,"A839");
assert.equal(fetchedObs.retrievedAt,"2026-09-21T02:00:00.000Z");
assert.equal(fetchedObs.observations.length,24);
assert.match(obsCalls[0]?.url ?? "",/^https:\/\/apitempo\.inmet\.gov\.br\/estacao\/2026-09-20\/2026-09-20\/A839$/);
assert.equal(obsCalls[0]?.init?.cache,"no-store");

const aggregate=aggregateInmetAutomaticStationDay({
  observations:fetchedObs.observations,
  targetDateUtc:"2026-09-20",
  technicalRegionCodes:["BR-RS","RS-PLANALTO-MEDIO"],
  retrievedAt:fetchedObs.retrievedAt,
  latitude:fetchedStation.station.latitude,
  longitude:fetchedStation.station.longitude,
});
const metrics=Object.fromEntries(aggregate.evidence.map(item=>[item.metric,item.value]));
assert.equal(metrics.DAY_MIN_TEMP_C,12);
assert.equal(metrics.DAY_MAX_TEMP_C,23.5);
assert.equal(metrics.PRECIPITATION_MM,2.5);
assert.equal(metrics.WIND_GUST_KMH,18);
assert.equal(metrics.GLOBAL_SOLAR_RADIATION_MJ_M2_DAY,24);
assert.ok(aggregate.warnings.includes("INMET_AUTOMATIC_STATION_DATA_RAW_NOT_QUALITY_CONTROLLED_BY_RAIZ"));

const sentinelRows=adaptInmetHourlyApiRows(hourlyPayload.map((row,index)=>(
  index===3 ? {...row,TEM_INS:"9999"} : row
)));
assert.equal(sentinelRows[3]?.temperatureC,null);
const sentinelAggregate=aggregateInmetAutomaticStationDay({
  observations:sentinelRows,targetDateUtc:"2026-09-20",technicalRegionCodes:["BR-RS"],
  retrievedAt:"2026-09-21T02:00:00Z",latitude:-28.2268,longitude:-52.4036,
});
assert.equal(sentinelAggregate.evidence.some(item=>item.metric==="DAY_MAX_TEMP_C"),false);
assert.ok(sentinelAggregate.warnings.includes("INMET_TEMPERATURE_SERIES_INCOMPLETE"));

assert.throws(
  ()=>buildInmetHourlyStationUrl({dateFrom:"2026-09-21",dateTo:"2026-09-20",stationCode:"A839"}),
  /INMET_DATE_RANGE_INVALID/,
);

await assert.rejects(
  fetchInmetHourlyStationObservations({
    stationCode:"A839",dateFrom:"2026-09-20",dateTo:"2026-09-20",
    fetchImpl:async()=>response({json:[{...hourlyPayload[0],CD_ESTACAO:"A840"}]}),
  }),
  /INMET_OBSERVATION_STATION_MISMATCH/,
);

await assert.rejects(
  fetchNearestInmetAutomaticStation({
    latitude:-28.26,longitude:-52.41,
    fetchImpl:async()=>response({ok:false,status:503}),
  }),
  /INMET_STATIONS_HTTP_503/,
);

assert.throws(
  ()=>selectNearestOperativeInmetAutomaticStation({
    stations:adaptedStations.map(station=>({...station,status:"Pane"})),
    latitude:-28.26,longitude:-52.41,
  }),
  /INMET_NO_OPERATIVE_AUTOMATIC_STATION/,
);

console.log("official-inmet-provider: estação, UTC, sentinelas, distância e agregação segura validados");
