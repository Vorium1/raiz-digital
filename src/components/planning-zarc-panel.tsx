"use client";

import { useState } from "react";

type ZarcAssessment={
  status:"CONSENSUS_RISK"|"VARIABLE_BY_SOIL_OR_CYCLE"|"NOT_INDICATED"|"SEASON_MISMATCH";
  plannedDate:string;
  seasonStartYear:number|null;
  seasonEndYear:number|null;
  candidateWindowCount:number;
  matchingWindowCount:number;
  riskLevelsPct:number[];
  sourcePortarias:string[];
  cycleLabels:string[];
  soilLabels:string[];
  unresolvedDimensions:Array<"CYCLE"|"SOIL">;
  warning:"ZARC_RISK_IS_NOT_YIELD_FORECAST";
};

type ZarcSnapshot={
  id:string;
  provider:string;
  providerVersion:string;
  sourceUrls:string[];
  retrievedAt:string;
  municipalityName:string;
  stateCode:string;
  ibgeMunicipalityCode:string;
  cropCode:string;
  agritecCultureId:number;
  plannedDate:string;
  assessment:ZarcAssessment;
  sourceScenarioUpdatedAt?:string;
  sourceCropUpdatedAt?:string;
  createdAt:string;
  current?:boolean;
};

function dateTime(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:date.toLocaleString("pt-BR");
}

function assessmentLabel(snapshot:ZarcSnapshot){
  const assessment=snapshot.assessment;
  if(assessment.status==="CONSENSUS_RISK"){
    return `ZARC oficial · risco ${assessment.riskLevelsPct[0]}%`;
  }
  if(assessment.status==="VARIABLE_BY_SOIL_OR_CYCLE"){
    return `ZARC varia ${assessment.riskLevelsPct.join("–")}% conforme solo/ciclo`;
  }
  if(assessment.status==="NOT_INDICATED"){
    return "Data não indicada nas janelas ZARC retornadas";
  }
  return "Safra/data não corresponde às janelas oficiais retornadas";
}

export function PlanningZarcPanel({
  scenarioId,
  cropId,
}:{scenarioId:string;cropId:string}){
  const [open,setOpen]=useState(false);
  const [snapshots,setSnapshots]=useState<ZarcSnapshot[]|null>(null);
  const [canRefresh,setCanRefresh]=useState(false);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    setLoading(true);
    setMessage("");
    try{
      const response=await fetch(
        `/api/planning/${scenarioId}/crops/${cropId}/zarc`,
        {cache:"no-store"},
      );
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error??"Não foi possível carregar o ZARC.");
      setSnapshots(data.snapshots??[]);
      setCanRefresh(data.canRefresh===true);
    }catch(error){
      setMessage(error instanceof Error?error.message:"Falha ao carregar o ZARC.");
    }finally{
      setLoading(false);
    }
  }

  async function toggle(){
    const next=!open;
    setOpen(next);
    if(next&&snapshots==null)await load();
  }

  async function refresh(){
    setBusy(true);
    setMessage("");
    try{
      const response=await fetch(
        `/api/planning/${scenarioId}/crops/${cropId}/zarc`,
        {method:"POST"},
      );
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        const code=data.details?.code;
        if(code==="AGROAPI_ACCESS_TOKEN_REQUIRED"){
          throw new Error("ZARC oficial indisponível neste ambiente: credencial Agritec/Embrapa não configurada. O cálculo de solo e nutrientes continua normal.");
        }
        throw new Error(data.error??"Não foi possível atualizar o ZARC.");
      }
      const current={...(data.snapshot as ZarcSnapshot),current:true};
      setSnapshots((existing)=>[
        current,
        ...(existing??[]).map((item)=>({...item,current:false})),
      ]);
      setMessage("Evidência ZARC oficial congelada para a versão atual deste cultivo.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"Falha ao consultar a fonte oficial.");
    }finally{
      setBusy(false);
    }
  }

  const current=snapshots?.find((snapshot)=>snapshot.current)??null;

  return <div className="card" style={{padding:12,marginTop:10}}>
    <button className="button secondary" onClick={()=>void toggle()}>
      {open?"Fechar clima e risco":"Clima e risco · ZARC"}
    </button>

    {open&&<div style={{marginTop:10}}>
      <p>
        <strong>ZARC é zoneamento de risco de plantio.</strong>{" "}
        Não é previsão de produtividade e não aumenta ou reduz dose de fertilizante automaticamente.
      </p>
      {loading&&<p>Carregando evidência oficial…</p>}
      {message&&<p><small>{message}</small></p>}

      {!loading&&current&&<div className="review-summary">
        <span>{current.municipalityName}/{current.stateCode} · {current.plannedDate}</span>
        <strong>{assessmentLabel(current)}</strong>
        <small>
          Fonte {current.provider} {current.providerVersion} · consultado em {dateTime(current.retrievedAt)}
        </small>
        {current.assessment.unresolvedDimensions.length>0&&
          <small>
            Dimensões ainda abertas: {current.assessment.unresolvedDimensions.join(", ")}.
            A RAIZ preserva o envelope e não escolhe solo/ciclo por suposição.
          </small>}
        {current.assessment.sourcePortarias.length>0&&
          <small>Portaria(s): {current.assessment.sourcePortarias.join(" · ")}</small>}
      </div>}

      {!loading&&!current&&snapshots&&
        <p className="report-empty-note">
          Ainda não existe evidência ZARC corrente para esta versão do cultivo.
          Evidência antiga, quando existir, permanece apenas no histórico.
        </p>}

      {canRefresh&&<button className="button" disabled={busy} onClick={()=>void refresh()}>
        {busy?"Consultando Embrapa…":"Atualizar ZARC oficial"}
      </button>}

      {snapshots&&snapshots.length>0&&<details style={{marginTop:10}}>
        <summary>Histórico ZARC ({snapshots.length})</summary>
        {snapshots.map((snapshot)=><div key={snapshot.id} style={{padding:"8px 0"}}>
          <strong>{snapshot.current?"Atual · ":"Histórico · "}{assessmentLabel(snapshot)}</strong>
          <small style={{display:"block"}}>
            Consulta {dateTime(snapshot.retrievedAt)} · evidência congelada {dateTime(snapshot.createdAt)}
          </small>
        </div>)}
      </details>}
    </div>}
  </div>;
}
