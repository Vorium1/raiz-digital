import assert from "node:assert/strict";
import {
  adaptCptecForecastXml,
  aggregateInmetAutomaticStationDay,
  buildCptecSevenDayLatLonUrl,
  deriveInmetContinuousRainHours,
  listZarcDecadesAtOrBelowRisk,
  normalizeMapaZarcRiskRow,
} from "../src/domain/official-agroclimate-ingestion.ts";

const cptec=adaptCptecForecastXml({
  xml:`<cidade><nome>Passo Fundo</nome><uf>RS</uf><atualizacao>2026-09-20</atualizacao>
    <previsao><dia>2026-09-21</dia><tempo>pn</tempo><maxima>27</maxima><minima>14</minima><iuv>7.0</iuv></previsao>
    <previsao><dia>2026-09-22</dia><tempo>c</tempo><maxima>22</maxima><minima>12</minima><iuv>5.5</iuv></previsao>
  </cidade>`,
  technicalRegionCodes:["BR-RS","RS-PLANALTO-MEDIO"],
  retrievedAt:"2026-09-20T23:00:00Z",sourceRecordPrefix:"CPTEC:PASSO-FUNDO:2026-09-20T23Z",
  utcOffset:"-03:00",latitude:-28.26,longitude:-52.41,
});
assert.equal(cptec.evidence.length,4);
assert.equal(cptec.evidence[0]?.metric,"DAY_MAX_TEMP_C");
assert.equal(cptec.evidence[0]?.value,27);
assert.equal(cptec.evidence[1]?.metric,"DAY_MIN_TEMP_C");
assert.equal(cptec.evidence[0]?.source,"CPTEC_INPE");
assert.equal(cptec.dailyContext[0]?.uvIndex,7);
assert.ok(cptec.warnings.includes("CPTEC_IUV_IS_UV_INDEX_NOT_GLOBAL_SOLAR_RADIATION"));
assert.equal(cptec.evidence.some(i=>i.metric==="GLOBAL_SOLAR_RADIATION_MJ_M2_DAY"),false);
assert.match(buildCptecSevenDayLatLonUrl(-28.26,-52.41),/previsaoLatLon\.xml$/);
assert.throws(()=>adaptCptecForecastXml({
  xml:`<cidade><previsao><dia>2026-09-21</dia><maxima>27</maxima><minima>14</minima></previsao></cidade>`,
  technicalRegionCodes:["BR-RS"],retrievedAt:"2026-09-20T23:00:00Z",sourceRecordPrefix:"x",utcOffset:"BRT",
}),/utcOffset/);

const zarcRow={
  Nome_cultura:"Soja",SafraIni:"2026",SafraFin:"2027",Cod_Cultura:"60",Cod_Ciclo:"21",Cod_Solo:"14",
  geocodigo:"4314100",UF:"RS",municipio:"Passo Fundo",Cod_Outros_Manejos:"1",Nome_Outros_Manejos:"Sequeiro",
  Cod_Clima:"0",Nome_Clima:"Não se aplica",Cod_Munic:"9999",Cod_Meso:"3501",Cod_Micro:"3504",
  Portaria:"Portaria teste",dec1:"20%",dec2:"30",dec3:"",
};
const zarc=normalizeMapaZarcRiskRow(zarcRow);
assert.equal(zarc.source,"MAPA_ZARC");
assert.equal(zarc.decades.length,36);
assert.equal(zarc.decades[0]?.riskPct,20);
assert.equal(zarc.decades[1]?.riskPct,30);
assert.equal(zarc.decades[2]?.riskPct,null);
assert.deepEqual(listZarcDecadesAtOrBelowRisk(zarc,20),[1]);
assert.throws(()=>normalizeMapaZarcRiskRow({...zarcRow,dec1:"120"}),/dec1/);

