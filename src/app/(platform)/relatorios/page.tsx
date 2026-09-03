import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { EmptyState, PageIntro } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { listAnalyses } from "@/lib/repositories/analyses";
import { listCollectionOrders } from "@/lib/repositories/collections";
import { listAgronomicContext } from "@/lib/repositories/catalog";
import { listPublishedReports } from "@/lib/repositories/reports";
import { analyses as demoAnalysesList } from "@/lib/demo-data";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage() {
  const database = isDatabaseMode();
  if (!database) {
    const published = demoAnalysesList.filter((item) => item.status === "Aprovada");
    return <><Topbar eyebrow="Entrega · demonstração" title="Relatórios"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo.</span></div><PageIntro title="Documentos técnicos publicados" description="Laudos oficiais com mapas, memória técnica, assinatura do responsável e QR Code de validação."/>
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="field-ops-section-head compact"><div><span className="eyebrow">PUBLICADOS · EXEMPLO</span><h2>Documentos publicados ({published.length})</h2></div></div>
        {published.map((item) => (
          <Link key={item.id} href={`/analises/${item.id}`} className="report-list-item" style={{ padding: "12px 22px" }}>
            <span><strong>{item.id} · {item.area}</strong><small>{item.client} · publicado por Agrônomo responsável (exemplo) · assinatura digital + QR Code de validação</small></span>
            <Icon name="arrow" size={15}/>
          </Link>
        ))}
      </section>
      <div className="data-card"><EmptyState icon="file" title="Os demais relatórios aparecem aqui após aprovação" description="Publicado só a partir de interpretação já revisada e aprovada pelo profissional responsável — nunca automaticamente." action={{ href: "/analises", label: "Ver análises" }}/></div>
    </div></>;
  }

  const session = await requirePlatformSession();
  const [published, analyses, orders, context] = await Promise.all([
    listPublishedReports(session.tenantId, session.userId),
    listAnalyses(session.tenantId, session.userId),
    listCollectionOrders(session.tenantId, session.userId),
    listAgronomicContext(session.tenantId, session.userId),
  ]);

  return (
    <>
      <Topbar eyebrow="Entrega" title="Relatórios"/>
      <div className="content-wrap">
        <PageIntro title="Documentos técnicos" description="Gerados exclusivamente a partir de dado real persistido. Nenhuma recomendação agronômica aparece onde não houver regra homologada."/>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="field-ops-section-head compact"><div><span className="eyebrow">PUBLICADOS</span><h2>Documentos publicados ({published.length})</h2></div></div>
          {published.length ? published.map((report: any) => (
            <div key={report.id} className="report-list-item" style={{ padding: "12px 22px" }}>
              <span><strong>{report.analysisCode} · {report.fieldName}</strong><small>{report.clientName} · {report.propertyName} · {report.seasonLabel} · publicado por {report.publishedByName ?? "—"} em {new Date(report.publishedAt).toLocaleString("pt-BR")}</small></span>
              <Link href={`/relatorios/talhao/${report.analysisId}`} className="button ghost">Abrir</Link>
            </div>
          )) : <div style={{ padding: "0 22px 18px" }}><EmptyState icon="file" title="Nenhum relatório publicado ainda" description="Publique a partir de uma interpretação já aprovada, na tela de Análises."/></div>}
        </section>

        <div className="report-generators-grid">
          <section className="card">
            <div className="field-ops-section-head compact"><div><span className="eyebrow">POR TALHÃO</span><h2>Análise por talhão</h2></div></div>
            <div className="report-generators-list">
              {analyses.length ? analyses.slice(0, 12).map((analysis: any) => (
                <Link key={analysis.id} href={`/relatorios/talhao/${analysis.id}`} className="report-list-item">
                  <span><strong>{analysis.code}</strong><small>{analysis.clientName} · {analysis.fieldName} · {analysis.seasonLabel}</small></span>
                  <Icon name="arrow" size={15}/>
                </Link>
              )) : <p className="report-empty-note" style={{ padding: "0 22px 18px" }}>Nenhuma análise cadastrada ainda.</p>}
            </div>
          </section>

          <section className="card">
            <div className="field-ops-section-head compact"><div><span className="eyebrow">POR ORDEM</span><h2>Relatório de coleta</h2></div></div>
            <div className="report-generators-list">
              {orders.length ? orders.slice(0, 12).map((order: any) => (
                <Link key={order.id} href={`/relatorios/coleta/${order.id}`} className="report-list-item">
                  <span><strong>{order.code}</strong><small>{order.clientName} · {order.fieldName} · {order.collectedPoints}/{order.plannedPoints} pontos</small></span>
                  <Icon name="arrow" size={15}/>
                </Link>
              )) : <p className="report-empty-note" style={{ padding: "0 22px 18px" }}>Nenhuma ordem de coleta ainda.</p>}
            </div>
          </section>

          <section className="card">
            <div className="field-ops-section-head compact"><div><span className="eyebrow">POR TALHÃO</span><h2>Evolução histórica</h2></div></div>
            <div className="report-generators-list">
              {context.fields.length ? context.fields.slice(0, 12).map((field: any) => (
                <Link key={field.id} href={`/relatorios/evolucao/${field.id}`} className="report-list-item">
                  <span><strong>{field.name}</strong><small>{Number(field.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</small></span>
                  <Icon name="arrow" size={15}/>
                </Link>
              )) : <p className="report-empty-note" style={{ padding: "0 22px 18px" }}>Nenhum talhão cadastrado ainda.</p>}
            </div>
          </section>

          <section className="card">
            <div className="field-ops-section-head compact"><div><span className="eyebrow">POR PROPRIEDADE</span><h2>Relatório executivo</h2></div></div>
            <div className="report-generators-list">
              {context.properties.length ? context.properties.slice(0, 12).map((property: any) => (
                <Link key={property.id} href={`/relatorios/propriedade/${property.id}`} className="report-list-item">
                  <span><strong>{property.name}</strong><small>{property.municipality}/{property.state}</small></span>
                  <Icon name="arrow" size={15}/>
                </Link>
              )) : <p className="report-empty-note" style={{ padding: "0 22px 18px" }}>Nenhuma propriedade cadastrada ainda.</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
