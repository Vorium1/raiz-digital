import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { ClientManager } from "@/components/client-manager";
import { PageIntro, StatusBadge } from "@/components/ui";
import { clients } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Clientes" };

export default function ClientsPage() {
  const database = isDatabaseMode();
  return <><Topbar eyebrow="Cadastros" title="Clientes"/><div className="content-wrap">
    <PageIntro title="Carteira agronômica" description="Clientes, propriedades, talhões e histórico técnico organizados em uma única visão multiempresa."/>
    {database ? <ClientManager/> : <>
      <div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo. Estes registros são exemplos e não são persistidos.</span></div>
      <div className="toolbar"><div className="toolbar-left"><label className="search-box"><Icon name="search" size={17}/><input aria-label="Buscar cliente ou município" placeholder="Buscar cliente ou município"/></label><select className="select" aria-label="Filtrar município"><option>Todos os municípios</option></select></div><button className="button secondary"><Icon name="plus" size={16}/>Novo cliente</button></div>
      <div className="data-card"><table className="data-table"><thead><tr><th>Cliente</th><th>Propriedades</th><th>Área acompanhada</th><th>Análises</th><th>Situação</th><th></th></tr></thead><tbody>{clients.map(client=><tr key={client.name}><td><strong>{client.name}</strong><small><Icon name="location" size={10}/> {client.city}</small></td><td>{client.properties}</td><td>{client.hectares} ha</td><td>{client.analyses}</td><td><StatusBadge tone={client.status === "Ativo" ? "success" : "waiting"}>{client.status}</StatusBadge></td><td><Icon name="chevron" size={17}/></td></tr>)}</tbody></table></div>
    </>}
  </div></>;
}
