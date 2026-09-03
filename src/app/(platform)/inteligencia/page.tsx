import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { EmptyState, PageIntro, StatusBadge } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { requirePlatformSession } from "@/lib/auth/session";
import { listAllInterpretations } from "@/lib/repositories/interpretations";
import { demoInterpretationsLog } from "@/lib/demo-data";

export const metadata = { title: "Inteligência Agronômica" };

const STATUS_META: Record<string, { label: string; tone: "success" | "review" | "waiting" }> = {
  CALCULATED: { label: "Calculado, sem revisão", tone: "waiting" },
  IN_REVIEW: { label: "Aguardando validação técnica", tone: "review" },
  APPROVED: { label: "Aprovada", tone: "success" },
  AI_GENERATED: { label: "Narrativa gerada", tone: "waiting" },
  PUBLISHED: { label: "Publicada", tone: "success" },
  SUPERSEDED: { label: "Substituída", tone: "waiting" },
};

export default async function AgronomicIntelligenceHubPage() {
  if (!isDatabaseMode()) {
    return <><Topbar eyebrow="Inteligência · demonstração" title="Inteligência Agronômica"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo — exemplos ilustrativos.</span></div><PageIntro title="Registro de interpretações" description="Toda vez que o motor determinístico roda, fica registrado aqui — com regra usada, versão e status de revisão."/>
      <section className="card"><table className="report-table">
        <thead><tr><th>Análise</th><th>Cliente / talhão</th><th>Safra / cultura</th><th>Base técnica</th><th>Confiabilidade</th><th>Status</th><th>Calculado em</th></tr></thead>
        <tbody>{demoInterpretationsLog.map((item) => {
          const meta = STATUS_META[item.status] ?? { label: item.status, tone: "waiting" as const };
          return (
            <tr key={`${item.code}-${item.revision}`}>
              <td><Link href={`/analises/${item.code}`}>{item.code}</Link> · rev {item.revision}</td>
              <td>{item.client} · {item.field}</td>
              <td>{item.season} · {item.crop}</td>
              <td>{item.cropProfile}</td>
              <td>{item.confidence}</td>
              <td><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></td>
              <td>{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
            </tr>
          );
        })}</tbody>
      </table></section>
    </div></>;
  }
  const session = await requirePlatformSession();
  const interpretations = await listAllInterpretations(session.tenantId, session.userId);

  return (
    <>
      <Topbar eyebrow="Inteligência" title="Inteligência Agronômica"/>
      <div className="content-wrap">
        <PageIntro title="Registro de interpretações" description="Cada execução do motor determinístico gera uma revisão aqui — com a regra/base técnica usada, o nível de confiança e o status de revisão. Nenhuma linha é gerada por IA."/>
        <section className="card">
          {interpretations.length ? (
            <table className="report-table">
              <thead><tr><th>Análise</th><th>Cliente / talhão</th><th>Safra / cultura</th><th>Base técnica</th><th>Confiabilidade</th><th>Status</th><th>Calculado em</th></tr></thead>
              <tbody>{interpretations.map((item: any) => {
                const meta = STATUS_META[item.status] ?? { label: item.status, tone: "waiting" as const };
                return (
                  <tr key={item.id}>
                    <td><Link href={`/analises/${item.analysisId}`}>{item.analysisCode}</Link> · rev {item.revision}</td>
                    <td>{item.clientName} · {item.fieldName}</td>
                    <td>{item.seasonLabel} · {item.currentCrop || "—"}</td>
                    <td>{item.cropProfileName ?? "—"}</td>
                    <td>{item.confidenceScore ?? "—"}</td>
                    <td><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></td>
                    <td>{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <EmptyState icon="leaf" title="Nenhuma interpretação calculada ainda" description="Rode o motor determinístico numa análise para começar o registro." action={{ href: "/analises", label: "Ver análises" }}/>}
        </section>
      </div>
    </>
  );
}
