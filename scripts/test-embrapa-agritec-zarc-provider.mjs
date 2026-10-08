import assert from "node:assert/strict";
import {
  adaptAgritecCulturesPayload,
  adaptAgritecMunicipalitiesPayload,
  adaptAgritecZarcPayload,
  fetchAgritecMunicipalities,
  fetchAgritecMunicipalityCultures,
  fetchAgritecZarcWindows,
} from "../src/lib/agroclimate/embrapa-agritec-zarc-provider.ts";

function response({ok=true,status=200,json={data:[]}}={}) {
  return {
    ok,status,
    async text(){return "";},
    async json(){return json;},
    headers:{get(){return null;}},
  };
}

const payload={
  data:[
    {
      municipio:"CAMPINAS",uf:"SP",cultura:"MILHO",ciclo:"GRUPO III",solo:"ARGILOSO",
      diaIni:1,mesIni:10,diaFim:31,mesFim:12,safraIni:2026,safraFim:2027,risco:20,
      portaria:"Port. teste",
    },
    {
      municipio:"CAMPINAS",uf:"SP",cultura:"MILHO",ciclo:"GRUPO III",solo:"TEXTURA MEDIA",
      diaIni:1,mesIni:10,diaFim:31,mesFim:12,safraIni:2026,safraFim:2027,risco:30,
      portaria:"Port. teste",
    },
  ],
};

const adapted=adaptAgritecZarcPayload(payload);
assert.equal(adapted.length,2);
assert.equal(adapted[0]?.municipalityName,"CAMPINAS");
assert.equal(adapted[0]?.stateCode,"SP");
assert.equal(adapted[0]?.riskPct,20);
assert.equal(adapted[0]?.source,"EMBRAPA_AGRITEC_V2_ZARC");
assert.throws(
  ()=>adaptAgritecZarcPayload({data:[{...payload.data[0],risco:25}]}),
  /AGRITEC_ZARC_RISK_UNSUPPORTED/,
);
assert.throws(
  ()=>adaptAgritecZarcPayload({data:[{...payload.data[0],safraFim:2028}]}),
  /AGRITEC_ZARC_SEASON_INVALID/,
);
assert.throws(
  ()=>adaptAgritecZarcPayload({data:[{...payload.data[0],diaFim:32}]}),
  /AGRITEC_END_DATE_INVALID/,
);

const municipalitiesPayload={data:[
  {codigoIBGE:4314100,nome:"PASSO FUNDO",uf:"RS",latitude:-28.26,longitude:-52.41,dataAtualizacao:"2018-05-02"},
]};
const adaptedMunicipalities=adaptAgritecMunicipalitiesPayload(municipalitiesPayload);
assert.equal(adaptedMunicipalities[0]?.ibgeCode,"4314100");
assert.equal(adaptedMunicipalities[0]?.stateCode,"RS");

const culturesPayload={data:[
  {id:60,nome:"SOJA SEQUEIRO",nomeCompleto:"SOJA SEQUEIRO",safra:"2026-2027",cultivo:"SEQUEIRO",clima:"Não se aplica",hasZoneamento:true,dataAtualizacao:null},
  {id:61,nome:"SOJA IRRIGADO",nomeCompleto:"SOJA IRRIGADO",safra:"2026-2027",cultivo:"IRRIGADO",clima:"Não se aplica",hasZoneamento:false,dataAtualizacao:null},
]};
const adaptedCultures=adaptAgritecCulturesPayload(culturesPayload);
assert.equal(adaptedCultures.length,2);
assert.equal(adaptedCultures[0]?.id,60);
assert.equal(adaptedCultures[0]?.hasZoning,true);

