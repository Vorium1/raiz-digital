import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { ReportBrand, ReportSignature } from "@/components/report-brand";
import { Topbar } from "@/components/topbar";
import { requirePlatformSession } from "@/lib/auth/session";
import { getTenantBranding } from "@/lib/repositories/tenant-branding";
import { getPlanningSnapshot, PlanningError } from "@/lib/repositories/planning";
import { listPlanningCommercialSnapshotsForPlanningSnapshot } from "@/lib/repositories/planning-commercial";
import { buildProducerCommercialPlanSummary } from "@/domain/official-commercial-plan";

export const metadata={title:"Planejamento Plurissafras"};

const CROP_LABELS:Record<string,string>={
  SOYBEAN:"Soja",
  SOJA:"Soja",
  WHEAT:"Trigo",
  TRIGO:"Trigo",
  RICE:"Arroz",
  ARROZ:"Arroz",
};

function cropLabel(code:string|null|undefined){
  const key=String(code??"").toUpperCase();
  return CROP_LABELS[key]??(key||"Cultura");
}
function dateLabel(value:string|null|undefined){
  if(!value)return "não informada";
  const date=new Date(value.includes("T")?value:`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString("pt-BR");
}
function dateTimeLabel(value:string|null|undefined){
  if(!value)return "—";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleString("pt-BR");
}
function number(value:number|null|undefined,digits=2){
  return value==null||!Number.isFinite(value)
    ?"—"
    :value.toLocaleString("pt-BR",{maximumFractionDigits:digits});
}
function money(value:number|null|undefined){
  return value==null||!Number.isFinite(value)
    ?"—"
    :value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
function rangeLabel(min:number|null|undefined,max:number|null|undefined,unit:string){
  if(min==null&&max==null)return "bloqueado/sem dose";
  if(min!=null&&max!=null&&Math.abs(min-max)<1e-9)return `${number(min,4)} ${unit}`;
  return `${number(min,4)}–${number(max,4)} ${unit}`;
}
function pkLabel(target:any){
  if(!target?.ready)return "bloqueado/sem dose";
  return rangeLabel(target.minimumKgPerHa,target.maximumKgPerHa,"kg/ha");
}
function sulfurLabel(target:any){
  if(!target?.ready)return "bloqueado/sem dose";
  return rangeLabel(target.minimumKgSPerHa,target.maximumKgSPerHa,"kg S/ha");
}
function nitrogenLabel(target:any){
  if(!target?.ready)return "bloqueado/sem dose";
  return rangeLabel(target.minimumKgNPerHa,target.maximumKgNPerHa,"kg N/ha");
}
function limingLabel(target:any){
  if(!target)return "não calculado";
  if(!target.ready)return "bloqueado/aguarda reavaliação";
  if(target.status==="UNIFORM_NO_APPLY")return "não aplicar";
  if(target.methodScope==="LAYER_REQUIREMENT"){
    return target.generalDoseTonHaPrnt100!=null
      ? `${number(target.generalDoseTonHaPrnt100,4)} t/ha PRNT100 · necessidade da camada; aplicação não definida`
      :"necessidade da camada disponível; aplicação não definida";
  }
  if(target.generalDoseTonHaPrnt100!=null)return `${number(target.generalDoseTonHaPrnt100,4)} t/ha PRNT100`;
  if(target.minimumTonHaPrnt100!=null||target.maximumTonHaPrnt100!=null){
    return `${number(target.minimumTonHaPrnt100,4)}–${number(target.maximumTonHaPrnt100,4)} t/ha PRNT100 · espacial`;
  }
  return target.status??"sem decisão";
}
function micronutrientLabel(decision:any){
  if(!decision)return "não disponível";
  if(decision.status==="UNIFORM")return decision.classification??"sem classe";
  if(decision.status==="SPATIAL"){
    const classes=[...new Set((decision.pointClassifications??[]).map((point:any)=>point.classification).filter(Boolean))];
    return `espacial · ${classes.join(" / ")||"classes por ponto"}`;
  }
  return decision.status==="NOT_AVAILABLE"?"não disponível":"bloqueado";
}
function waterLabel(value:boolean|null|undefined){
  return value===true?"irrigado":value===false?"sequeiro":"não informado";
}
function statusLabel(result:any){
  return result?.reanalysisRequired?"Nova análise necessária":result?.status??"Parcial";
}

export default async function MultiseasonPlanningReportPage({
  params,
}:{params:Promise<{id:string;snapshotId:string}>}){
  const {id,snapshotId}=await params;
  const session=await requirePlatformSession();

  try{
    const [snapshot,branding]=await Promise.all([
      getPlanningSnapshot(session.tenantId,id,snapshotId,session.userId),
      getTenantBranding(session.tenantId),
    ]);

    const payload=snapshot.payload as any;
    const scenario=payload?.scenario;
    const calculation=payload?.calculation;
    if(!scenario||!calculation)throw new PlanningError("Snapshot de planejamento incompleto.",409);

    const crops=Array.isArray(scenario.crops)?scenario.crops:[];
    const results=Array.isArray(calculation.results)?calculation.results:[];

    const commercialSnapshots=snapshot.integrity==="VERIFIED"&&scenario.updatedAt
      ?await listPlanningCommercialSnapshotsForPlanningSnapshot({
          tenantId:session.tenantId,
          userId:session.userId,
          scenarioId:id,
          snapshotCreatedAt:snapshot.createdAt,
          sourceScenarioUpdatedAt:String(scenario.updatedAt),
          crops:crops
            .filter((crop:any)=>crop?.id&&crop?.updatedAt)
            .map((crop:any)=>({id:String(crop.id),updatedAt:String(crop.updatedAt)})),
        })
      :[];

    const commercialByCrop=new Map<string,Array<{raw:any;summary:ReturnType<typeof buildProducerCommercialPlanSummary>}>>();
    for(const raw of commercialSnapshots){
      const summary=buildProducerCommercialPlanSummary(raw as any);
      if(!summary)continue;
      const key=String(raw.planningCropId);
      const list=commercialByCrop.get(key)??[];
      list.push({raw,summary});
      commercialByCrop.set(key,list);
    }

    const nextCrop=results[0]??null;
    const accumulatedPk=calculation.accumulatedPk??null;
    const accumulatedSulfur=calculation.accumulatedSulfur??null;
    const accumulatedNitrogen=calculation.accumulatedNitrogen??null;
    const initialLiming=calculation.initialLiming??null;

    return <>
      <Topbar eyebrow="Planejamento" title="Relatório Plurissafras">
        <Link href={`/planejamento/${id}`} className="button ghost no-print">Voltar ao cenário</Link>
      </Topbar>
      <div className="content-wrap">
        <div className="report-toolbar no-print">
          <span className="report-empty-note">
            Documento próprio do planejamento · fonte congelada no snapshot · não substitui a prescrição oficial de cada safra.
          </span>
          {snapshot.integrity==="VERIFIED"&&<PrintButton label="Exportar planejamento em PDF"/>}
        </div>

        <article className="report-doc report-doc-simple">
          <header className="report-header">
            <ReportBrand branding={branding}/>
            <div className="report-header-meta">
              <span>Snapshot</span>
              <strong>{dateTimeLabel(snapshot.createdAt)}</strong>
            </div>
          </header>

          <h1 className="report-title">Planejamento Plurissafras</h1>
          <p className="report-subtitle">
            {scenario.clientName??"Cliente"} · {scenario.propertyName??"Propriedade"} · {scenario.fieldName??"Talhão"} · {number(scenario.areaHa)} ha
          </p>

          {snapshot.integrity!=="VERIFIED"&&<section className="report-section">
            <h2>Integridade não verificável</h2>
            <p className="report-empty-note">
              Este é um snapshot legado sem hash canônico verificável. O PDF fica bloqueado; crie um snapshot atual do planejamento para emitir documento reproduzível.
            </p>
          </section>}

          <section className="report-section">
            <h2>1. Base do planejamento</h2>
            <div className="review-grid">
              <div className="review-summary"><span>Cenário</span><strong>{scenario.name??"—"}</strong><small>Status {calculation.status??scenario.status??"—"}</small></div>
              <div className="review-summary"><span>Análise-base</span><strong>{scenario.baseAnalysisCode??"não vinculada"}</strong><small>Amostragem {dateLabel(scenario.baseAnalysisSampledFrom)}{scenario.baseAnalysisSampledTo&&scenario.baseAnalysisSampledTo!==scenario.baseAnalysisSampledFrom?` a ${dateLabel(scenario.baseAnalysisSampledTo)}`:""}</small></div>
              <div className="review-summary"><span>Manejo</span><strong>{scenario.managementSystem??"não informado"}</strong><small>Condição hídrica: {waterLabel(scenario.irrigated)}</small></div>
              <div className="review-summary"><span>Cultura anterior</span><strong>{scenario.previousCropCode?cropLabel(scenario.previousCropCode):"não informada"}</strong><small>{scenario.previousCrop??"Sem descrição histórica adicional"}</small></div>
            </div>
            <p className="report-empty-note">
              Este documento é uma simulação técnica de horizonte. Dados ausentes permanecem UNKNOWN; nenhuma dose, clima, produto ou efeito residual é completado por suposição.
            </p>
          </section>

          <section className="report-section">
            <h2>2. Próximo cultivo — o que fazer agora</h2>
            {nextCrop?<div>
              <h3>{cropLabel(nextCrop.crop?.cropCode)} · {nextCrop.crop?.seasonLabel||"janela não informada"}</h3>
              <p>
                Data prevista: <strong>{dateLabel(nextCrop.crop?.plannedDate)}</strong> ·
                Meta: <strong>{nextCrop.crop?.targetYield??"UNKNOWN"} {nextCrop.crop?.targetUnit??""}</strong> ·
                Estado: <strong>{statusLabel(nextCrop)}</strong>
              </p>
              <div className="review-grid">
                <div className="review-summary"><span>P₂O₅</span><strong>{pkLabel(nextCrop.deterministicPk?.P2O5)}</strong></div>
                <div className="review-summary"><span>K₂O</span><strong>{pkLabel(nextCrop.deterministicPk?.K2O)}</strong></div>
                <div className="review-summary"><span>S</span><strong>{sulfurLabel(nextCrop.deterministicSulfur)}</strong></div>
                <div className="review-summary"><span>N</span><strong>{nitrogenLabel(nextCrop.deterministicNitrogen)}</strong></div>
                <div className="review-summary"><span>Calcário</span><strong>{limingLabel(nextCrop.deterministicLiming)}</strong></div>
              </div>
              {nextCrop.reanalysisRequired&&<p className="report-empty-note">
                Este cultivo está depois do prazo de validade da análise-base; a RAIZ exige nova análise antes de recalcular as doses.
              </p>}
            </div>:<p className="report-empty-note">Nenhum cultivo foi congelado neste snapshot.</p>}
          </section>

          <section className="report-section">
            <h2>3. Linha do tempo técnica</h2>
            {results.length===0?<p className="report-empty-note">Sem cultivos calculados.</p>:results.map((result:any)=>{
              const cropId=String(result.crop?.id??"");
              const commercial=commercialByCrop.get(cropId)??[];
              const blockers=[
                ...(result.limitations??[]),
                ...(result.deterministicPk?.P2O5?.blockers??[]),
                ...(result.deterministicPk?.K2O?.blockers??[]),
                ...(result.deterministicSulfur?.blockers??[]),
                ...(result.deterministicNitrogen?.blockers??[]),
                ...(result.deterministicLiming?.blockers??[]),
              ];
              return <div key={result.position} className="narrative-block" style={{marginBottom:12}}>
                <h3>{Number(result.position)+1}. {cropLabel(result.crop?.cropCode)} · {result.crop?.seasonLabel||"janela não informada"}</h3>
                <p>
                  {dateLabel(result.crop?.plannedDate)} · meta {result.crop?.targetYield??"UNKNOWN"} {result.crop?.targetUnit??""} ·
                  {waterLabel(result.crop?.irrigated)} · <strong>{statusLabel(result)}</strong>
                </p>
                <div className="review-grid">
                  <div className="review-summary"><span>P₂O₅</span><strong>{pkLabel(result.deterministicPk?.P2O5)}</strong></div>
                  <div className="review-summary"><span>K₂O</span><strong>{pkLabel(result.deterministicPk?.K2O)}</strong></div>
                  <div className="review-summary"><span>S</span><strong>{sulfurLabel(result.deterministicSulfur)}</strong></div>
                  <div className="review-summary"><span>N</span><strong>{nitrogenLabel(result.deterministicNitrogen)}</strong></div>
                </div>
                {result.position===0&&<p><strong>Calagem inicial:</strong> {limingLabel(result.deterministicLiming)}</p>}
                {result.deterministicMicronutrients&&<p>
                  <strong>Micronutrientes:</strong>{" "}
                  B {micronutrientLabel(result.deterministicMicronutrients.B)} ·
                  Zn {micronutrientLabel(result.deterministicMicronutrients.ZN)} ·
                  Cu {micronutrientLabel(result.deterministicMicronutrients.CU)} ·
                  Mn {micronutrientLabel(result.deterministicMicronutrients.MN)}.
                  {" "}Classificação analítica não é convertida em dose automática.
                </p>}
                {result.reanalysisDueAt&&<p><strong>Reanálise:</strong> prazo técnico {dateLabel(result.reanalysisDueAt)}.</p>}
                {blockers.length>0&&<details>
                  <summary>Pendências técnicas ({new Set(blockers).size})</summary>
                  <ul className="report-pendencies">{[...new Set(blockers)].map((blocker:any)=><li key={String(blocker)}>{String(blocker)}</li>)}</ul>
                </details>}

                {commercial.length>0&&<div style={{marginTop:10}}>
                  <h4>Produtos e investimento congelados para este cultivo</h4>
                  {commercial.map(({raw,summary})=><div key={raw.id} className="review-summary" style={{marginTop:6}}>
                    <span>{summary?.label??raw.label??raw.simulationMode}</span>
                    {summary?.rows.map((row,index)=><strong key={index} style={{display:"block"}}>
                      {row.productName}: {number(row.doseQuantity,4)} {row.doseUnit} · {number(row.totalQuantity,4)} {row.totalUnit}
                    </strong>)}
                    <small>
                      Custo {money(summary?.costPerHa)}/ha · total {money(summary?.totalCost)} · congelado em {dateTimeLabel(raw.createdAt)}
                    </small>
                  </div>)}
                  <small>Alternativas comerciais são exibidas lado a lado; o relatório não escolhe fornecedor ou produto automaticamente.</small>
                </div>}
              </div>;
            })}
          </section>

          <section className="report-section">
            <h2>4. Acumulado conhecido do horizonte</h2>
            <div className="review-grid">
              <div className="review-summary">
                <span>P₂O₅</span>
                <strong>{accumulatedPk?rangeLabel(accumulatedPk.P2O5?.minimumKgPerHa,accumulatedPk.P2O5?.maximumKgPerHa,"kg/ha"):"—"}</strong>
                <small>{accumulatedPk?.P2O5?.complete?"completo":"parcial / bloqueios preservados"}</small>
              </div>
              <div className="review-summary">
                <span>K₂O</span>
                <strong>{accumulatedPk?rangeLabel(accumulatedPk.K2O?.minimumKgPerHa,accumulatedPk.K2O?.maximumKgPerHa,"kg/ha"):"—"}</strong>
                <small>{accumulatedPk?.K2O?.complete?"completo":"parcial / bloqueios preservados"}</small>
              </div>
              <div className="review-summary">
                <span>S</span>
                <strong>{accumulatedSulfur?rangeLabel(accumulatedSulfur.minimumKgPerHa,accumulatedSulfur.maximumKgPerHa,"kg S/ha"):"—"}</strong>
                <small>{accumulatedSulfur?.complete?"completo":"parcial / bloqueios preservados"}</small>
              </div>
              <div className="review-summary">
                <span>N</span>
                <strong>{accumulatedNitrogen?rangeLabel(accumulatedNitrogen.minimumKgPerHa,accumulatedNitrogen.maximumKgPerHa,"kg N/ha"):"—"}</strong>
                <small>{accumulatedNitrogen?.complete?"completo":"parcial / bloqueios preservados"}</small>
              </div>
            </div>
            {initialLiming&&<p><strong>Calagem inicial:</strong> {limingLabel(initialLiming)}
              {initialLiming.totalCommercialTargetTon!=null?` · ${number(initialLiming.totalCommercialTargetTon,4)} t equivalentes PRNT100 no talhão`:""}.
            </p>}
            <p className="report-empty-note">
              O acumulado soma apenas parcelas calculadas pelas regras homologadas. Cultivos bloqueados não são preenchidos com zero nem por média.
            </p>
          </section>

          <section className="report-section">
            <h2>5. Clima e risco</h2>
            <p className="report-empty-note">
              Este snapshot ainda não congela um contexto agroclimático plurissafras oficial. A previsão CPTEC de 7 dias não é extrapolada para safras futuras, e nenhum sinal ENSO ou janela ZARC é inventado. O bloco climático permanece pendente até a evidência oficial poder ser vinculada e congelada por cultivo.
            </p>
          </section>

          <section className="report-section">
            <h2>6. Rastreabilidade</h2>
            <p><strong>Snapshot:</strong> {snapshot.id}</p>
            <p><strong>SHA-256:</strong> <span style={{overflowWrap:"anywhere"}}>{snapshot.sha256}</span></p>
            <p><strong>Integridade:</strong> {snapshot.integrity==="VERIFIED"?"verificada":"legado não verificável"}</p>
            <p><strong>Versão do payload:</strong> {payload.version??1}</p>
            <p className="report-empty-note">
              O conteúdo técnico acima vem do payload persistido. O estado atual do cenário não substitui nem reescreve este documento histórico.
            </p>
          </section>

          <ReportSignature branding={branding}/>
        </article>
      </div>
    </>;
  }catch(error){
    if(error instanceof PlanningError&&error.status===404)notFound();
    throw error;
  }
}
