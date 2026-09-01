import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro, StatusBadge } from "@/components/ui";
import { analyses as demoAnalyses } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { listAnalyses } from "@/lib/repositories/analyses";
import { analysisStatusMeta, formatRelativeOrDate } from "@/domain/analysis-ui";

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
      <div className="toolbar">
        <div className="toolbar-left"><label className="search-box"><Icon name="search" size={17}/><input aria-label="Buscar por cliente, área ou código" placeholder="Buscar por cliente, área ou código"/></label><select className="select" aria-label="Filtrar status"><option>Todos os status</option><option>Aguardando revisão</option><option>Com inconsistências</option><option>Aprovada</option></select></div>
        <div className="toolbar-right"><Link href="/analises/nova?etapa=laudo" className="button secondary"><Icon name="upload" size={16}/>Importar laudo</Link></div>
      </div>
      <div className="data-card">
        {database ? realAnalyses.length === 0 ? <div className="empty-state"><Icon name="flask"/><strong>Nenhuma análise criada</strong><small>Cadastre a estrutura da propriedade e crie a primeira análise para iniciar o histórico técnico.</small></div> : <table className="data-table"><thead><tr><th>Análise</th><th>Área</th><th>Progresso</th><th>Status</th><th>Atualização</th><th></th></tr></thead><tbody>
          {realAnalyses.map((analysis: any) => { const meta = analysisStatusMeta(analysis.status); return <tr key={analysis.id}><td><Link href={`/analises/${analysis.id}`} className="table-link">{analysis.code}</Link><strong>{analysis.clientName}</strong></td><td>{analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</td><td className="progress-cell"><div><i style={{width:`${meta.progress}%`}}/></div><small>{meta.progress}% do fluxo</small></td><td><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></td><td>{formatRelativeOrDate(analysis.updatedAt)}</td><td><Link href={`/analises/${analysis.id}`} aria-label={`Abrir ${analysis.code}`}><Icon name="chevron" size={17}/></Link></td></tr> })}
        </tbody></table> : <table className="data-table"><thead><tr><th>Análise</th><th>Área</th><th>Progresso</th><th>Status</th><th>Atualização</th><th></th></tr></thead><tbody>
          {demoAnalyses.map((analysis) => <tr key={analysis.id}><td><Link href={`/analises/${analysis.id}`} className="table-link">{analysis.id}</Link><strong>{analysis.client}</strong></td><td>{analysis.area}</td><td className="progress-cell"><div><i style={{width:`${analysis.progress}%`}}/></div><small>{analysis.progress}% concluída</small></td><td><StatusBadge tone={analysis.statusTone}>{analysis.status}</StatusBadge></td><td>{analysis.updated}</td><td><Link href={`/analises/${analysis.id}`} aria-label={`Abrir ${analysis.id}`}><Icon name="chevron" size={17}/></Link></td></tr>)}
        </tbody></table>}
      </div>
    </div>
  </>;
}
