import type { AgroclimateMetric } from "./crop-climate-metric-engine.ts";
import type { AgroclimateMetricEvidence } from "./agroclimate-metric-evidence.ts";

export const OFFICIAL_AGROCLIMATE_SOURCE_CONTRACTS = {
  CPTEC_XML: {
    institution: "CPTEC/INPE",
    status: "DOCUMENTED_AUTOMATIC_WEB_SERVICE",
    role: "FORECAST",
    locator: "https://servicos.cptec.inpe.br/XML/",
    notes: "Temperatura máxima/mínima podem ser ingeridas. IUV é índice UV e não deve ser convertido em radiação global/PAR.",
  },
  INMET_AUTOMATIC_STATIONS: {
    institution: "INMET",
    status: "OFFICIAL_OBSERVED_DATA_ENDPOINT_NOT_HOMOLOGATED",
    role: "OBSERVATION",
    locator: "https://portal.inmet.gov.br/servicos/estações-automáticas",
    notes: "Observações oficiais normalizadas podem ser usadas; a camada HTTP fica desacoplada até contrato oficial de API ser homologado. Dados automáticos são brutos.",
  },
  MAPA_ZARC_RISK_TABLE: {
    institution: "MAPA",
    status: "OFFICIAL_OPEN_DATASET",
    role: "PLANTING_RISK_ZONING",
    locator: "https://dados.agricultura.gov.br/dataset/tabua-de-risco-zoneamento-agricola-de-risco-climatico",
    notes: "ZARC é risco/janela de plantio por safra, cultura, grupo, solo, município, manejo e decêndio. Não é previsão meteorológica.",
  },
} as const;

function normalized(value: string) { return value.trim().toUpperCase(); }
function assertIso(value: string, label: string) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} inválido: ${value}`);
}
function assertDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`))) {
    throw new Error(`${label} inválida: ${value}`);
  }
}
function regions(values: string[]) {
  const result=[...new Set(values.map(normalized).filter(Boolean))];
  if (!result.length) throw new Error("Ao menos uma região técnica é obrigatória.");
  return result;
}
function coordinates(lat?: number|null, lon?: number|null) {
  if ((lat==null)!==(lon==null)) throw new Error("Latitude e longitude devem ser informadas juntas.");
  if (lat!=null && (!Number.isFinite(lat)||lat < -90||lat > 90)) throw new Error("Latitude inválida.");
  if (lon!=null && (!Number.isFinite(lon)||lon < -180||lon > 180)) throw new Error("Longitude inválida.");
}
function tag(block:string,name:string) {
  return block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`,"i"))?.[1]?.trim() ?? null;
}
function numeric(value:string|null,label:string) {
  if (!value) throw new Error(`${label} ausente.`);
  const n=Number(value.replace(",","."));
  if (!Number.isFinite(n)) throw new Error(`${label} inválido: ${value}`);
  return n;
}
function utcOffset(value:string) {
  if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(value)) throw new Error(`utcOffset inválido: ${value}`);
}

export type CptecForecastDailyContext={date:string;weatherCode:string|null;uvIndex:number|null};

/**
 * XML oficial CPTEC -> somente grandezas com unidade documentada.
 * IUV permanece contexto: nunca vira radiação global/PAR.
 * Código de tempo permanece contexto: nunca vira chuva em mm.
 * Fuso é obrigatório: não assumir silenciosamente horário de Brasília.
 */
export function adaptCptecForecastXml(input:{
  xml:string; technicalRegionCodes:string[]; retrievedAt:string; sourceRecordPrefix:string;
  utcOffset:string; latitude?:number|null; longitude?:number|null;
}):{
  evidence:AgroclimateMetricEvidence[]; dailyContext:CptecForecastDailyContext[];
  sourceUpdatedOn:string|null; warnings:string[];
}{
  assertIso(input.retrievedAt,"retrievedAt");
  utcOffset(input.utcOffset); coordinates(input.latitude,input.longitude);
  const technicalRegionCodes=regions(input.technicalRegionCodes);
  if (!input.sourceRecordPrefix.trim()) throw new Error("sourceRecordPrefix é obrigatório para CPTEC.");
  const sourceUpdatedOn=tag(input.xml,"atualizacao");
  if (sourceUpdatedOn) assertDate(sourceUpdatedOn,"atualizacao CPTEC");
  const blocks=[...input.xml.matchAll(/<previsao>([\s\S]*?)<\/previsao>/gi)].map(m=>m[1]);
  if (!blocks.length) throw new Error("XML CPTEC sem blocos <previsao>.");
  const evidence:AgroclimateMetricEvidence[]=[]; const dailyContext:CptecForecastDailyContext[]=[];
  let sawUv=false, sawWeather=false;
  for (const block of blocks) {
    const date=tag(block,"dia"); if (!date) throw new Error("Previsão CPTEC sem dia."); assertDate(date,"dia CPTEC");
    const maxC=numeric(tag(block,"maxima"),"temperatura máxima CPTEC");
    const minC=numeric(tag(block,"minima"),"temperatura mínima CPTEC");
    const weatherCode=tag(block,"tempo"); const uvRaw=tag(block,"iuv");
    const uvIndex=uvRaw ? numeric(uvRaw,"IUV CPTEC") : null;
    sawUv ||= uvIndex!=null; sawWeather ||= Boolean(weatherCode);
    const common={
      evidenceKind:"FORECAST_MODEL" as const, source:"CPTEC_INPE" as const, issuedAt:input.retrievedAt,
      validFrom:`${date}T00:00:00${input.utcOffset}`, validUntil:`${date}T23:59:59${input.utcOffset}`,
      technicalRegionCodes, latitude:input.latitude??null, longitude:input.longitude??null,
    };
    evidence.push(
      {...common,metric:"DAY_MAX_TEMP_C",value:maxC,sourceRecordId:`${input.sourceRecordPrefix}:${date}:DAY_MAX_TEMP_C`},
      {...common,metric:"DAY_MIN_TEMP_C",value:minC,sourceRecordId:`${input.sourceRecordPrefix}:${date}:DAY_MIN_TEMP_C`},
    );
    dailyContext.push({date,weatherCode,uvIndex});
  }
  return {evidence,dailyContext,sourceUpdatedOn,warnings:[
    ...(sawUv?["CPTEC_IUV_IS_UV_INDEX_NOT_GLOBAL_SOLAR_RADIATION"]:[]),
    ...(sawWeather?["CPTEC_WEATHER_CODE_NOT_CONVERTED_TO_NUMERIC_PRECIPITATION"]:[]),
  ]};
}
export function buildCptecSevenDayLatLonUrl(latitude:number,longitude:number) {
  coordinates(latitude,longitude);
  return `https://servicos.cptec.inpe.br/XML/cidade/7dias/${latitude}/${longitude}/previsaoLatLon.xml`;
}

