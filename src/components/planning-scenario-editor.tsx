"use client";

import { useState } from "react";
import { PlanningCommercialPanel } from "@/components/planning-commercial-panel";
import { PlanningZarcPanel } from "@/components/planning-zarc-panel";
import { PlanningRiceResponseFields, type PlanningRiceResponseClass } from "@/components/planning-rice-response-fields";

type Crop={
  id:string;
  position:number;
  cropCode:string;
  seasonLabel:string;
  plannedDate:string|null;
  targetYield:number|null;
  targetUnit:string|null;
  irrigated:boolean|null;
  riceResponseClass?:PlanningRiceResponseClass|null;
  riceResponseClassApproved?:boolean;
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
  yearsSinceLastLiming:number|null;
  limingYieldBelowLocalAverageDrought:boolean|null;
  limingCompactionRestrictsRootGrowth:boolean|null;
  limingPhosphorus10To20BelowCritical:boolean|null;
  limingAgronomistConfirmedIncorporation:boolean|null;
  irrigationType:string|null;
  irrigationCapacityNotes:string|null;
  waterAvailabilityNotes:string|null;
  knownRestrictions:string|null;
  previousCrop:string|null;
  previousCropCode:"SOYBEAN"|"CORN"|"OTHER"|null;
  recentCropHistory:string|null;
  lastSoilCorrection:string|null;
  fertilizationHistory:string|null;
  organicInputs:string|null;
  crops:Crop[];
};

function pkTargetLabel(target:any){
  if(!target?.ready)return `bloqueado · ${(target?.blockers??[]).join(" · ")||"sem dose determinística"}`;
  if(target.minimumKgPerHa!==target.maximumKgPerHa){
    return `${target.minimumKgPerHa}–${target.maximumKgPerHa} kg/ha`;
  }
  return `${target.doseKgPerHa} kg/ha`;
}

function micronutrientLabel(decision:any){
  if(!decision)return "não disponível";
  if(decision.status==="NOT_AVAILABLE")return "não disponível";
  if(decision.status==="BLOCKED")return `bloqueado · ${(decision.blockers??[]).join(" · ")}`;
  if(decision.status==="UNIFORM")return decision.classification??"sem classe";
  const classes=[...new Set((decision.pointClassifications??[]).map((point:any)=>point.classification).filter(Boolean))];
  return `espacial · ${classes.join(" / ")||"classes por ponto"}`;
}

function limingTargetLabel(target:any){
  if(!target)return "não calculado";
  if(!target.ready)return `bloqueado · ${(target.blockers??[]).join(" · ")||"sem decisão determinística"}`;
  if(target.status==="UNIFORM_NO_APPLY")return "não aplicar";
  if(target.methodScope==="LAYER_REQUIREMENT"){
    if(target.generalDoseTonHaPrnt100!=null){
      return `${target.generalDoseTonHaPrnt100} t/ha PRNT100 · necessidade da camada; aplicação não definida`;
    }
    if(target.minimumTonHaPrnt100!=null&&target.maximumTonHaPrnt100!=null){
      return `${target.minimumTonHaPrnt100}–${target.maximumTonHaPrnt100} t/ha PRNT100 · necessidade da camada; aplicação não definida`;
    }
    return "necessidade da camada disponível; aplicação não definida";
  }
  if(target.generalDoseTonHaPrnt100!=null)return `${target.generalDoseTonHaPrnt100} t/ha PRNT100`;
  if(target.minimumTonHaPrnt100!=null&&target.maximumTonHaPrnt100!=null){
    return `${target.minimumTonHaPrnt100}–${target.maximumTonHaPrnt100} t/ha PRNT100 · espacial`;
  }
  return target.status;
}

