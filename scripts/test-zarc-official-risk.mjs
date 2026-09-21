import assert from "node:assert/strict";
import {
  assessZarcPlantingDate,
  parseMapaZarcCsv,
  selectExactZarcRiskRow,
  validateZarcOfficialContext,
  zarcDecadeForCivilDate,
} from "../src/domain/zarc-official-risk.ts";

const context={
  seasonStartYear:2026,
  seasonEndYear:2027,
  cropCode:60,
  cycleCode:21,
  soilCode:14,
  ibgeMunicipalityCode:"4314100",
  stateCode:"rs",
  managementCode:1,
  climateCode:0,
};

const headers=[
  "Nome_cultura","SafraIni","SafraFin","Cod_Cultura","Cod_Ciclo","Cod_Solo",
  "geocodigo","UF","municipio","Cod_Outros_Manejos","Nome_Outros_Manejos",
  "Cod_Clima","Nome_Clima","Cod_Munic","Cod_Meso","Cod_Micro","Portaria",
  ...Array.from({length:36},(_,index)=>`dec${index+1}`),
];

function row(values={}) {
  const base={
    Nome_cultura:"Soja",SafraIni:"2026",SafraFin:"2027",Cod_Cultura:"60",Cod_Ciclo:"21",Cod_Solo:"14",
    geocodigo:"4314100",UF:"RS",municipio:"Passo Fundo",Cod_Outros_Manejos:"1",Nome_Outros_Manejos:"Sequeiro",
    Cod_Clima:"0",Nome_Clima:"Não se aplica",Cod_Munic:"123456",Cod_Meso:"3501",Cod_Micro:"3504",
    Portaria:"PORTARIA SPA/MAPA TESTE",dec1:"20",dec2:"30",dec3:"40",
    ...values,
  };
  return headers.map(header=>String(base[header] ?? "")).join(";");
}

const csv=[headers.join(";"),row()].join("\n");
const parsed=parseMapaZarcCsv(csv);
assert.equal(parsed.length,1);
assert.equal(parsed[0]?.cropCode,60);
assert.equal(parsed[0]?.cycleCode,21);
assert.equal(parsed[0]?.soilCode,14);
assert.equal(parsed[0]?.managementCode,1);
assert.equal(parsed[0]?.climateCode,0);
assert.equal(parsed[0]?.decades[0]?.riskPct,20);
assert.equal(parsed[0]?.decades[1]?.riskPct,30);
assert.equal(parsed[0]?.decades[2]?.riskPct,40);
assert.equal(parsed[0]?.decades[3]?.riskPct,null);

const filtered=parseMapaZarcCsv([
  headers.join(";"),
  row(),
  row({geocodigo:"4305108",municipio:"Caxias do Sul"}),
  row({Cod_Ciclo:"22"}),
].join("\n"),context);
assert.equal(filtered.length,1);
assert.equal(filtered[0]?.ibgeMunicipalityCode,"4314100");

const exact=selectExactZarcRiskRow(parsed,context);
assert.equal(exact.status,"READY");
assert.equal(exact.exactMatchCount,1);
assert.equal(exact.row?.municipalityName,"Passo Fundo");

const noExact=selectExactZarcRiskRow(parsed,{...context,soilCode:15});
assert.equal(noExact.status,"NO_EXACT_MATCH");
assert.equal(noExact.row,null);

const ambiguous=selectExactZarcRiskRow([...parsed,...parsed],context);
assert.equal(ambiguous.status,"AMBIGUOUS_EXACT_MATCH");
assert.equal(ambiguous.row,null);
assert.equal(ambiguous.exactMatchCount,2);

assert.deepEqual(
  validateZarcOfficialContext(context),
  {...context,stateCode:"RS"},
);
assert.throws(
  ()=>validateZarcOfficialContext({...context,cycleCode:23}),
  /ZARC_CYCLE_CODE_INVALID/,
);
assert.throws(
  ()=>validateZarcOfficialContext({...context,soilCode:99}),
  /ZARC_SOIL_CODE_INVALID/,
);
assert.throws(
  ()=>validateZarcOfficialContext({...context,managementCode:9}),
  /ZARC_MANAGEMENT_CODE_INVALID/,
);
assert.throws(
  ()=>validateZarcOfficialContext({...context,climateCode:10}),
  /ZARC_CLIMATE_CODE_INVALID/,
);
assert.throws(
  ()=>validateZarcOfficialContext({...context,ibgeMunicipalityCode:"431410"}),
  /ZARC_IBGE_MUNICIPALITY_CODE_INVALID/,
);

assert.equal(zarcDecadeForCivilDate("2026-01-01"),1);
assert.equal(zarcDecadeForCivilDate("2026-01-10"),1);
assert.equal(zarcDecadeForCivilDate("2026-01-11"),2);
assert.equal(zarcDecadeForCivilDate("2026-01-20"),2);
assert.equal(zarcDecadeForCivilDate("2026-01-21"),3);
assert.equal(zarcDecadeForCivilDate("2026-12-31"),36);
assert.throws(()=>zarcDecadeForCivilDate("2026-02-31"),/ZARC_PLANTING_DATE_INVALID/);

const risk20=assessZarcPlantingDate(parsed[0],"2026-01-05");
assert.equal(risk20.decade,1);
assert.equal(risk20.status,"INDICATED_AT_RISK_LEVEL");
assert.equal(risk20.riskPct,20);
assert.equal(risk20.warning,"ZARC_RISK_IS_NOT_YIELD_FORECAST");

const risk30=assessZarcPlantingDate(parsed[0],"2026-01-15");
assert.equal(risk30.riskPct,30);

const risk40=assessZarcPlantingDate(parsed[0],"2026-01-25");
assert.equal(risk40.riskPct,40);

const notIndicated=assessZarcPlantingDate(parsed[0],"2026-02-01");
assert.equal(notIndicated.decade,4);
assert.equal(notIndicated.status,"NOT_INDICATED_BY_ZARC");
assert.equal(notIndicated.riskPct,null);

const commaCsv=[
  headers.join(","),
  headers.map(header=>{
    const values={
      Nome_cultura:'"Soja, grão"',SafraIni:"2026",SafraFin:"2027",Cod_Cultura:"60",Cod_Ciclo:"21",Cod_Solo:"14",
      geocodigo:"4314100",UF:"RS",municipio:"Passo Fundo",Cod_Outros_Manejos:"1",Nome_Outros_Manejos:"Sequeiro",
      Cod_Clima:"0",Nome_Clima:"Não se aplica",Cod_Munic:"",Cod_Meso:"",Cod_Micro:"",Portaria:"Portaria teste",dec1:"20",
    };
    return String(values[header] ?? "");
  }).join(","),
].join("\n");
assert.equal(parseMapaZarcCsv(commaCsv,context)[0]?.cropName,"Soja, grão");

assert.throws(
  ()=>parseMapaZarcCsv("Nome_cultura;SafraIni\nSoja;2026"),
  /ZARC_CSV_REQUIRED_HEADERS_MISSING/,
);

console.log("zarc-official-risk: códigos explícitos, CSV, decêndio e risco 20/30/40 validados");
