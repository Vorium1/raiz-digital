import Link from "next/link";
import { Icon } from "@/components/icon";
import { requirePlatformSession } from "@/lib/auth/session";
import { getDashboardSnapshot } from "@/lib/repositories/dashboard";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { userActionAlerts, userAttentionHref, userAttentionTitle } from "@/domain/user-attention";

export const metadata = { title: "Atenção" };

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

export default async function AtencaoPage() {
  const session = await requirePlatformSession();
  const [snapshot, alerts] = await Promise.all([
    getDashboardSnapshot(session.tenantId, session.userId),
    listOperationalAlerts(session.tenantId, session.userId),
  ]);

  const canReview = REVIEW_ROLES.has(session.role);
  const reviewCount = canReview ? snapshot.awaitingReview + snapshot.inconsistent : 0;
  const actionable = userActionAlerts(alerts);
  const total = reviewCount + actionable.length;

  return (
    <div className="simple-home simple-attention-page">
      <header className="simple-home-head">
        <div><span>ATENÇÃO</span><h1>O que precisa de você</h1><p>Só aparece aqui o que você realmente consegue resolver.</p></div>
      </header>

      {total > 0 ? (
        <section className="simple-attention-list">
          {reviewCount > 0 && (
            <Link href="/revisar" className="simple-attention-row">
              <span className="simple-attention-row-icon review"><Icon name="shield" size={21}/></span>
              <div><strong>{reviewCount === 1 ? "Há uma revisão esperando" : `Há ${reviewCount} revisões esperando`}</strong><small>Confira e decida quando puder.</small></div>
              <span className="simple-attention-action">Revisar</span>
              <Icon name="chevron" size={17}/>
            </Link>
          )}

          {actionable.map((alert) => (
            <Link href={userAttentionHref(alert)} key={alert.id} className="simple-attention-row">
              <span className="simple-attention-row-icon"><Icon name="warning" size={21}/></span>
              <div>
                <strong>{userAttentionTitle(alert.category)}</strong>
                <small>{alert.context}{alert.date ? ` · ${new Date(alert.date).toLocaleDateString("pt-BR")}` : ""}</small>
              </div>
              <span className="simple-attention-action">Resolver</span>
              <Icon name="chevron" size={17}/>
            </Link>
          ))}
        </section>
      ) : (
        <section className="simple-empty-state">
          <span><Icon name="check" size={28}/></span>
          <strong>Nada precisa da sua atenção agora.</strong>
          <small>Você pode continuar trabalhando normalmente.</small>
          <Link href="/inicio">Voltar ao início</Link>
        </section>
      )}
    </div>
  );
}
