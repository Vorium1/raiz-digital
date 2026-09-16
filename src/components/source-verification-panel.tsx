"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type SourceImport = { id:string; fileName:string; fileSha256:string; sourceFormat:string; archived:boolean; verified:boolean; verifiedAt:string|null; verifiedByName:string|null };
type SourceVerificationStatus = { verificationRequired:boolean; sourceHumanVerified:boolean; canVerify:boolean; imports:SourceImport[] };

export function SourceVerificationPanel({ analysisId }: { analysisId:string }) {
  const [status,setStatus]=useState<SourceVerificationStatus|null>(null);
  const [busyImportId,setBusyImportId]=useState<string|null>(null);
  const [message,setMessage]=useState<{tone:"success"|"danger";text:string}|null>(null);

  async function load(){
    const response=await fetch(`/api/analyses/${analysisId}/source-verification`,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error??"Não foi possível carregar a conferência do laudo.");
    setStatus(data as SourceVerificationStatus);
  }
  useEffect(()=>{void load().catch((error)=>setMessage({tone:"danger",text:error instanceof Error?error.message:"Falha ao carregar o laudo."}));},[analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmSource(importId:string){
    setBusyImportId(importId);setMessage(null);
    try{
      const response=await fetch(`/api/analyses/${analysisId}/source-verification`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({importId})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error??"Não foi possível confirmar o arquivo original.");
      setMessage({tone:"success",text:data.verification?.analysisFullyVerified?"Arquivo original conferido.":"Arquivo conferido. Ainda existe outra importação pendente."});
      await load();
    }catch(error){setMessage({tone:"danger",text:error instanceof Error?error.message:"Falha ao confirmar o arquivo."});}
    finally{setBusyImportId(null);}
  }

  if(!status&&!message) return null;
  const badge=status?<StatusBadge tone={status.sourceHumanVerified?"success":status.verificationRequired?"danger":"waiting"}>{status.sourceHumanVerified?"Conferido":"Pendente"}</StatusBadge>:null;

  return <details className="card ux2-advanced-card">
    <summary><span><strong>Conferência do arquivo original</strong><small>Segurança e rastreabilidade do laudo — abra somente quando precisar.</small></span>{badge}</summary>
    <div className="review-actions" style={{padding:"14px 18px"}}>
      {status?.verificationRequired&&!status.sourceHumanVerified&&<div className="field-ops-inline-warning"><Icon name="warning" size={15}/><span>Esta empresa exige conferência do arquivo original antes da entrega oficial.</span></div>}
      {message&&<div className={`agro-message ${message.tone}`}><Icon name={message.tone==="success"?"check":"warning"} size={14}/><span>{message.text}</span></div>}
      {status?.imports.length===0?<p className="report-empty-note">Nenhuma importação registrada.</p>:<div className="field-ops-list">{status?.imports.map((item)=><div key={item.id} className="field-ops-list-row"><span><strong>{item.fileName}</strong><small>{item.sourceFormat} · SHA-256 {item.fileSha256.slice(0,12)}… · {item.archived?"original arquivado":"arquivo original não arquivado"}</small>{item.verified&&<small>Conferido{item.verifiedByName?` por ${item.verifiedByName}`:""}{item.verifiedAt?` em ${new Date(item.verifiedAt).toLocaleString("pt-BR")}`:""}</small>}</span><div className="review-actions" style={{margin:0}}><StatusBadge tone={item.verified?"success":item.archived?"waiting":"danger"}>{item.verified?"Confirmado":item.archived?"Aguardando":"Incompleto"}</StatusBadge>{item.archived&&<a className="button secondary small" href={`/api/analyses/${analysisId}/source-verification/${item.id}/file`} target="_blank" rel="noopener noreferrer">Abrir original</a>}{status.canVerify&&!item.verified&&item.archived&&<button className="button secondary small" disabled={busyImportId!==null} onClick={()=>void confirmSource(item.id)}>{busyImportId===item.id?"Conferindo…":"Confirmar original"}</button>}</div></div>)}</div>}
    </div>
  </details>;
}