const discoveryCalls=[];
const municipalitiesResult=await fetchAgritecMunicipalities({
  accessToken:"TEST_VALUE",
  stateCode:"rs",
  now:()=>new Date("2026-10-07T20:00:00Z"),
  fetchImpl:async(url,init)=>{
    discoveryCalls.push({url,init});
    return response({json:municipalitiesPayload});
  },
});
assert.equal(municipalitiesResult.municipalities.length,1);
assert.match(municipalitiesResult.sourceUrl,/\/municipios\?uf=RS/);
assert.equal(municipalitiesResult.sourceUrl.includes("TEST_VALUE"),false);
assert.equal(discoveryCalls[0]?.init?.headers?.authorization,"Bearer TEST_VALUE");

const culturesResult=await fetchAgritecMunicipalityCultures({
  accessToken:"TEST_VALUE",
  ibgeMunicipalityCode:"4314100",
  now:()=>new Date("2026-10-07T20:01:00Z"),
  fetchImpl:async(url,init)=>{
    discoveryCalls.push({url,init});
    return response({json:culturesPayload});
  },
});
assert.equal(culturesResult.cultures.length,1,"somente culturas com zoneamento devem seguir");
assert.equal(culturesResult.cultures[0]?.id,60);
assert.match(culturesResult.sourceUrl,/\/municipios\/4314100\/culturas$/);
assert.equal(discoveryCalls[1]?.init?.headers?.authorization,"Bearer TEST_VALUE");

await assert.rejects(
  fetchAgritecMunicipalities({
    accessToken:"",
    stateCode:"RS",
    fetchImpl:async()=>response({json:municipalitiesPayload}),
  }),
  /AGROAPI_ACCESS_TOKEN_REQUIRED/,
);

const calls=[];
const result=await fetchAgritecZarcWindows({
  accessToken:"TEST_VALUE",
  agritecCultureId:42,
  ibgeMunicipalityCode:"3509502",
  now:()=>new Date("2026-09-21T00:30:00Z"),
  fetchImpl:async(url,init)=>{
    calls.push({url,init});
    return response({json:payload});
  },
});
assert.equal(result.provider,"EMBRAPA_AGRITEC_V2");
assert.equal(result.retrievedAt,"2026-09-21T00:30:00.000Z");
assert.equal(result.windows.length,2);
assert.match(result.sourceUrl,/\/agritec\/v2\/zoneamento\?/);
assert.match(result.sourceUrl,/idCultura=42/);
assert.match(result.sourceUrl,/codigoIBGE=3509502/);
assert.match(result.sourceUrl,/risco=todos/);
assert.equal(result.sourceUrl.includes("TEST_VALUE"),false);
assert.equal(calls[0]?.init?.headers?.authorization,"Bearer TEST_VALUE");
assert.equal(calls[0]?.init?.cache,"no-store");

await assert.rejects(
  fetchAgritecZarcWindows({
    accessToken:"TEST_VALUE",agritecCultureId:42,ibgeMunicipalityCode:"3509502",
    fetchImpl:async()=>response({ok:false,status:401}),
  }),
  /AGRITEC_AUTHORIZATION_FAILED/,
);

await assert.rejects(
  fetchAgritecZarcWindows({
    accessToken:"",agritecCultureId:42,ibgeMunicipalityCode:"3509502",
    fetchImpl:async()=>response(),
  }),
  /AGROAPI_ACCESS_TOKEN_REQUIRED/,
);

await assert.rejects(
  fetchAgritecZarcWindows({
    accessToken:"TEST_VALUE",agritecCultureId:0,ibgeMunicipalityCode:"3509502",
    fetchImpl:async()=>response(),
  }),
  /AGRITEC_CULTURE_ID_INVALID/,
);

await assert.rejects(
  fetchAgritecZarcWindows({
    accessToken:"TEST_VALUE",agritecCultureId:42,ibgeMunicipalityCode:"350950",
    fetchImpl:async()=>response(),
  }),
  /AGRITEC_IBGE_CODE_INVALID/,
);

console.log("embrapa-agritec-zarc-provider: auth, semântica ZARC e proveniência sem vazamento validados");
