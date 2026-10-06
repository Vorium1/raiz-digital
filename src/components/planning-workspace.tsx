"use client";
import { useMemo, useState } from "react";

type Field={id:string;name:string;areaHa:number|null};
type BaseAnalysis={
  id:string;
  code:string;
  fieldId:string;
  fieldName:string;
  seasonLabel:string;
  currentCrop:string|null;
  createdAt:string;
  resultCount:number;
};
type Scenario={id:string;name:string;fieldName:string;areaHa:number|null;cropCount:number;status:string;baseEvidenceReady?:boolean};

export function PlanningWorkspace({
  fields,
  baseAnalyses,
  initial,
}:{
  fields:Field[];
  baseAnalyses:BaseAnalysis[];
  initial:Scenario[];
}){
  const [scenarios]=useState(initial);
  const [name,setName]=useState("");
  const [fieldId,setFieldId]=useState(fields[0]?.id??"");
  const [baseAnalysisId,setBaseAnalysisId]=useState("");
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  const analysesForField=useMemo(
    ()=>baseAnalyses.filter((analysis)=>analysis.fieldId===fieldId),
    [baseAnalyses,fieldId],
  );

  function changeField(nextFieldId:string){
    setFieldId(nextFieldId);
    setBaseAnalysisId((current)=>
      baseAnalyses.some((analysis)=>analysis.id===current&&analysis.fieldId===nextFieldId)
        ? current
        : ""
    );
  }

  async function create(){
    setSaving(true);
    setError("");
    try{
      const r=await fetch("/api/planning",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          name,
          fieldId,
          baseAnalysisId:baseAnalysisId||null,
        }),
      });
      const p=await r.json();
      if(!r.ok)throw new Error(p.error);
      location.assign(`/planejamento/${p.scenario.id}`);
    }catch(e){
      setError(e instanceof Error?e.message:"Falha ao criar.");
    }finally{
      setSaving(false);
    }
  }

  return <div className="simple-home">
    <header className="simple-home-head">
      <div>
        <span>SIMULAÇÃO TÉCNICA</span>
        <h1>Planejamento plurissafras</h1>
        <p>Organize a sequência de cultivos. Não substitui a prescrição oficial de cada safra.</p>
      </div>
    </header>

    <section className="card" style={{padding:20}}>
      <h2>Novo planejamento</h2>
      <label>Nome
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Rotação 2027–2028"/>
      </label>
      <label>Talhão
        <select value={fieldId} onChange={e=>changeField(e.target.value)}>
          {fields.map(f=><option key={f.id} value={f.id}>{f.name}{f.areaHa?` · ${f.areaHa} ha`:""}</option>)}
        </select>
      </label>
      <label>Análise-base
        <select value={baseAnalysisId} onChange={e=>setBaseAnalysisId(e.target.value)}>
          <option value="">Sem análise-base — cálculo ficará bloqueado por evidência</option>
          {analysesForField.map(analysis=>
            <option key={analysis.id} value={analysis.id}>
              {analysis.code} · {analysis.seasonLabel}{analysis.currentCrop?` · ${analysis.currentCrop}`:""} · {analysis.resultCount} resultado{analysis.resultCount===1?"":"s"}
            </option>
          )}
        </select>
      </label>
      {fieldId&&analysesForField.length===0&&
        <p className="agro-message warning">Este talhão ainda não possui análise disponível para usar como evidência-base. O cenário pode ser criado, mas permanecerá fail-closed.</p>}
      <button className="button" disabled={!name.trim()||!fieldId||saving} onClick={create}>{saving?"Criando…":"Novo planejamento"}</button>
      {error&&<p role="alert">{error}</p>}
    </section>

    <section>
      <h2>Planejamentos</h2>
      {scenarios.length===0
        ?<p>Nenhum planejamento criado neste tenant.</p>
        :<div className="card-list">{scenarios.map(s=>
          <a className="card" style={{padding:16}} key={s.id} href={`/planejamento/${s.id}`}>
            <strong>{s.name}</strong>
            <span>{s.fieldName} · {s.areaHa??"—"} ha · {s.cropCount} cultivos · {s.status}</span>
          </a>
        )}</div>}
    </section>
  </div>;
}
