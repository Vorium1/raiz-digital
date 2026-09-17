import Link from "next/link";
import { Icon } from "@/components/icon";
import { requirePlatformSession } from "@/lib/auth/session";
import { listAnalyses } from "@/lib/repositories/analyses";

export const metadata = { title: "Revisar" };

export default async function RevisarPage() {
  const session = await requirePlatformSession();
  const analyses = await listAnalyses(session.tenantId, session.userId);
  const pending = analyses.filter((item: any) =>
    item.status === "AWAITING_REVIEW" || item.latestInterpretationStatus === "IN_REVIEW",
  );

  return (
    <div className="simple-home simple-review-page">
      <header className="simple-home-head">
        <div><span>REVISAR</span><h1>O que está pronto para sua decisão</h1><p>Abra, confira e decida.</p></div>
      </header>

      {pending.length > 0 ? (
        <section className="simple-review-list">
          {pending.map((item: any) => (
            <Link href={`/analise/${item.id}`} key={item.id} className="simple-review-row">
              <span className="simple-review-icon ready"><Icon name="shield" size={21}/></span>
              <div className="simple-review-copy">
                <strong>{item.fieldName}</strong>
                <small>{item.clientName} · {item.propertyName}{item.currentCrop ? ` · ${item.currentCrop}` : ""}</small>
              </div>
              <span className="simple-review-state ready">Pronto para revisar</span>
              <Icon name="chevron" size={17}/>
            </Link>
          ))}
        </section>
      ) : (
        <section className="simple-empty-state">
          <span><Icon name="check" size={28}/></span>
          <strong>Nada esperando por você.</strong>
          <small>Quando uma decisão estiver pronta, ela aparece aqui.</small>
          <Link href="/inicio">Voltar ao início</Link>
        </section>
      )}
    </div>
  );
}
