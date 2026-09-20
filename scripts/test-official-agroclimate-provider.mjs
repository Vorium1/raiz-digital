import assert from "node:assert/strict";
import {
  MAPA_ZARC_CKAN_PACKAGE_URL,
  MAPA_ZARC_DATASET_ID,
  fetchCptecSevenDayMetricEvidence,
  fetchMapaZarcSeasonResource,
  selectMapaZarcSeasonResource,
} from "../src/lib/agroclimate/official-source-provider.ts";

function response({
  ok=true,status=200,text="",json=null,
}={}) {
  return {
    ok,status,
    async text(){return text;},
    async json(){return json;},
    headers:{get(){return null;}},
  };
}

const cptecCalls=[];
const cptec=await fetchCptecSevenDayMetricEvidence({
  latitude:-28.26,
  longitude:-52.41,
  utcOffset:"-03:00",
  technicalRegionCodes:["BR-RS","RS-PLANALTO-MEDIO"],
  now:()=>new Date("2026-09-20T23:58:00Z"),
  fetchImpl:async (url,init)=>{
    cptecCalls.push({url,init});
    return response({text:`<cidade>
      <nome>Passo Fundo</nome><uf>RS</uf><atualizacao>2026-09-20</atualizacao>
      <previsao><dia>2026-09-21</dia><tempo>pn</tempo><maxima>26</maxima><minima>13</minima><iuv>7</iuv></previsao>
    </cidade>`});
  },
});
assert.equal(cptec.provider,"CPTEC_INPE");
assert.equal(cptec.retrievedAt,"2026-09-20T23:58:00.000Z");
assert.equal(cptec.evidence.length,2);
assert.equal(cptec.evidence[0]?.metric,"DAY_MAX_TEMP_C");
assert.equal(cptec.evidence[1]?.metric,"DAY_MIN_TEMP_C");
assert.equal(cptec.evidence.some(item=>item.metric==="GLOBAL_SOLAR_RADIATION_MJ_M2_DAY"),false);
assert.ok(cptec.warnings.includes("CPTEC_IUV_IS_UV_INDEX_NOT_GLOBAL_SOLAR_RADIATION"));
assert.match(cptecCalls[0]?.url ?? "",/servicos\.cptec\.inpe\.br\/XML\/cidade\/7dias\//);
assert.equal(cptecCalls[0]?.init?.cache,"no-store");
assert.equal(cptecCalls[0]?.init?.headers?.accept,"application/xml,text/xml;q=0.9,*/*;q=0.1");

await assert.rejects(
  fetchCptecSevenDayMetricEvidence({
    latitude:-28.26,longitude:-52.41,utcOffset:"-03:00",technicalRegionCodes:["BR-RS"],
    fetchImpl:async()=>response({ok:false,status:503}),
  }),
  /CPTEC_HTTP_503/,
);

const zarcPayload={
  success:true,
  result:{
    id:MAPA_ZARC_DATASET_ID,
    metadata_modified:"2026-09-19T10:20:30.000000",
    resources:[
      {
        id:"139e5a60-1f43-4cc8-aeab-a35dbbf816c0",
        name:"Tábua de risco - Safra 2026/2027",
        format:"CSV",
        state:"active",
        url:"https://dados.agricultura.gov.br/dataset/6d3d141c-885e-41a4-ab7f-dc8ff323b96f/resource/139e5a60-1f43-4cc8-aeab-a35dbbf816c0/download/tabua-risco-2026-2027.csv",
        last_modified:"2026-09-19T08:00:00.000000",
        revision_id:"revision-2026-09-19",
        url_type:"upload",
      },
      {
        id:"old",
        name:"Tábua de risco - Safra 2025/2026",
        format:"CSV",
        url:"https://dados.agricultura.gov.br/old.csv",
      },
    ],
  },
};
const selected=selectMapaZarcSeasonResource(zarcPayload,2026,2027);
assert.equal(selected.resourceId,"139e5a60-1f43-4cc8-aeab-a35dbbf816c0");
assert.equal(selected.datasetId,MAPA_ZARC_DATASET_ID);
assert.equal(selected.format,"CSV");
assert.equal(selected.lastModified,"2026-09-19T08:00:00.000000");
assert.equal(selected.revisionId,"revision-2026-09-19");
assert.equal(selected.catalogMetadataModified,"2026-09-19T10:20:30.000000");
assert.match(selected.downloadUrl,/^https:\/\/dados\.agricultura\.gov\.br\//);

const zarcCalls=[];
const fetched=await fetchMapaZarcSeasonResource({
  seasonStartYear:2026,
  seasonEndYear:2027,
  fetchImpl:async(url,init)=>{
    zarcCalls.push({url,init});
    return response({json:zarcPayload});
  },
});
assert.equal(fetched.resourceId,selected.resourceId);
assert.equal(zarcCalls[0]?.url,MAPA_ZARC_CKAN_PACKAGE_URL);
assert.equal(zarcCalls[0]?.init?.cache,"no-store");
assert.equal(zarcCalls[0]?.init?.headers?.accept,"application/json");

assert.throws(
  ()=>selectMapaZarcSeasonResource({
    ...zarcPayload,
    result:{
      ...zarcPayload.result,
      resources:[{
        ...zarcPayload.result.resources[0],
        url:"https://evil.example/zarc.csv",
      }],
    },
  },2026,2027),
  /ZARC_RESOURCE_URL_NOT_OFFICIAL_MAPA/,
);

assert.throws(
  ()=>selectMapaZarcSeasonResource({
    ...zarcPayload,
    result:{
      ...zarcPayload.result,
      resources:[
        zarcPayload.result.resources[0],
        {...zarcPayload.result.resources[0],id:"duplicate"},
      ],
    },
  },2026,2027),
  /ZARC_SEASON_RESOURCE_AMBIGUOUS/,
);

assert.throws(
  ()=>selectMapaZarcSeasonResource(zarcPayload,2026,2028),
  /ZARC_SEASON_INVALID/,
);

assert.throws(
  ()=>selectMapaZarcSeasonResource({
    ...zarcPayload,
    result:{...zarcPayload.result,resources:[]},
  },2026,2027),
  /ZARC_SEASON_RESOURCE_NOT_FOUND/,
);

await assert.rejects(
  fetchMapaZarcSeasonResource({
    seasonStartYear:2026,seasonEndYear:2027,
    fetchImpl:async()=>response({ok:false,status:502}),
  }),
  /ZARC_CKAN_HTTP_502/,
);

console.log("official-agroclimate-provider: fetch CPTEC e catálogo ZARC mantêm proveniência e fail-closed");