const observations=Array.from({length:24},(_,hour)=>({
  stationCode:"A839",observedAtUtc:`2026-09-20T${String(hour).padStart(2,"0")}:00:00Z`,
  temperatureC:10+hour,precipitationMm:1,windGustMps:5,globalRadiationKjM2:1000,
}));
const inmet=aggregateInmetAutomaticStationDay({
  observations,targetDateUtc:"2026-09-20",technicalRegionCodes:["BR-RS","RS-PLANALTO-MEDIO"],
  retrievedAt:"2026-09-21T01:00:00Z",latitude:-28.22,longitude:-52.4,
});
const byMetric=Object.fromEntries(inmet.evidence.map(i=>[i.metric,i]));
assert.equal(byMetric.DAY_MAX_TEMP_C.value,33);
assert.equal(byMetric.DAY_MIN_TEMP_C.value,10);
assert.equal(byMetric.PRECIPITATION_MM.value,24);
assert.equal(byMetric.WIND_GUST_KMH.value,18);
assert.equal(byMetric.GLOBAL_SOLAR_RADIATION_MJ_M2_DAY.value,24);
assert.equal(byMetric.DAY_MAX_TEMP_C.evidenceKind,"DERIVED");
assert.ok(byMetric.DAY_MAX_TEMP_C.derivationRuleId);
assert.ok(inmet.warnings.includes("INMET_AUTOMATIC_STATION_DATA_RAW_NOT_QUALITY_CONTROLLED_BY_RAIZ"));

const incomplete=aggregateInmetAutomaticStationDay({
  observations:observations.slice(0,23),targetDateUtc:"2026-09-20",technicalRegionCodes:["BR-RS"],
  retrievedAt:"2026-09-21T01:00:00Z",latitude:-28.22,longitude:-52.4,
});
assert.equal(incomplete.evidence.length,0);
assert.ok(incomplete.warnings.includes("INMET_INCOMPLETE_UTC_DAY_NOT_AGGREGATED"));

const invalidRain=aggregateInmetAutomaticStationDay({
  observations:observations.map((row,index)=>({...row,precipitationMm:index===0?-1:1})),
  targetDateUtc:"2026-09-20",technicalRegionCodes:["BR-RS"],retrievedAt:"2026-09-21T01:00:00Z",
  latitude:-28.22,longitude:-52.4,
});
assert.equal(invalidRain.evidence.some(i=>i.metric==="PRECIPITATION_MM"),false);
assert.ok(invalidRain.warnings.includes("INMET_PRECIPITATION_SERIES_INCOMPLETE_OR_INVALID"));

const rainWindow=Array.from({length:72},(_,index)=>({
  stationCode:"A839",
  observedAtUtc:new Date(Date.UTC(2026,8,18,0,0,0)+index*3_600_000).toISOString(),
  precipitationMm:index<50?0.4:0,
}));
const rainDuration=deriveInmetContinuousRainHours({
  observations:rainWindow,
  technicalRegionCodes:["BR-RS","RS-PLANALTO-MEDIO"],
  retrievedAt:"2026-09-21T01:00:00Z",
  latitude:-28.22,longitude:-52.4,
});
assert.equal(rainDuration.evidence?.metric,"CONTINUOUS_RAIN_HOURS");
assert.equal(rainDuration.evidence?.value,50);
assert.equal(rainDuration.evidence?.evidenceKind,"DERIVED");
assert.equal(rainDuration.evidence?.derivationRuleId,"INMET_CONSECUTIVE_HOURLY_PRECIPITATION_GT_ZERO_V1");
assert.ok(rainDuration.warnings.includes("INMET_CONTINUOUS_RAIN_HOURS_MEANS_CONSECUTIVE_HOURLY_BINS_WITH_PRECIPITATION_GT_ZERO"));

const rainGap=deriveInmetContinuousRainHours({
  observations:rainWindow.filter((_,index)=>index!==24),
  technicalRegionCodes:["BR-RS"],retrievedAt:"2026-09-21T01:00:00Z",
  latitude:-28.22,longitude:-52.4,
});
assert.equal(rainGap.evidence,null);
assert.ok(rainGap.warnings.includes("INMET_RAIN_DURATION_WINDOW_HAS_GAPS"));

const rainMissing=deriveInmetContinuousRainHours({
  observations:rainWindow.map((row,index)=>index===12?{...row,precipitationMm:null}:row),
  technicalRegionCodes:["BR-RS"],retrievedAt:"2026-09-21T01:00:00Z",
  latitude:-28.22,longitude:-52.4,
});
assert.equal(rainMissing.evidence,null);
assert.ok(rainMissing.warnings.includes("INMET_RAIN_DURATION_PRECIPITATION_INCOMPLETE_OR_INVALID"));

console.log("official-agroclimate-ingestion: CPTEC, INMET e ZARC preservam unidade, proveniência e semântica");
