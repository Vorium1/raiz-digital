"use client";

import { useEffect, useMemo, useState } from "react";

type Nutrient="N"|"P2O5"|"K2O"|"S"|"Ca"|"Mg";
type Mode="SINGLE"|"PK_PAIR"|"LIME";
type Product={
  id:string;
  code:string;
  name:string;
  kind:"FERTILIZER"|"LIMESTONE"|"CORRECTIVE";
  guaranteesPercent:Partial<Record<Nutrient,number>>;
  prntPercent:number|null;
  pricePerTon:number|null;
  minRateKgPerHa:number|null;
  maxRateKgPerHa:number|null;
};
type Workspace={
  scenarioId:string;
  scenarioName:string;
  crop:{id:string;position:number;cropCode:string;seasonLabel:string;plannedDate:string|null};
  areaHa:number;
  nutrientTargetsKgPerHa:Partial<Record<Nutrient,number>>;
  limingRequirementTonPerHaPrnt100:number|null;
  availableModes:{SINGLE:boolean;PK_PAIR:boolean;LIME:boolean};
  products:Product[];
};
type Snapshot={
  id:string;
  label:string|null;
  simulationMode:Mode;
  engineOutput:any;
  productSnapshots:any[];
  createdAt:string;
};

const NUTRIENTS:Nutrient[]=["N","P2O5","K2O","S","Ca","Mg"];