function nitrogenTargetLabel(target:any){
  if(!target?.ready)return `bloqueado · ${(target?.blockers??[]).join(" · ")||"sem dose determinística"}`;
  if(target.doseKind==="UPPER_BOUND")return `até ${target.maximumKgNPerHa} kg N/ha`;
  if(target.minimumKgNPerHa!==target.maximumKgNPerHa){
    return `${target.minimumKgNPerHa}–${target.maximumKgNPerHa} kg N/ha`;
  }
  return `${target.doseKgNPerHa} kg N/ha`;
}

function sulfurTargetLabel(target:any){
  if(!target?.ready)return `bloqueado · ${(target?.blockers??[]).join(" · ")||"sem dose determinística"}`;
  if(target.minimumKgSPerHa!==target.maximumKgSPerHa){
    return `${target.minimumKgSPerHa}–${target.maximumKgSPerHa} kg S/ha`;
  }
  return `${target.doseKgSPerHa} kg S/ha`;
}

function calculatorHref(nutrient:"P2O5"|"K2O"|"S"|"N",target:any,areaHa:number|null){
  const params=new URLSearchParams();
  if(areaHa!=null)params.set("area",String(areaHa));
  if(target?.ready)params.set("nutrient",nutrient);
  const minimum=target?.minimumKgPerHa??target?.minimumKgSPerHa??target?.minimumKgNPerHa??null;
  const maximum=target?.maximumKgPerHa??target?.maximumKgSPerHa??target?.maximumKgNPerHa??null;
  const dose=target?.doseKgPerHa??target?.doseKgSPerHa??target?.doseKgNPerHa??null;
  if(target?.ready&&minimum===maximum&&typeof dose==="number"&&dose>0){
    params.set("target",String(dose));
  }
  return `/calculadoras?${params.toString()}`;
}

