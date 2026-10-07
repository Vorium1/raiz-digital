"use client";

import { useState } from "react";

type Crop={
  id:string;
  position:number;
  cropCode:string;
  seasonLabel:string;
  plannedDate:string|null;
  targetYield:number|null;
  targetUnit:string|null;
  irrigated:boolean|null;
  notes:string;
};

type Scenario={
  id:string;
  name:string;
  fieldName:string;
  propertyName?:string|null;
  clientName?:string|null;
  areaHa:number|null;
  baseAnalysisId:string|null;
  baseAnalysisCode?:string|null;
  baseAnalysisSampledFrom?:string|null;
  baseAnalysisSampledTo?:string|null;
  baseAnalysisReceivedFrom?:string|null;
  baseAnalysisReceivedTo?:string|null;
  baseEvidenceReady:boolean;
  irrigated:boolean|null;
  notes:string;
  managementSystem:string|null;
  irrigationType:string|null;
  irrigationCapacityNotes:string|null;
  waterAvailabilityNotes:string|null;
  knownRestrictions:string|null;
  previousCrop:string|null;
  recentCropHistory:string|null;
  lastSoilCorrection:string|null;
  fertilizationHistory:string|null;
  organicInputs:string|null;
  crops:Crop[];
};

function technicalDateLabel(from:string|null|undefined,to:string|null|undefined){
  if(!from)return "data técnica não registrada";
  const first=new Date(`${from}T12:00:00Z`).toLocaleDateString("pt-BR");
  if(!to||to===from)return first;
  return `${first}–${new Date(`${to}T12:00:00Z`).toLocaleDateString("pt-BR")}`;
}

function triState(value:boolean|null|undefined){
  return value===true?"yes":value===false?"no":"unknown";
}

function fromTriState(value:string):boolean|null{
  return value==="yes"?true:value==="no"?false:null;
}

