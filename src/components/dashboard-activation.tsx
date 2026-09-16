import Link from "next/link";
import { Icon } from "@/components/icon";

type ActivationJourneyProps = {
  clients:number;
  properties:number;
  fields:number;
  seasons:number;
  totalPoints:number;
  labsProcessed:number;
  approvedFields:number;
};

type ActivationStep={label:string;done:boolean;href:string;action:string};

/**
 * Ajuda inicial, não painel de burocracia.
 * Assim que cliente + área + safra + coleta + laudo existem, este bloco desaparece. A validação da
 * decisão é trabalho cotidiano e aparece na fila de decisões, não no checklist de configuração.
 */
export function DashboardActivationJourney(props:ActivationJourneyProps){
  const steps:ActivationStep[]=[
    {label:"Cadastrar o primeiro cliente",done:props.clients>0,href:"/clientes",action:"Cadastrar cliente"},
    {label:"Criar propriedade e talhão",done:props.properties>0&&props.fields>0,href:"/clientes",action:"Cadastrar área"},
    {label:"Definir safra e cultura",done:props.seasons>0,href:"/coletas#safras",action:"Definir safra"},
    {label:"Planejar a coleta",done:props.totalPoints>0,href:"/coletas",action:"Planejar coleta"},
    {label:"Importar o primeiro laudo",done:props.labsProcessed>0,href:"/analises/nova?etapa=laudo",action:"Importar laudo"},
  ];
  const completed=steps.filter((step)=>step.done).length;
  if(completed===steps.length)return null;
  const next=steps.find((step)=>!step.done)!;
  const progress=Math.round((completed/steps.length)*100);
  return <section className="card ux2-activation-compact" aria-label="Próximo passo para configurar a operação">
    <div><span className="eyebrow">PRIMEIROS PASSOS</span><strong>{next.label}</strong><small>A RAIZ já concluiu {completed} de {steps.length} etapas básicas. Depois disso, esse aviso desaparece.</small></div>
    <div className="ux2-activation-progress"><i style={{width:`${progress}%`}}/><span>{progress}%</span></div>
    <Link className="button primary" href={next.href}>{next.action}<Icon name="arrow" size={14}/></Link>
  </section>;
}
