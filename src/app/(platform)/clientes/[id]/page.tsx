import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { Topbar } from "@/components/topbar";
import { PageIntro, StatusBadge } from "@/components/ui";
import { requirePlatformSession } from "@/lib/auth/session";
import { formatClientDocument } from "@/domain/client-document";
import { analysisStatusMeta } from "@/domain/analysis-ui";
import { ClientError, getClient360 } from "@/lib/repositories/clients";

export const metadata = { title: "Cliente 360°" };

const HISTORY_ACTIONS: Record<string, string> = {
  CLIENT_CREATED: "Cliente cadastrado", CLIENT_UPDATED: "Cadastro atualizado", CLIENT_ARCHIVED: "Cliente arquivado",
  PROPERTY_CREATED: "Propriedade cadastrada", PROPERTY_UPDATED: "Propriedade atualizada",
  FIELD_CREATED: "Talhão cadastrado", FIELD_UPDATED: "Talhão atualizado",
  CROP_SEASON_CREATED: "Safra cadastrada", CROP_SEASON_UPDATED: "Safra atualizada",
  ANALYSIS_CREATED: "Análise cadastrada", REPORT_PUBLISHED: "Relatório publicado",
  INTERPRETATION_CREATED: "Interpretação registrada", INTERPRETATION_REVIEWED: "Interpretação revisada",
};
const HISTORY_ENTITIES: Record<string, string> = {
  client: "Cadastro do cliente", property: "Propriedade", field: "Talhão", crop_season: "Safra",
  analysis: "Análise", interpretation: "Interpretação", report: "Relatório",
};