export type InmetHourlyObservation={
  stationCode:string; observedAtUtc:string; temperatureC?:number|null; precipitationMm?:number|null;
  windGustMps?:number|null; globalRadiationKjM2?:number|null;
};
function series(rows:InmetHourlyObservation[], pick:(row:InmetHourlyObservation)=>number|null|undefined) {
  const values=rows.map(pick);
  return values.some(v=>v==null||!Number.isFinite(v)) ? null : values as number[];
}
/**
 * Agrega somente dia UTC completo de estação automática INMET já normalizada.
 * Séries incompletas não fabricam métricas diárias. Radiação kJ/m² -> MJ/m²/dia
 * apenas pela soma explícita das integrações horárias completas.
 */
export function aggregateInmetAutomaticStationDay(input:{
  observations:InmetHourlyObservation[]; targetDateUtc:string; technicalRegionCodes:string[];
  retrievedAt:string; latitude:number; longitude:number; expectedHourlySlots?:number;
}):{evidence:AgroclimateMetricEvidence[];warnings:string[]} {
  assertDate(input.targetDateUtc,"targetDateUtc"); assertIso(input.retrievedAt,"retrievedAt");
  coordinates(input.latitude,input.longitude); const technicalRegionCodes=regions(input.technicalRegionCodes);
  const expected=input.expectedHourlySlots??24;
  if (!Number.isInteger(expected)||expected<=0||expected>48) throw new Error("expectedHourlySlots inválido.");
  const rows=input.observations.filter(r=>r.observedAtUtc.startsWith(input.targetDateUtc));
  for (const r of rows) { assertIso(r.observedAtUtc,"observedAtUtc INMET"); if (!r.stationCode.trim()) throw new Error("stationCode INMET é obrigatório."); }
  const stationCodes=[...new Set(rows.map(r=>normalized(r.stationCode)))];
  if (stationCodes.length>1) throw new Error("Não agregue estações INMET diferentes no mesmo dia.");
  if (!stationCodes.length) return {evidence:[],warnings:["INMET_NO_OBSERVATIONS_FOR_TARGET_DAY"]};
  if (new Set(rows.map(r=>r.observedAtUtc)).size!==expected || rows.length!==expected) return {evidence:[],warnings:[
    "INMET_INCOMPLETE_UTC_DAY_NOT_AGGREGATED","INMET_AUTOMATIC_STATION_DATA_RAW_NOT_QUALITY_CONTROLLED_BY_RAIZ",
  ]};
  const stationCode=stationCodes[0], evidence:AgroclimateMetricEvidence[]=[];
  const warnings=["INMET_AUTOMATIC_STATION_DATA_RAW_NOT_QUALITY_CONTROLLED_BY_RAIZ"];
  const common={evidenceKind:"DERIVED" as const,source:"INMET" as const,issuedAt:input.retrievedAt,
    validFrom:`${input.targetDateUtc}T00:00:00Z`,validUntil:`${input.targetDateUtc}T23:59:59Z`,
    technicalRegionCodes,latitude:input.latitude,longitude:input.longitude};
  const add=(metric:AgroclimateMetric,value:number,derivationRuleId:string)=>evidence.push({
    ...common,metric,value,sourceRecordId:`INMET:${stationCode}:${input.targetDateUtc}:${metric}`,derivationRuleId,
  });
  const temp=series(rows,r=>r.temperatureC);
  if (temp) { add("DAY_MAX_TEMP_C",Math.max(...temp),"INMET_HOURLY_TEMPERATURE_MAX_UTC_DAY_V1"); add("DAY_MIN_TEMP_C",Math.min(...temp),"INMET_HOURLY_TEMPERATURE_MIN_UTC_DAY_V1"); }
  else warnings.push("INMET_TEMPERATURE_SERIES_INCOMPLETE");
  const rain=series(rows,r=>r.precipitationMm);
  if (rain && rain.every(v=>v>=0)) add("PRECIPITATION_MM",rain.reduce((a,b)=>a+b,0),"INMET_HOURLY_PRECIPITATION_SUM_UTC_DAY_V1");
  else warnings.push("INMET_PRECIPITATION_SERIES_INCOMPLETE_OR_INVALID");
  const gust=series(rows,r=>r.windGustMps);
  if (gust && gust.every(v=>v>=0)) add("WIND_GUST_KMH",Math.max(...gust)*3.6,"INMET_HOURLY_GUST_MAX_MPS_TO_KMH_UTC_DAY_V1");
  else warnings.push("INMET_WIND_GUST_SERIES_INCOMPLETE_OR_INVALID");
  const radiation=series(rows,r=>r.globalRadiationKjM2);
  if (radiation && radiation.every(v=>v>=0)) add("GLOBAL_SOLAR_RADIATION_MJ_M2_DAY",radiation.reduce((a,b)=>a+b,0)/1000,"INMET_HOURLY_GLOBAL_RADIATION_KJ_M2_SUM_TO_MJ_M2_UTC_DAY_V1");
  else warnings.push("INMET_GLOBAL_RADIATION_SERIES_INCOMPLETE_OR_INVALID");
  return {evidence,warnings};
}

