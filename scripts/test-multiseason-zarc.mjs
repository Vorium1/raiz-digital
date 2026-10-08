import assert from "node:assert/strict";
import {
  agritecCropBaseName,
  assessAgritecPlanningDate,
  resolveAgritecCultureExact,
  resolveAgritecMunicipalityExact,
} from "../src/domain/multiseason-zarc.ts";

const municipalities=[
  {ibgeCode:"4314100",name:"PASSO FUNDO",stateCode:"RS",latitude:-28.26,longitude:-52.41,updatedOn:"2018-05-02"},
  {ibgeCode:"4209102",name:"JOINVILLE",stateCode:"SC",latitude:null,longitude:null,updatedOn:null},
];
const passo=resolveAgritecMunicipalityExact({
  municipalities,
  municipalityName:"Passo Fundo",
  stateCode:"rs",
});
assert.equal(passo.status,"READY");
assert.equal(passo.municipality?.ibgeCode,"4314100");

const noMunicipality=resolveAgritecMunicipalityExact({
  municipalities,
  municipalityName:"Passo Funndo",
  stateCode:"RS",
});
assert.equal(noMunicipality.status,"NO_MATCH");

const ambiguousMunicipality=resolveAgritecMunicipalityExact({
  municipalities:[...municipalities,{...municipalities[0],ibgeCode:"9999999"}],
  municipalityName:"Passo Fundo",
  stateCode:"RS",
});
assert.equal(ambiguousMunicipality.status,"AMBIGUOUS");

const cultures=[
  {id:60,name:"SOJA SEQUEIRO",fullName:"SOJA SEQUEIRO",seasonLabel:"2026-2027",cultivation:"SEQUEIRO",climate:"Não se aplica",hasZoning:true,updatedOn:null},
  {id:61,name:"SOJA IRRIGADO",fullName:"SOJA IRRIGADO",seasonLabel:"2026-2027",cultivation:"IRRIGADO",climate:"Não se aplica",hasZoning:true,updatedOn:null},
  {id:70,name:"TRIGO SEQUEIRO",fullName:"TRIGO SEQUEIRO",seasonLabel:"2026-2027",cultivation:"SEQUEIRO",climate:"Não se aplica",hasZoning:true,updatedOn:null},
];
assert.equal(agritecCropBaseName("SOYBEAN"),"SOJA");
assert.equal(agritecCropBaseName("WHEAT"),"TRIGO");
assert.equal(agritecCropBaseName("RICE"),"ARROZ");

const soybeanDry=resolveAgritecCultureExact({cultures,cropCode:"SOYBEAN",irrigated:false});
assert.equal(soybeanDry.status,"READY");
assert.equal(soybeanDry.culture?.id,60);

const soybeanIrrigated=resolveAgritecCultureExact({cultures,cropCode:"SOYBEAN",irrigated:true});
assert.equal(soybeanIrrigated.status,"READY");
assert.equal(soybeanIrrigated.culture?.id,61);

const soybeanUnknown=resolveAgritecCultureExact({cultures,cropCode:"SOYBEAN",irrigated:null});
assert.equal(soybeanUnknown.status,"WATER_CONDITION_REQUIRED");

const windows=[
  {
    municipalityName:"PASSO FUNDO",stateCode:"RS",cropName:"SOJA",cycleLabel:"GRUPO I",soilLabel:"AD1",
    startDay:1,startMonth:10,endDay:31,endMonth:12,seasonStartYear:2026,seasonEndYear:2027,
    riskPct:20,ordinance:"Portaria A",
  },
  {
    municipalityName:"PASSO FUNDO",stateCode:"RS",cropName:"SOJA",cycleLabel:"GRUPO II",soilLabel:"AD2",
    startDay:1,startMonth:10,endDay:31,endMonth:12,seasonStartYear:2026,seasonEndYear:2027,
    riskPct:20,ordinance:"Portaria A",
  },
];
const consensus=assessAgritecPlanningDate({
  windows,
  plannedDate:"2026-11-05",
  municipalityName:"Passo Fundo",
  stateCode:"RS",
  expectedCropBaseName:"SOJA",
});
assert.equal(consensus.status,"CONSENSUS_RISK");
assert.deepEqual(consensus.riskLevelsPct,[20]);
assert.deepEqual(consensus.unresolvedDimensions,["CYCLE","SOIL"]);
assert.equal(consensus.warning,"ZARC_RISK_IS_NOT_YIELD_FORECAST");

const variable=assessAgritecPlanningDate({
  windows:[...windows,{...windows[1],riskPct:30,cycleLabel:"GRUPO III"}],
  plannedDate:"2026-11-05",
  municipalityName:"Passo Fundo",
  stateCode:"RS",
  expectedCropBaseName:"SOJA",
});
assert.equal(variable.status,"VARIABLE_BY_SOIL_OR_CYCLE");
assert.deepEqual(variable.riskLevelsPct,[20,30]);

const notIndicated=assessAgritecPlanningDate({
  windows,
  plannedDate:"2027-03-05",
  municipalityName:"Passo Fundo",
  stateCode:"RS",
  expectedCropBaseName:"SOJA",
});
assert.equal(notIndicated.status,"NOT_INDICATED");
assert.deepEqual(notIndicated.riskLevelsPct,[]);

const mismatch=assessAgritecPlanningDate({
  windows,
  plannedDate:"2029-11-05",
  municipalityName:"Passo Fundo",
  stateCode:"RS",
  expectedCropBaseName:"SOJA",
});
assert.equal(mismatch.status,"SEASON_MISMATCH");

assert.throws(
  ()=>assessAgritecPlanningDate({
    windows,
    plannedDate:"2026-02-30",
    municipalityName:"Passo Fundo",
    stateCode:"RS",
    expectedCropBaseName:"SOJA",
  }),
  /AGRITEC_PLANNING_DATE_INVALID/,
);

console.log("multiseason-zarc: município/cultura exatos, manejo hídrico e envelope ZARC fail-closed aprovados");
