import Link from "next/link";
import { Icon } from "@/components/icon";
import { requirePlatformSession } from "@/lib/auth/session";
import { listAnalyses } from "@/lib/repositories/analyses";

export const metadata = { title: "Revisar" };

export default async function RevisarPage() {
  const session = await requirePlatformSession();
  const analyses = await listAnalyses(session.tenantId, session.userId);
  const pending = analyses.filter((item: any) =>
    item.status === "AWAITING_REVIEW"
    || item.status === "INCONSISTENT"
    || item.latestInterpretationStatus === "IN_REVIEW",
  );

  return (
    <div className="simple-home simple-review-page">
      <header className="simple-home-head">
        <div><span>REVISAR</span><h1>O que precisa da sua conferência</h1><p>Abra um item, confira e decida.</p></div>
      </header>

      {pending.length > 0 ? (
        <section className="simple-review-list">
          {pending.map((item: any) => {
            const needsData = item.status === "INCONSISTENT";
            return (
              <Link href={`/analises/${item.id}`} key={item.id} className="simple-review-row">
                <span className={`simple-review-icon ${needsData ? "attention" : "ready"}`}><Icon name={needsData ? "warning" : "shield"} size={21}/></span>
                <div className="simple-review-copy">
                  <strong>{item.fieldName}</strong>
                  <small>{item.clientName} · {item.propertyName}{item.currentCrop ? ` · ${item.currentCrop}` : ""}</small>
                </div>
                <span className={`simple-review-state ${needsData ? "attention" : "ready"}`}>{needsData ? "Conferir dados" : "Pronto para revisar"}</span>
                <Icon name="chevron" size={17}/>
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="simple-empty-state">
          <span><Icon name="check" size={28}/></span>
          <strong>Nada esperando por você.</strong>
          <small>Quando alguma decisão precisar da sua conferência, ela aparece aqui.</small>
          <Link href="/inicio">Voltar ao início</Link>
        </section>
      )}
    </div>
  );
}
