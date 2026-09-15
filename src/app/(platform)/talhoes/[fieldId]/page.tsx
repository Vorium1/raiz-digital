import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { requirePlatformSession } from "@/lib/auth/session";
import { getFieldOverview } from "@/lib/repositories/field-overview";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { FieldOverviewTabs } from "@/components/field-overview-tabs";
import { FieldSatelliteDecisionStrip } from "@/components/field-satellite-decision-strip";
import { AssistantEntryButton } from "@/components/assistant-entry-button";

export const metadata = { title: "Talhão" };

/**
 * Talhão 360° (RAIZ 2.0, Fase 1, Etapa 5) -- endereço estável por talhão (`/talhoes/[fieldId]`), o
 * principal item da Fase 1. Só existe em modo banco de dados real -- não há um talhão real "de exemplo"
 * pra simular em modo demo sem inventar dado, e nenhuma outra tela desta base tem uma versão demo desta
 * profundidade (mesma convenção do resto da Inteligência Agronômica).
 */
export default async function FieldOverviewPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  const session = await requirePlatformSession();
  const overview = await getFieldOverview(session.tenantId, fieldId, session.userId);
  if (!overview) notFound();

  // Antes filtrava por NOME do talhão (alert.context === field.name) -- bug real achado numa revisão
  // independente: dois talhões homônimos (nome igual, em propriedades/clientes diferentes -- cenário real
  // e comum, ex. "Área 01" em duas fazendas) mostrariam os alertas um do outro. `listOperationalAlerts` já
  // é isolado por empresa (`withTenant`); o filtro abaixo agora usa o id real do talhão (fields.id), nunca
  // o nome, então talhões homônimos nunca mais se confundem.
  const alerts = (await listOperationalAlerts(session.tenantId, session.userId)).filter((alert) => alert.fieldId === fieldId);

  return (
    <>
      <Topbar eyebrow="Talhões" title={overview.field.name}><AssistantEntryButton label={`Pergunte sobre ${overview.field.name}`}/></Topbar>
      <div className="content-wrap">
        <FieldSatelliteDecisionStrip fieldId={fieldId} snapshots={overview.ndviSnapshots} />
        <FieldOverviewTabs overview={overview} alerts={alerts} />
      </div>
    </>
  );
}