export type ZarcRiskTableRow=Record<string,string|number|null|undefined>;
export type ZarcPlantingRiskEvidence={
  cropName:string;cropCode:number;seasonStartYear:number;seasonEndYear:number;cycleCode:number;soilCode:number;
  ibgeMunicipalityCode:string;stateCode:string;municipalityName:string;managementCode:number;managementName:string;
  climateCode:number;climateName:string;sicorMunicipalityCode:string|null;mesoregionCode:string|null;
  microregionCode:string|null;ordinance:string;decades:Array<{decade:number;riskPct:number|null;rawValue:string|null}>;
  source:"MAPA_ZARC";
};
function field(row:ZarcRiskTableRow,key:string,required=true) {
  const value=row[key]==null?"":String(row[key]).trim();
  if (required&&!value) throw new Error(`ZARC: coluna ${key} obrigatória ausente.`);
  return value||null;
}
function intField(row:ZarcRiskTableRow,key:string) {
  const n=Number(field(row,key)); if (!Number.isInteger(n)) throw new Error(`ZARC: ${key} precisa ser inteiro.`); return n;
}
function risk(raw:string|null,decade:number) {
  if (!raw) return null; const n=Number(raw.replace("%","").replace(",",".").trim());
  if (!Number.isFinite(n)||n<0||n>100) throw new Error(`ZARC: valor inválido em dec${decade}: ${raw}`);
  return n;
}
/** ZARC fica em camada própria; nunca é convertido em clima observado/previsto. */
export function normalizeMapaZarcRiskRow(row:ZarcRiskTableRow):ZarcPlantingRiskEvidence {
  const decades=Array.from({length:36},(_,i)=>{const decade=i+1,rawValue=field(row,`dec${decade}`,false);return {decade,riskPct:risk(rawValue,decade),rawValue};});
  return {
    cropName:field(row,"Nome_cultura")!,cropCode:intField(row,"Cod_Cultura"),seasonStartYear:intField(row,"SafraIni"),
    seasonEndYear:intField(row,"SafraFin"),cycleCode:intField(row,"Cod_Ciclo"),soilCode:intField(row,"Cod_Solo"),
    ibgeMunicipalityCode:field(row,"geocodigo")!,stateCode:normalized(field(row,"UF")!),municipalityName:field(row,"municipio")!,
    managementCode:intField(row,"Cod_Outros_Manejos"),managementName:field(row,"Nome_Outros_Manejos")!,
    climateCode:intField(row,"Cod_Clima"),climateName:field(row,"Nome_Clima")!,sicorMunicipalityCode:field(row,"Cod_Munic",false),
    mesoregionCode:field(row,"Cod_Meso",false),microregionCode:field(row,"Cod_Micro",false),ordinance:field(row,"Portaria")!,
    decades,source:"MAPA_ZARC",
  };
}
export function listZarcDecadesAtOrBelowRisk(evidence:ZarcPlantingRiskEvidence,maxRiskPct:number) {
  if (!Number.isFinite(maxRiskPct)||maxRiskPct<0||maxRiskPct>100) throw new Error("maxRiskPct precisa estar entre 0 e 100.");
  return evidence.decades.filter(i=>i.riskPct!=null&&i.riskPct<=maxRiskPct).map(i=>i.decade);
}
