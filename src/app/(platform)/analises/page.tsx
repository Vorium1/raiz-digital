import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro, StatusBadge } from "@/components/ui";
import { analyses as demoAnalyses } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { listAnalyses } from "@/lib/repositories/analyses";
import { AnalysesTable } from "@/components/analyses-table";

export const metadata = { title: "Análises" };

export default async function AnalysesPage() {
  const database = isDatabaseMode();
  const realAnalyses = database ? await (async () => {
    const session = await requirePlatformSession();
    return listAnalyses(session.tenantId, session.userId);
  })() : [];

  const summary = database ? {
    active: realAnalyses.filter((item: any) => !["REPORT_SENT","ARCHIVED"].includes(item.status)).length,
    review: realAnalyses.filter((item: any) => item.status === "AWAITING_REVIEW").length,
    inconsistent: realAnalyses.filter((item: any) => item.status === "INCONSISTENT").length,
    published: realAnalyses.filter((item: any) => item.status === "REPORT_SENT").length,
  } : { active: 28, review: 7, inconsistent: 3, published: 19 };

  return <>
    <Topbar eyebrow="Operação" title="Análises" />
    <div className="content-wrap">
      <PageIntro title="Fluxo técnico completo" description="Acompanhe cada análise da coleta à publicação, com validação, rastreabilidade das regras e aprovação do responsável agronômico."/>
      {!database && <div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo. Os dados abaixo são exemplos.</span></div>}
      <section className="summary-strip">
        <div className="summary-item"><span>Em andamento</span><strong>{summary.active}</strong></div>
        <div className="summary-item"><span>Aguardando revisão</span><strong>{summary.review}</strong></div>
        <div className="summary-item"><span>Com inconsistências</span><strong>{summary.inconsistent}</strong></div>
        <div className="summary-item"><span>Relatórios enviados</span><strong>{summary.published}</strong></div>
      </section>
      {database ? <AnalysesTable analyses={realAnalyses} /> : <>
        <div className="toolbar">
          <div className="toolbar-left"><label className="search-box"><Icon name="search" size={17}/><input aria-label="Buscar por cliente, área ou código" placeholder="Buscar por cliente, área ou código"/></label><select className="select" aria-label="Filtrar status"><option>Todos os status</option><option>Aguardando revisão</option><option>Com inconsistências</option><option>Aprovada</option></select></div>
          <div className="toolbar-right"><Link href="/analises/nova?etapa=laudo" className="button secondary"><Icon name="upload" size={16}/>Importar laudo</Link></div>
        </div>
        <div className="data-card">
          <table className="data-table"><thead><tr><th>Análise</th><th>Área</th><th>Progresso</th><th>Status</th><th>Atualização</th><th></th></tr></thead><tbody>
            {demoAnalyses.map((analysis) => <tr key={analysis.id}><td><Link href={`/analises/${analysis.id}`} className="table-link">{analysis.id}</Link><strong>{analysis.client}</strong></td><td>{analysis.area}</td><td className="progress-cell"><div><i style={{width:`${analysis.progress}%`}}/></div><small>{analysis.progress}% concluída</small></td><td><StatusBadge tone={analysis.statusTone}>{analysis.status}</StatusBadge></td><td>{analysis.updated}</td><td><Link href={`/analises/${analysis.id}`} aria-label={`Abrir ${analysis.id}`}><Icon name="chevron" size={17}/></Link></td></tr>)}
          </tbody></table>
        </div>
      </>}
    </div>
  </>;
}
