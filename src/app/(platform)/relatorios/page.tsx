import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { EmptyState, PageIntro } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Relatórios" };

export default function ReportsPage() {
  const database = isDatabaseMode();
  return <><Topbar eyebrow="Entrega" title="Relatórios"/><div className="content-wrap">{!database && <div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo.</span></div>}<PageIntro title="Documentos técnicos publicados" description="Laudos oficiais com mapas, memória técnica, assinatura do responsável e QR Code de validação."/><div className="toolbar"><div className="toolbar-left"><label className="search-box"><Icon name="search" size={17}/><input aria-label="Buscar relatório" placeholder="Buscar relatório"/></label></div></div><div className="data-card"><EmptyState icon="file" title={database ? "Nenhum relatório publicado" : "Nenhum relatório nesta demonstração"} description={database ? "A RAIZ só publicará um documento depois de interpretação homologada, revisão e aprovação registradas." : "Quando uma interpretação for aprovada, a versão oficial aparecerá aqui com histórico e link seguro para envio."} action={{href:"/analises",label:"Ver análises"}}/></div></div></>;
}
