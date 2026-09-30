import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { Topbar } from "@/components/topbar";
import { PageIntro, StatusBadge } from "@/components/ui";
import { requirePlatformSession } from "@/lib/auth/session";
import { ClientError, getClient360 } from "@/lib/repositories/clients";

export const metadata = { title: "Cliente 360°" };

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

  const { client, properties } = overview;
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
            <div><dt>CPF/CNPJ</dt><dd>{client.taxId || "Não informado"}</dd></div>
            <div><dt>Contato</dt><dd>{client.contactName || "Não informado"}</dd></div>
            <div><dt>E-mail</dt><dd>{client.email || "Não informado"}</dd></div>
            <div><dt>Telefone</dt><dd>{client.phone || "Não informado"}</dd></div>
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
      </div>
    </>
  );
}