export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePlatformSession();

  let overview;
  try {
    overview = await getClient360(session.tenantId, id, session.userId);
  } catch (error) {
    if (error instanceof ClientError && error.status === 404) notFound();
    throw error;
  }

  const { client, properties, seasons, analyses, reports, history } = overview;
  const totalFields = properties.reduce((sum, property) => sum + property.fields.length, 0);

  return (
    <>
      <Topbar eyebrow="Clientes" title={client.name}/>
      <div className="content-wrap">
        <div className="review-actions" style={{ marginBottom: 12 }}>
          <Link href="/clientes" className="button ghost"><Icon name="arrow" size={14}/>Voltar para clientes</Link>
        </div>

        <PageIntro
          title="Cliente 360°"
          description="Cadastro, propriedades e talhões do cliente dentro da empresa atual."
        />

        <div className="review-grid" style={{ marginBottom: 16 }}>
          <div className="review-summary"><span>Propriedades</span><strong>{properties.length}</strong></div>
          <div className="review-summary"><span>Talhões</span><strong>{totalFields}</strong></div>
          <div className="review-summary"><span>Área acompanhada</span><strong>{client.hectares.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
          <div className="review-summary"><span>Análises</span><strong>{client.analyses}</strong></div>
        </div>

        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div><span className="eyebrow">IDENTIFICAÇÃO</span><h2>{client.tradeName || client.name}</h2></div>
            <StatusBadge tone={client.archivedAt ? "waiting" : "success"}>{client.archivedAt ? "Arquivado" : "Ativo"}</StatusBadge>
          </div>
          <dl className="detail-list">
            <div><dt>Tipo</dt><dd>{client.personType === "PF" ? "Pessoa física" : client.personType === "PJ" ? "Pessoa jurídica" : "Não informado"}</dd></div>
            <div><dt>{client.personType === "PJ" ? "Razão social" : "Nome"}</dt><dd>{client.name}</dd></div>
            <div><dt>CPF/CNPJ</dt><dd>{formatClientDocument(client.taxId)}</dd></div>
            <div><dt>Contato</dt><dd>{client.contactName || "Não informado"}</dd></div>
            <div><dt>E-mail</dt><dd>{client.email || "Não informado"}</dd></div>
            <div><dt>Telefone</dt><dd>{client.phone || "Não informado"}</dd></div>
            <div><dt>WhatsApp</dt><dd>{client.whatsapp || "Não informado"}</dd></div>
            <div><dt>Endereço</dt><dd>{[
              client.street,
              client.addressNumber,
              client.addressComplement,
              client.district,
              client.municipality,
              client.state,
              client.country,
            ].filter(Boolean).join(", ") || "Não informado"}</dd></div>
            <div><dt>CEP</dt><dd>{client.postalCode || "Não informado"}</dd></div>
          </dl>
          {client.notes && <div className="narrative-block" style={{ marginTop: 12 }}><h4>Observações</h4><p>{client.notes}</p></div>}
        </section>

        <section className="card">
          <div className="card-header"><div><span className="eyebrow">ESTRUTURA</span><h2>Propriedades e talhões</h2></div></div>
          {properties.length === 0 ? (
            <div className="empty-state"><Icon name="layers"/><strong>Nenhuma propriedade vinculada.</strong><small>O cliente permanece cadastrado sem inventar propriedades ou talhões.</small></div>
          ) : (
            <div className="field-ops-list">
              {properties.map((property) => (
                <div key={property.id} className="narrative-block">
                  <h4>{property.name}</h4>
                  <p>{property.municipality} / {property.state} · {property.hectares.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</p>
                  {property.fields.length === 0 ? (
                    <p className="report-empty-note">Nenhum talhão cadastrado nesta propriedade.</p>
                  ) : (
                    <div className="field-ops-list">
                      {property.fields.map((field) => (
                        <Link href={`/talhoes/${field.id}`} key={field.id} className="field-ops-list-row">
                          <span><strong>{field.name}</strong><small>{field.areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</small></span>
                          <span className="button ghost small">Abrir Talhão 360°</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2>Safras registradas</h2></div>
          <p className="report-empty-note">Safras vinculadas aos talhões. A safra atual depende da confirmação do responsável.</p>
          {seasons.length === 0 ? <p className="report-empty-note">Nenhuma safra registrada.</p> : <div className="field-ops-list">{seasons.map((season) => <Link key={season.id} href={`/talhoes/${season.fieldId}`} className="field-ops-list-row"><span><strong>{season.seasonLabel}</strong><small>{season.propertyName} · {season.fieldName}</small></span><span>{season.currentCrop || "Cultura não informada"}{season.nextCrop && <small>Próxima cultura: {season.nextCrop}</small>}</span></Link>)}</div>}
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2>Análises</h2></div>
          {analyses.length === 0 ? <p className="report-empty-note">Nenhuma análise registrada.</p> : <div className="field-ops-list">{analyses.map((analysis) => <Link key={analysis.id} href={`/analises/${analysis.id}`} className="field-ops-list-row"><span><strong>{analysis.code}</strong><small>{analysis.fieldName} · {analysis.seasonLabel}</small></span><span>{analysisStatusMeta(analysis.status).label}<small>{new Date(analysis.createdAt).toLocaleDateString("pt-BR")}</small></span></Link>)}</div>}
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2>Relatórios publicados</h2></div>
          {reports.length === 0 ? <p className="report-empty-note">Nenhum relatório publicado.</p> : <div className="field-ops-list">{reports.map((report) => <div key={report.id} className="field-ops-list-row"><span><strong>{report.analysisCode} · Revisão {report.revision}</strong><small>Publicado em {new Date(report.publishedAt).toLocaleDateString("pt-BR")}</small></span><Link href={`/relatorios/talhao/${report.analysisId}`} className="button ghost small">Abrir relatório da análise</Link></div>)}</div>}
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2>Histórico do cliente</h2></div>
          <p className="report-empty-note">Até 50 eventos recentes do cadastro e dos registros vinculados.</p>
          {history.length === 0 ? <p className="report-empty-note">Nenhum evento registrado.</p> : <div className="field-ops-list">{history.map((event) => <div key={event.id} className="field-ops-list-row"><span><strong>{HISTORY_ACTIONS[event.action] || "Evento registrado"}</strong><small>{HISTORY_ENTITIES[event.entityType] || "Registro vinculado"}</small></span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("pt-BR")}</time></div>)}</div>}
        </section>
      </div>
    </>
  );
}