function number(value:number|null|undefined,digits=2){
  return value==null?"—":value.toLocaleString("pt-BR",{maximumFractionDigits:digits});
}
function money(value:number|null|undefined){
  return value==null?"—":value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
function productLabel(product:Product){
  const guarantees=NUTRIENTS.flatMap((nutrient)=>
    product.guaranteesPercent[nutrient]==null?[]:[`${nutrient} ${product.guaranteesPercent[nutrient]}%`]
  );
  if(product.prntPercent!=null)guarantees.push(`PRNT ${product.prntPercent}%`);
  return `${product.name} (${product.code})${guarantees.length?` · ${guarantees.join(" · ")}`:""}`;
}
function snapshotCost(snapshot:Snapshot){
  const value=snapshot.engineOutput?.totalCost;
  return typeof value==="number"&&Number.isFinite(value)?value:null;
}

export function PlanningCommercialPanel({
  scenarioId,
  cropId,
}:{scenarioId:string;cropId:string}){
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [snapshots,setSnapshots]=useState<Snapshot[]>([]);
  const [canSave,setCanSave]=useState(false);
  const [mode,setMode]=useState<Mode>("SINGLE");
  const [driver,setDriver]=useState<Nutrient|"">("");
  const [productId,setProductId]=useState("");
  const [productAId,setProductAId]=useState("");
  const [productBId,setProductBId]=useState("");
  const [simulation,setSimulation]=useState<any|null>(null);
  const [label,setLabel]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  const fertilizers=useMemo(
    ()=>workspace?.products.filter((product)=>product.kind==="FERTILIZER")??[],
    [workspace],
  );
  const limestones=useMemo(
    ()=>workspace?.products.filter((product)=>product.kind==="LIMESTONE")??[],
    [workspace],
  );
  const availableNutrients=useMemo(
    ()=>NUTRIENTS.filter((nutrient)=>{
      const value=workspace?.nutrientTargetsKgPerHa[nutrient];
      return typeof value==="number"&&value>0;
    }),
    [workspace],
  );

  async function load(){
    setLoading(true);
    setMessage("");
    try{
      const [workspaceResponse,snapshotsResponse]=await Promise.all([
        fetch(`/api/planning/${scenarioId}/crops/${cropId}/commercial-simulation`,{cache:"no-store"}),
        fetch(`/api/planning/${scenarioId}/crops/${cropId}/commercial-snapshots`,{cache:"no-store"}),
      ]);
      const workspacePayload=await workspaceResponse.json().catch(()=>({}));
      const snapshotsPayload=await snapshotsResponse.json().catch(()=>({}));
      if(!workspaceResponse.ok)throw new Error(workspacePayload.error??"Não foi possível carregar os alvos comerciais.");
      if(!snapshotsResponse.ok)throw new Error(snapshotsPayload.error??"Não foi possível carregar o histórico comercial.");
      setWorkspace(workspacePayload.workspace as Workspace);
      setSnapshots(snapshotsPayload.snapshots??[]);
      setCanSave(snapshotsPayload.canSave===true);
    }catch(error){
      setMessage(error instanceof Error?error.message:"Falha ao carregar a camada comercial.");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    if(!workspace)return;
    setSimulation(null);
    if(workspace.availableModes.SINGLE&&availableNutrients.length){
      setMode("SINGLE");
      setDriver(availableNutrients[0]);
      setProductId(fertilizers[0]?.id??"");
      return;
    }
    if(workspace.availableModes.LIME){
      setMode("LIME");
      setProductId(limestones[0]?.id??"");
      return;
    }
    if(workspace.availableModes.PK_PAIR){
      setMode("PK_PAIR");
      setProductAId(fertilizers[0]?.id??"");
      setProductBId(fertilizers[1]?.id??"");
    }
  },[workspace,availableNutrients,fertilizers,limestones]);

  async function toggle(){
    const next=!open;
    setOpen(next);
    if(next&&!workspace)await load();
  }

  function selectMode(next:Mode){
    setMode(next);
    setSimulation(null);
    setMessage("");
    if(next==="SINGLE"){
      setDriver(availableNutrients[0]??"");
      setProductId(fertilizers[0]?.id??"");
    }else if(next==="PK_PAIR"){
      setProductAId(fertilizers[0]?.id??"");
      setProductBId(fertilizers[1]?.id??"");
    }else{
      setProductId(limestones[0]?.id??"");
    }
  }

  function payload(){
    if(mode==="SINGLE")return {mode,driverNutrient:driver,productId};
    if(mode==="PK_PAIR")return {mode,productAId,productBId};
    return {mode,productId};
  }

  async function simulate(){
    setBusy(true);
    setMessage("");
    setSimulation(null);
    try{
      const response=await fetch(
        `/api/planning/${scenarioId}/crops/${cropId}/commercial-simulation`,
        {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload())},
      );
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error??"Não foi possível calcular o cenário comercial.");
      setSimulation(data.simulation);
      setMessage("Simulação calculada. A necessidade agronômica não foi alterada.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"Falha ao simular.");
    }finally{
      setBusy(false);
    }
  }

  async function save(){
    if(!simulation||!canSave)return;
    setBusy(true);
    setMessage("");
    try{
      const response=await fetch(
        `/api/planning/${scenarioId}/crops/${cropId}/commercial-snapshots`,
        {
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({...payload(),label:label.trim()||null}),
        },
      );
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error??"Não foi possível salvar o cenário comercial.");
      setSnapshots((current)=>[data.snapshot,...current]);
      setLabel("");
      setMessage("Cenário comercial congelado no histórico deste cultivo.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"Falha ao salvar.");
    }finally{
      setBusy(false);
    }
  }

  return <div className="card" style={{padding:12,marginTop:10}}>
    <button className="button secondary" onClick={()=>void toggle()}>
      {open?"Fechar produtos e investimento":"Produtos e investimento"}
    </button>

    {open&&<>
      {loading&&<p>Carregando catálogo e alvos do cultivo…</p>}
      {message&&<p><small>{message}</small></p>}
      {workspace&&!loading&&<>
        <p style={{marginTop:10}}>
          <strong>Camada comercial opcional.</strong>{" "}
          O produto e o preço são escolhas explícitas. Eles nunca aumentam, reduzem ou criam a necessidade agronômica.
        </p>

        {!workspace.availableModes.SINGLE&&!workspace.availableModes.PK_PAIR&&!workspace.availableModes.LIME
          ? <p>Este cultivo ainda não tem alvo exato positivo apto para compra. Faixas e bloqueios permanecem técnicos.</p>
          : <>
            <div className="form-grid">
              <label>Tipo de cenário
                <select value={mode} onChange={(event)=>selectMode(event.target.value as Mode)}>
                  <option value="SINGLE" disabled={!workspace.availableModes.SINGLE}>Um produto por nutriente</option>
                  <option value="PK_PAIR" disabled={!workspace.availableModes.PK_PAIR}>Dois produtos para P₂O₅ + K₂O</option>
                  <option value="LIME" disabled={!workspace.availableModes.LIME}>Calcário pelo PRNT real</option>
                </select>
              </label>

              {mode==="SINGLE"&&<>
                <label>Nutriente-guia
                  <select value={driver} onChange={(event)=>{setDriver(event.target.value as Nutrient);setSimulation(null);}}>
                    {availableNutrients.map((nutrient)=>
                      <option key={nutrient} value={nutrient}>
                        {nutrient} · {number(workspace.nutrientTargetsKgPerHa[nutrient])} kg/ha
                      </option>
                    )}
                  </select>
                </label>
                <label>Produto
                  <select value={productId} onChange={(event)=>{setProductId(event.target.value);setSimulation(null);}}>
                    {fertilizers.map((product)=><option key={product.id} value={product.id}>{productLabel(product)}</option>)}
                  </select>
                </label>
              </>}

              {mode==="PK_PAIR"&&<>
                <label>Produto A
                  <select value={productAId} onChange={(event)=>{setProductAId(event.target.value);setSimulation(null);}}>
                    {fertilizers.map((product)=><option key={product.id} value={product.id}>{productLabel(product)}</option>)}
                  </select>
                </label>
                <label>Produto B
                  <select value={productBId} onChange={(event)=>{setProductBId(event.target.value);setSimulation(null);}}>
                    {fertilizers.map((product)=><option key={product.id} value={product.id}>{productLabel(product)}</option>)}
                  </select>
                </label>
              </>}

              {mode==="LIME"&&<>
                <label>Calcário
                  <select value={productId} onChange={(event)=>{setProductId(event.target.value);setSimulation(null);}}>
                    {limestones.map((product)=><option key={product.id} value={product.id}>{productLabel(product)}</option>)}
                  </select>
                </label>
                <div>
                  <small>Necessidade agronômica</small>
                  <strong style={{display:"block"}}>{number(workspace.limingRequirementTonPerHaPrnt100,4)} t/ha PRNT100</strong>
                </div>
              </>}
            </div>

            <button
              className="button"
              disabled={
                busy
                ||(mode==="SINGLE"&&(!driver||!productId))
                ||(mode==="PK_PAIR"&&(!productAId||!productBId||productAId===productBId))
                ||(mode==="LIME"&&!productId)
              }
              onClick={()=>void simulate()}
            >
              {busy?"Calculando…":"Simular produto e custo"}
            </button>
          </>}

        {simulation&&<div className="card" style={{padding:12,marginTop:10}}>
          <h4>Resultado comercial deste cultivo</h4>
          {simulation.mode==="SINGLE"&&<>
            <p><strong>Dose do produto:</strong> {number(simulation.result.rateKgPerHa)} kg/ha · <strong>Total:</strong> {number(simulation.result.totalProductTon,4)} t</p>
            <p><strong>Custo:</strong> {money(simulation.result.costPerHa)}/ha · <strong>Total:</strong> {money(simulation.result.totalCost)}</p>
          </>}
          {simulation.mode==="PK_PAIR"&&<>
            <p><strong>{simulation.result.productA.product.name}:</strong> {number(simulation.result.productA.rateKgPerHa)} kg/ha · {number(simulation.result.productA.totalProductTon,4)} t</p>
            <p><strong>{simulation.result.productB.product.name}:</strong> {number(simulation.result.productB.rateKgPerHa)} kg/ha · {number(simulation.result.productB.totalProductTon,4)} t</p>
            <p><strong>Custo combinado:</strong> {money(simulation.result.costPerHa)}/ha · <strong>Total:</strong> {money(simulation.result.totalCost)}</p>
          </>}
          {simulation.mode==="LIME"&&<>
            <p><strong>Dose física:</strong> {number(simulation.result.productDoseTonPerHa,4)} t/ha · <strong>Total:</strong> {number(simulation.result.totalProductTon,4)} t</p>
            <p><strong>Custo:</strong> {money(simulation.result.costPerHa)}/ha · <strong>Total:</strong> {money(simulation.result.totalCost)}</p>
          </>}
          {(simulation.result.constraintViolations??[]).length>0&&
            <p><strong>Limites operacionais:</strong> {simulation.result.constraintViolations.join(" ")}</p>}
          {simulation.mode==="PK_PAIR"&&[
            ...(simulation.result.productA?.constraintViolations??[]),
            ...(simulation.result.productB?.constraintViolations??[]),
          ].length>0&&
            <p><strong>Limites operacionais:</strong> {[
              ...(simulation.result.productA?.constraintViolations??[]),
              ...(simulation.result.productB?.constraintViolations??[]),
            ].join(" ")}</p>}

          {canSave&&<div className="form-grid" style={{marginTop:8}}>
            <label>Nome do cenário
              <input value={label} onChange={(event)=>setLabel(event.target.value)} placeholder="Ex.: compra novembro · fornecedor A"/>
            </label>
            <div>
              <button className="button secondary" disabled={busy} onClick={()=>void save()}>
                Salvar cenário deste cultivo
              </button>
            </div>
          </div>}
        </div>}

        {snapshots.length>0&&<details style={{marginTop:10}}>
          <summary>{snapshots.length} cenário(s) comercial(is) congelado(s)</summary>
          <div style={{marginTop:8}}>
            {snapshots.map((snapshot)=><div key={snapshot.id} className="card" style={{padding:10,margin:"6px 0"}}>
              <strong>{snapshot.label??snapshot.simulationMode}</strong>
              <small style={{display:"block"}}>
                {new Date(snapshot.createdAt).toLocaleString("pt-BR")} · {snapshot.simulationMode} · custo total {money(snapshotCost(snapshot))}
              </small>
            </div>)}
          </div>
        </details>}
      </>}
    </>}
  </div>;
}