function limingCalculatorHref(target:any,areaHa:number|null){
  const params=new URLSearchParams();
  params.set("mode","LIME");
  if(areaHa!=null)params.set("area",String(areaHa));
  if(target?.commercialTargetTonHaPrnt100!=null&&target.commercialTargetTonHaPrnt100>0){
    params.set("limeRequirement",String(target.commercialTargetTonHaPrnt100));
  }
  return `/calculadoras?${params.toString()}`;
}

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
  const [accumulatedPk,setAccumulatedPk]=useState<any|null>(null);
  const [accumulatedSulfur,setAccumulatedSulfur]=useState<any|null>(null);
  const [accumulatedNitrogen,setAccumulatedNitrogen]=useState<any|null>(null);
  const [initialLiming,setInitialLiming]=useState<any|null>(null);
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
    setAccumulatedPk(null);
    setAccumulatedSulfur(null);
    setAccumulatedNitrogen(null);
    setInitialLiming(null);
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
        yearsSinceLastLiming:scenarioDraft.yearsSinceLastLiming,
        limingYieldBelowLocalAverageDrought:scenarioDraft.limingYieldBelowLocalAverageDrought,
        limingCompactionRestrictsRootGrowth:scenarioDraft.limingCompactionRestrictsRootGrowth,
        limingPhosphorus10To20BelowCritical:scenarioDraft.limingPhosphorus10To20BelowCritical,
        limingAgronomistConfirmedIncorporation:scenarioDraft.limingAgronomistConfirmedIncorporation,
        irrigationType:scenarioDraft.irrigationType,
        irrigationCapacityNotes:scenarioDraft.irrigationCapacityNotes,
        waterAvailabilityNotes:scenarioDraft.waterAvailabilityNotes,
        knownRestrictions:scenarioDraft.knownRestrictions,
        previousCrop:scenarioDraft.previousCrop,
        previousCropCode:scenarioDraft.previousCropCode,
        recentCropHistory:scenarioDraft.recentCropHistory,
        lastSoilCorrection:scenarioDraft.lastSoilCorrection,
        fertilizationHistory:scenarioDraft.fertilizationHistory,
        organicInputs:scenarioDraft.organicInputs,
      });
      setScenario((current)=>({...current,...p.scenario,crops:current.crops}));
      setScenarioDraft((current)=>({...current,...p.scenario,crops:current.crops}));
      setResults([]);
      setAccumulatedPk(null);
      setAccumulatedSulfur(null);
      setAccumulatedNitrogen(null);
      setInitialLiming(null);
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
      setAccumulatedPk(null);
      setAccumulatedSulfur(null);
      setAccumulatedNitrogen(null);
      setInitialLiming(null);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  async function calculate(){
    try{
      setError("");
      const calculation=await call(`/api/planning/${scenario.id}/calculate`,"POST");
      setResults(calculation.results);
      setAccumulatedPk(calculation.accumulatedPk??null);
      setAccumulatedSulfur(calculation.accumulatedSulfur??null);
      setAccumulatedNitrogen(calculation.accumulatedNitrogen??null);
      setInitialLiming(calculation.initialLiming??null);
      setScenario((current)=>({...current,status:calculation.status}));
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
          <select
            value={scenarioDraft.managementSystem??""}
            onChange={e=>setScenarioDraft({...scenarioDraft,managementSystem:e.target.value||null})}
          >
            <option value="">Não informado</option>
            <option value="CONVENTIONAL">Preparo convencional</option>
            <option value="NO_TILL_ESTABLISHMENT">Implantação do plantio direto</option>
            <option value="NO_TILL_CONSOLIDATED_UNSPECIFIED">Plantio direto consolidado · condição 10–20 cm ainda não definida</option>
            <option value="NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS">Plantio direto consolidado · sem restrição em 10–20 cm</option>
            <option value="NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS">Plantio direto consolidado · com restrição em 10–20 cm</option>
            <option value="OTHER">Outro / não classificado</option>
          </select>
        </label>
        <label>Anos desde a última calagem
          <input
            type="number"
            min="0"
            step="0.1"
            value={scenarioDraft.yearsSinceLastLiming??""}
            onChange={e=>setScenarioDraft({
              ...scenarioDraft,
              yearsSinceLastLiming:e.target.value===""?null:Number(e.target.value),
            })}
            placeholder="Não informado"
          />
          <small>Campo estruturado; o texto livre de “última correção” não é convertido automaticamente em anos.</small>
        </label>
        <label>Produtividade abaixo da média local, especialmente em seca?
          <select
            value={triState(scenarioDraft.limingYieldBelowLocalAverageDrought)}
            onChange={e=>setScenarioDraft({...scenarioDraft,limingYieldBelowLocalAverageDrought:fromTriState(e.target.value)})}
          >
            <option value="unknown">Não avaliado</option><option value="yes">Sim</option><option value="no">Não</option>
          </select>
        </label>
        <label>Compactação restringe raízes em profundidade?
          <select
            value={triState(scenarioDraft.limingCompactionRestrictsRootGrowth)}
            onChange={e=>setScenarioDraft({...scenarioDraft,limingCompactionRestrictsRootGrowth:fromTriState(e.target.value)})}
          >
            <option value="unknown">Não avaliado</option><option value="yes">Sim</option><option value="no">Não</option>
          </select>
        </label>
        <label>P em 10–20 cm está abaixo do crítico?
          <select
            value={triState(scenarioDraft.limingPhosphorus10To20BelowCritical)}
            onChange={e=>setScenarioDraft({...scenarioDraft,limingPhosphorus10To20BelowCritical:fromTriState(e.target.value)})}
          >
            <option value="unknown">Não avaliado</option><option value="yes">Sim</option><option value="no">Não</option>
          </select>
        </label>
        <label>Agrônomo confirmou a decisão de incorporação?
          <select
            value={triState(scenarioDraft.limingAgronomistConfirmedIncorporation)}
            onChange={e=>setScenarioDraft({...scenarioDraft,limingAgronomistConfirmedIncorporation:fromTriState(e.target.value)})}
          >
            <option value="unknown">Não avaliado</option><option value="yes">Sim</option><option value="no">Não</option>
          </select>
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
        <label>Categoria da cultura anterior
          <select
            value={scenarioDraft.previousCropCode??""}
            onChange={e=>setScenarioDraft({
              ...scenarioDraft,
              previousCropCode:e.target.value===""?null:e.target.value as "SOYBEAN"|"CORN"|"OTHER",
            })}
          >
            <option value="">Não informado</option>
            <option value="SOYBEAN">Soja</option>
            <option value="CORN">Milho</option>
            <option value="OTHER">Outra</option>
          </select>
        </label>
        <label>Cultura anterior — descrição livre
          <input value={scenarioDraft.previousCrop??""} onChange={e=>setScenarioDraft({...scenarioDraft,previousCrop:e.target.value})}/>
          <small>A descrição é histórica; o motor de N usa somente a categoria estruturada acima.</small>
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
      <button className="button" onClick={calculate}>Calcular nutrientes e prontidão</button>
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
                            {["RICE","ARROZ"].includes(String(draft.cropCode??crop.cropCode).toUpperCase())&&
                <PlanningRiceResponseFields
                  responseClass={(draft.riceResponseClass??crop.riceResponseClass??null) as PlanningRiceResponseClass|null}
                  approved={Boolean(draft.riceResponseClassApproved??crop.riceResponseClassApproved)}
                  onChange={(riceResponseClass,riceResponseClassApproved)=>{
                    setDraft((current:any)=>({...current,riceResponseClass,riceResponseClassApproved}));
                  }}
                />}
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
                            {["RICE","ARROZ"].includes(crop.cropCode.toUpperCase())&&<p>
                Resposta SOSBAI: <strong>{crop.riceResponseClass??"não resolvida"}</strong> · {
                  crop.riceResponseClassApproved?"aprovada":"aguarda aprovação explícita"
                }
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
      <p>P/K, S e N abaixo usam motores determinísticos oficiais da RAIZ. N é calculado para trigo quando MO, meta e cultura anterior estão resolvidas e para arroz irrigado somente quando a classe de resposta SOSBAI estiver explicitamente aprovada. Calcário e demais nutrientes só entram quando seus contextos específicos estiverem válidos.</p>
      {results.map(result=>{
        const p=result.deterministicPk?.P2O5;
        const k=result.deterministicPk?.K2O;
        const sulfur=result.deterministicSulfur;
        const nitrogen=result.deterministicNitrogen;
        const liming=result.deterministicLiming;
        const micros=result.deterministicMicronutrients;
        return <article className="card" style={{padding:14,margin:"8px 0"}} key={result.position}>
          <strong>{result.crop.cropCode}: {result.status}</strong>
          <p>{result.reanalysisRequired?"NOVA ANÁLISE NECESSÁRIA":result.limitations.join(" · ")||"Contexto mínimo disponível."}</p>
          {result.targetCropProfile&&
            <p><small>Perfil: {result.targetCropProfile.code} · {result.targetCropProfile.semanticVersion} · {result.targetCropProfile.status}</small></p>}
          {result.position===0&&<div className="card" style={{padding:12,margin:"10px 0"}}>
            <span>Calcário PRNT100</span>
            <strong style={{display:"block"}}>{limingTargetLabel(liming)}</strong>
            {liming?.methodId&&<small>Método: {liming.methodId} · perfil de amostragem: {liming.samplingProfile??"—"}</small>}
            {liming?.commercialTargetTonHaPrnt100>0&&<div style={{marginTop:8}}>
              <a className="button secondary" href={limingCalculatorHref(liming,scenario.areaHa)}>Calcário → produto comercial</a>
            </div>}
          </div>}
          {micros&&<div className="card" style={{padding:12,margin:"10px 0"}}>
            <span>Micronutrientes · classificação analítica, sem dose automática</span>
            <div className="summary-strip" style={{marginTop:8}}>
              {(["B","ZN","CU","MN"] as const).map((nutrient)=>
                <div className="summary-item" key={nutrient}>
                  <span>{nutrient}</span>
                  <strong>{micronutrientLabel(micros[nutrient])}</strong>
                </div>
              )}
            </div>
            <small>“Baixo” não é convertido em kg/ha. Método, unidade e camada precisam corresponder à regra CQFS carregada.</small>
          </div>}
          <div className="summary-strip" style={{margin:"10px 0"}}>
            <div className="summary-item">
              <span>P₂O₅</span>
              <strong>{pkTargetLabel(p)}</strong>
            </div>
            <div className="summary-item">
              <span>K₂O</span>
              <strong>{pkTargetLabel(k)}</strong>
            </div>
            <div className="summary-item">
              <span>S</span>
              <strong>{sulfurTargetLabel(sulfur)}</strong>
            </div>
            <div className="summary-item">
              <span>N</span>
              <strong>{nitrogenTargetLabel(nitrogen)}</strong>
            </div>
          </div>
          {(
            (p?.ready&&(p.maximumKgPerHa??0)>0)
            ||(k?.ready&&(k.maximumKgPerHa??0)>0)
            ||(sulfur?.ready&&(sulfur.maximumKgSPerHa??0)>0)
            ||(nitrogen?.ready&&(nitrogen.maximumKgNPerHa??0)>0)
          )&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {p?.ready&&(p.maximumKgPerHa??0)>0&&<a className="button secondary" href={calculatorHref("P2O5",p,scenario.areaHa)}>
              {p.minimumKgPerHa===p.maximumKgPerHa?"P₂O₅ → produto":"Abrir calculadora para P₂O₅"}
            </a>}
            {k?.ready&&(k.maximumKgPerHa??0)>0&&<a className="button secondary" href={calculatorHref("K2O",k,scenario.areaHa)}>
              {k.minimumKgPerHa===k.maximumKgPerHa?"K₂O → produto":"Abrir calculadora para K₂O"}
            </a>}
            {sulfur?.ready&&(sulfur.maximumKgSPerHa??0)>0&&<a className="button secondary" href={calculatorHref("S",sulfur,scenario.areaHa)}>
              {sulfur.minimumKgSPerHa===sulfur.maximumKgSPerHa?"S → produto":"Abrir calculadora para S"}
            </a>}
            {nitrogen?.ready&&(nitrogen.maximumKgNPerHa??0)>0&&<a className="button secondary" href={calculatorHref("N",nitrogen,scenario.areaHa)}>
              {nitrogen.minimumKgNPerHa===nitrogen.maximumKgNPerHa?"N → produto":"Abrir calculadora para N"}
            </a>}
          </div>}
          {result.crop?.id&&<PlanningCommercialPanel scenarioId={scenario.id} cropId={result.crop.id}/>}
          {result.crop?.id&&<PlanningZarcPanel scenarioId={scenario.id} cropId={result.crop.id}/>}  
        </article>;
      })}
      {accumulatedPk&&<article className="card" style={{padding:16,marginTop:12}}>
        <h3>Acumulado conhecido do horizonte</h3>
        {(["P2O5","K2O"] as const).map(nutrient=>{
          const item=accumulatedPk[nutrient];
          return <p key={nutrient}>
            <strong>{nutrient==="P2O5"?"P₂O₅":"K₂O"}:</strong>{" "}
            {item.minimumKgPerHa===item.maximumKgPerHa
              ? `${item.minimumKgPerHa} kg/ha`
              : `${item.minimumKgPerHa}–${item.maximumKgPerHa} kg/ha`}
            {item.totalMinimumKg!=null&&<> · talhão: {item.totalMinimumKg===item.totalMaximumKg
              ? `${item.totalMinimumKg} kg`
              : `${item.totalMinimumKg}–${item.totalMaximumKg} kg`}</>}
            {" · "}
            {item.complete?"completo para os cultivos listados":`parcial: ${item.readyCropCount} calculado(s), ${item.blockedCropCount} bloqueado(s)`}
          </p>;
        })}
        <small>“Parcial” nunca completa cultivos bloqueados com zero ou média inventada.</small>
      </article>}
      {accumulatedSulfur&&<article className="card" style={{padding:16,marginTop:12}}>
        <h3>Enxofre conhecido do horizonte</h3>
        <p>
          <strong>S:</strong>{" "}
          {accumulatedSulfur.minimumKgPerHa===accumulatedSulfur.maximumKgPerHa
            ? `${accumulatedSulfur.minimumKgPerHa} kg S/ha`
            : `${accumulatedSulfur.minimumKgPerHa}–${accumulatedSulfur.maximumKgPerHa} kg S/ha`}
          {accumulatedSulfur.totalMinimumKg!=null&&<> · talhão: {
            accumulatedSulfur.totalMinimumKg===accumulatedSulfur.totalMaximumKg
              ? `${accumulatedSulfur.totalMinimumKg} kg S`
              : `${accumulatedSulfur.totalMinimumKg}–${accumulatedSulfur.totalMaximumKg} kg S`
          }</>}
          {" · "}
          {accumulatedSulfur.complete
            ?"completo para os cultivos listados"
            :`parcial: ${accumulatedSulfur.readyCropCount} calculado(s), ${accumulatedSulfur.blockedCropCount} bloqueado(s)`}
        </p>
      </article>}
      {initialLiming&&<article className="card" style={{padding:16,marginTop:12}}>
        <h3>Calagem inicial do cenário</h3>
        <p><strong>Decisão:</strong> {limingTargetLabel(initialLiming)}</p>
        {initialLiming.totalCommercialTargetTon!=null&&
          <p><strong>Total para o talhão:</strong> {initialLiming.totalCommercialTargetTon} t de equivalente PRNT100 antes da conversão para produto comercial.</p>}
        {initialLiming.status==="SPATIAL"&&
          <small>A análise sustenta decisão espacial/faixa; a RAIZ não transforma isso em média geral sem evidência de ponderação válida.</small>}
        {initialLiming.commercialTargetTonHaPrnt100>0&&
          <div style={{marginTop:8}}><a className="button secondary" href={limingCalculatorHref(initialLiming,scenario.areaHa)}>Converter PRNT100 em calcário comercial</a></div>}
      </article>}
      {accumulatedNitrogen&&<article className="card" style={{padding:16,marginTop:12}}>
        <h3>Nitrogênio conhecido do horizonte</h3>
        <p>
          <strong>N:</strong>{" "}
          {accumulatedNitrogen.minimumKgPerHa===accumulatedNitrogen.maximumKgPerHa
            ? `${accumulatedNitrogen.minimumKgPerHa} kg N/ha`
            : `${accumulatedNitrogen.minimumKgPerHa}–${accumulatedNitrogen.maximumKgPerHa} kg N/ha`}
          {accumulatedNitrogen.totalMinimumKg!=null&&<> · talhão: {
            accumulatedNitrogen.totalMinimumKg===accumulatedNitrogen.totalMaximumKg
              ? `${accumulatedNitrogen.totalMinimumKg} kg N`
              : `${accumulatedNitrogen.totalMinimumKg}–${accumulatedNitrogen.totalMaximumKg} kg N`
          }</>}
          {" · "}
          {accumulatedNitrogen.complete
            ?"completo para os cultivos listados"
            :`parcial: ${accumulatedNitrogen.readyCropCount} calculado(s), ${accumulatedNitrogen.blockedCropCount} bloqueado(s)`}
        </p>
      </article>}
    </section>}

    <section>
      <h2>Snapshots imutáveis</h2>
      {snapshots.map(snapshot=>
        <div key={snapshot.id} className="card" style={{padding:12,margin:"8px 0"}}>
          <strong>{snapshot.createdAt}</strong>
          <small style={{display:"block",overflowWrap:"anywhere"}}>{snapshot.sha256}</small>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
            <button className="button secondary" onClick={()=>openSnapshot(snapshot.id)}>Abrir snapshot</button>
            <a className="button secondary" href={`/planejamento/${scenario.id}/relatorio/${snapshot.id}`}>Relatório / PDF</a>
          </div>
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