export function PlanningScenarioEditor({
  scenario:initialScenario,
  initialSnapshots,
}:{
  scenario:Scenario;
  initialSnapshots:any[];
}){
  const [scenario,setScenario]=useState(initialScenario);
  const [scenarioDraft,setScenarioDraft]=useState({...initialScenario});
  const [crops,setCrops]=useState<Crop[]>(initialScenario.crops);
  const [results,setResults]=useState<any[]>([]);
  const [snapshots,setSnapshots]=useState(initialSnapshots);
  const [selectedSnapshot,setSelectedSnapshot]=useState<any|null>(null);
  const [cropCode,setCropCode]=useState("SOYBEAN");
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<any>({});
  const [error,setError]=useState("");
  const [savingScenario,setSavingScenario]=useState(false);

  const call=async(path:string,method:string,body?:unknown)=>{
    const r=await fetch(path,{
      method,
      headers:body?{"content-type":"application/json"}:undefined,
      body:body?JSON.stringify(body):undefined,
    });
    const p=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(p.error??"Operação não concluída.");
    return p;
  };

  const refresh=async()=>{
    const p=await call(`/api/planning/${scenario.id}`,"GET");
    setScenario(p.scenario);
    setScenarioDraft(p.scenario);
    setCrops(p.scenario.crops);
    setResults([]);
  };

  async function saveScenarioContext(){
    setSavingScenario(true);
    setError("");
    try{
      const p=await call(`/api/planning/${scenario.id}`,"PATCH",{
        name:scenarioDraft.name,
        irrigated:scenarioDraft.irrigated,
        notes:scenarioDraft.notes,
        managementSystem:scenarioDraft.managementSystem,
        irrigationType:scenarioDraft.irrigationType,
        irrigationCapacityNotes:scenarioDraft.irrigationCapacityNotes,
        waterAvailabilityNotes:scenarioDraft.waterAvailabilityNotes,
        knownRestrictions:scenarioDraft.knownRestrictions,
        previousCrop:scenarioDraft.previousCrop,
        recentCropHistory:scenarioDraft.recentCropHistory,
        lastSoilCorrection:scenarioDraft.lastSoilCorrection,
        fertilizationHistory:scenarioDraft.fertilizationHistory,
        organicInputs:scenarioDraft.organicInputs,
      });
      setScenario((current)=>({...current,...p.scenario,crops:current.crops}));
      setScenarioDraft((current)=>({...current,...p.scenario,crops:current.crops}));
      setResults([]);
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setSavingScenario(false);
    }
  }

  async function add(){
    try{
      await call(`/api/planning/${scenario.id}/crops`,"POST",{cropCode,seasonLabel:"Planejado"});
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  async function save(crop:Crop){
    try{
      const targetYield=draft.targetYield===""||draft.targetYield==null?null:Number(draft.targetYield);
      if(targetYield!=null&&(!Number.isFinite(targetYield)||targetYield<=0)){
        throw new Error("Meta de produtividade deve ser maior que zero.");
      }
      await call(`/api/planning/${scenario.id}/crops/${crop.id}`,"PATCH",{
        ...crop,
        ...draft,
        targetYield,
        plannedDate:draft.plannedDate||null,
        irrigated:fromTriState(triState(draft.irrigated)),
      });
      setEditing(null);
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  async function remove(id:string){
    try{
      await call(`/api/planning/${scenario.id}/crops/${id}`,"DELETE");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  async function move(index:number,delta:number){
    const next=[...crops];
    const target=index+delta;
    if(target<0||target>=next.length)return;
    [next[index],next[target]]=[next[target],next[index]];
    try{
      await call(`/api/planning/${scenario.id}/reorder`,"POST",{cropIds:next.map(item=>item.id)});
      setCrops(next.map((item,position)=>({...item,position})));
      setResults([]);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  async function calculate(){
    try{
      setError("");
      setResults((await call(`/api/planning/${scenario.id}/calculate`,"POST")).results);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  async function snapshot(){
    try{
      setError("");
      const p=await call(`/api/planning/${scenario.id}/snapshots`,"POST");
      setSnapshots([p.snapshot,...snapshots]);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  async function openSnapshot(snapshotId:string){
    try{
      setError("");
      const p=await call(`/api/planning/${scenario.id}/snapshots/${snapshotId}`,"GET");
      setSelectedSnapshot(p.snapshot);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  return <>
    <section className="card" style={{padding:16,marginBottom:16}}>
      <h2>Contexto declarado do cenário</h2>
      <p>
        Estes campos registram o que foi informado para o planejamento.
        Eles não criam doses, clima ou efeito residual por conta própria.
      </p>
      <div className="form-grid">
        <label>Nome
          <input value={scenarioDraft.name??""} onChange={e=>setScenarioDraft({...scenarioDraft,name:e.target.value})}/>
        </label>
        <label>Área irrigada
          <select
            value={triState(scenarioDraft.irrigated)}
            onChange={e=>setScenarioDraft({...scenarioDraft,irrigated:fromTriState(e.target.value)})}
          >
            <option value="unknown">Não informado</option>
            <option value="yes">Sim</option>
            <option value="no">Não</option>
          </select>
        </label>
        <label>Sistema de manejo/calagem
          <input value={scenarioDraft.managementSystem??""} onChange={e=>setScenarioDraft({...scenarioDraft,managementSystem:e.target.value})} placeholder="Informado pelo responsável"/>
        </label>
        <label>Tipo de irrigação
          <input value={scenarioDraft.irrigationType??""} onChange={e=>setScenarioDraft({...scenarioDraft,irrigationType:e.target.value})} placeholder="Não inferir se ausente"/>
        </label>
        <label>Capacidade/limitação de irrigação
          <textarea value={scenarioDraft.irrigationCapacityNotes??""} onChange={e=>setScenarioDraft({...scenarioDraft,irrigationCapacityNotes:e.target.value})}/>
        </label>
        <label>Disponibilidade hídrica
          <textarea value={scenarioDraft.waterAvailabilityNotes??""} onChange={e=>setScenarioDraft({...scenarioDraft,waterAvailabilityNotes:e.target.value})}/>
        </label>
        <label>Restrições conhecidas
          <textarea value={scenarioDraft.knownRestrictions??""} onChange={e=>setScenarioDraft({...scenarioDraft,knownRestrictions:e.target.value})}/>
        </label>
        <label>Cultura anterior
          <input value={scenarioDraft.previousCrop??""} onChange={e=>setScenarioDraft({...scenarioDraft,previousCrop:e.target.value})}/>
        </label>
        <label>Histórico recente de culturas
          <textarea value={scenarioDraft.recentCropHistory??""} onChange={e=>setScenarioDraft({...scenarioDraft,recentCropHistory:e.target.value})}/>
        </label>
        <label>Última correção/calagem
          <textarea value={scenarioDraft.lastSoilCorrection??""} onChange={e=>setScenarioDraft({...scenarioDraft,lastSoilCorrection:e.target.value})}/>
        </label>
        <label>Histórico de adubação e fontes
          <textarea value={scenarioDraft.fertilizationHistory??""} onChange={e=>setScenarioDraft({...scenarioDraft,fertilizationHistory:e.target.value})}/>
        </label>
        <label>Matéria orgânica / insumos orgânicos declarados
          <textarea value={scenarioDraft.organicInputs??""} onChange={e=>setScenarioDraft({...scenarioDraft,organicInputs:e.target.value})}/>
        </label>
        <label>Observações gerais
          <textarea value={scenarioDraft.notes??""} onChange={e=>setScenarioDraft({...scenarioDraft,notes:e.target.value})}/>
        </label>
      </div>
      <button className="button" disabled={savingScenario||!scenarioDraft.name?.trim()} onClick={saveScenarioContext}>
        {savingScenario?"Salvando…":"Salvar contexto"}
      </button>
      <p>
        <strong>Origem:</strong> {scenario.clientName??"Cliente não disponível"} · {scenario.propertyName??"Propriedade não disponível"} · {scenario.fieldName} · {scenario.areaHa??"—"} ha
      </p>
      <p>
        <strong>Análise-base:</strong>{" "}
        {scenario.baseAnalysisId
          ? `${scenario.baseAnalysisCode??scenario.baseAnalysisId.slice(0,8)} · amostragem ${technicalDateLabel(scenario.baseAnalysisSampledFrom,scenario.baseAnalysisSampledTo)} · ${scenario.baseEvidenceReady?"evidência laboratorial disponível":"sem resultado laboratorial utilizável"}`
          :"não vinculada"}
      </p>
    </section>

    <section className="card" style={{padding:16}}>
      <label>Adicionar cultura
        <select value={cropCode} onChange={e=>setCropCode(e.target.value)}>
          <option value="SOYBEAN">Soja</option>
          <option value="WHEAT">Trigo</option>
          <option value="RICE">Arroz</option>
          <option value="UNSUPPORTED">Outra / sem regra homologada</option>
        </select>
      </label>
      <button className="button" onClick={add}>Adicionar cultivo</button>
      <button className="button" onClick={calculate}>Calcular simulação</button>
      <button className="button" onClick={snapshot}>Criar snapshot</button>
      {error&&<p role="alert">{error}</p>}
    </section>

    <section>
      <h2>Linha do tempo</h2>
      {crops.map((crop,index)=>
        <article className="card" style={{padding:16,margin:"10px 0"}} key={crop.id}>
          <strong>{index+1}. {crop.cropCode}</strong>
          {editing===crop.id
            ?<div className="form-grid">
              <label>Cultura
                <input value={draft.cropCode??crop.cropCode} onChange={e=>setDraft({...draft,cropCode:e.target.value})}/>
              </label>
              <label>Safra / janela
                <input value={draft.seasonLabel??crop.seasonLabel} onChange={e=>setDraft({...draft,seasonLabel:e.target.value})}/>
              </label>
              <label>Data prevista
                <input type="date" value={draft.plannedDate??crop.plannedDate??""} onChange={e=>setDraft({...draft,plannedDate:e.target.value})}/>
              </label>
              <label>Meta de produtividade
                <input type="number" step="any" min="0" value={draft.targetYield??crop.targetYield??""} onChange={e=>setDraft({...draft,targetYield:e.target.value})}/>
              </label>
              <label>Unidade da meta
                <input value={draft.targetUnit??crop.targetUnit??""} onChange={e=>setDraft({...draft,targetUnit:e.target.value})}/>
              </label>
              <label>Condição hídrica
                <select
                  value={triState(draft.irrigated??crop.irrigated)}
                  onChange={e=>setDraft({...draft,irrigated:fromTriState(e.target.value)})}
                >
                  <option value="unknown">Não informado</option>
                  <option value="yes">Irrigado</option>
                  <option value="no">Sequeiro</option>
                </select>
              </label>
              <label>Observações operacionais
                <textarea value={draft.notes??crop.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/>
              </label>
              <div>
                <button className="button" onClick={()=>save(crop)}>Salvar cultivo</button>
                <button className="button secondary" onClick={()=>setEditing(null)}>Cancelar</button>
              </div>
            </div>
            :<>
              <p>
                {crop.seasonLabel||"Janela não informada"} · {crop.plannedDate||"data não informada"} ·
                Meta: {crop.targetYield??"UNKNOWN"} {crop.targetUnit??""} ·
                {crop.irrigated===true?" irrigado":crop.irrigated===false?" sequeiro":" condição hídrica UNKNOWN"}
              </p>
              <button onClick={()=>{setDraft({...crop});setEditing(crop.id)}}>Editar</button>
              <button onClick={()=>move(index,-1)} disabled={index===0}>↑</button>
              <button onClick={()=>move(index,1)} disabled={index===crops.length-1}>↓</button>
              <button onClick={()=>remove(crop.id)}>Remover</button>
            </>}
        </article>
      )}
    </section>

    {results.length>0&&<section>
      <h2>Resultados da simulação</h2>
      {results.map(result=>
        <article className="card" style={{padding:14,margin:"8px 0"}} key={result.position}>
          <strong>{result.crop.cropCode}: {result.status}</strong>
          <p>{result.reanalysisRequired?"NOVA ANÁLISE NECESSÁRIA":result.limitations.join(" · ")||"Requisitos disponíveis para revisão."}</p>
          {result.status!=="UNSUPPORTED"&&!result.reanalysisRequired&&
            <a className="button" href={`/calculadoras?area=${scenario.areaHa??""}`}>Abrir calculadora comercial</a>}
        </article>
      )}
    </section>}

    <section>
      <h2>Snapshots imutáveis</h2>
      {snapshots.map(snapshot=>
        <div key={snapshot.id} className="card" style={{padding:12,margin:"8px 0"}}>
          <strong>{snapshot.createdAt}</strong>
          <small style={{display:"block",overflowWrap:"anywhere"}}>{snapshot.sha256}</small>
          <button className="button secondary" onClick={()=>openSnapshot(snapshot.id)}>Abrir snapshot</button>
        </div>
      )}
      {selectedSnapshot&&
        <article className="card" style={{padding:16,marginTop:12}}>
          <h3>Snapshot congelado</h3>
          <p>
            Integridade: <strong>{selectedSnapshot.integrity==="VERIFIED"?"SHA-256 verificado":"snapshot legado — hash canônico indisponível"}</strong>
          </p>
          <p>
            Cenário: {selectedSnapshot.payload?.scenario?.name??"—"} ·
            {selectedSnapshot.payload?.scenario?.fieldName??"—"} ·
            versão {selectedSnapshot.payload?.version??1}
          </p>
          <p>
            Evidência-base: {selectedSnapshot.payload?.scenario?.baseEvidenceReady?"disponível":"insuficiente/ausente"}.
            O conteúdo exibido é o payload persistido, não o estado atual do cenário.
          </p>
          <ul>
            {(selectedSnapshot.payload?.calculation?.results??[]).map((result:any)=>
              <li key={result.position}>{result.crop?.cropCode??"Cultura"} · {result.status}</li>
            )}
          </ul>
          <button className="button secondary" onClick={()=>setSelectedSnapshot(null)}>Fechar snapshot</button>
        </article>
      }
    </section>
  </>;
}
