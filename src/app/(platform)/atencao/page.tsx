import Link from "next/link";
import { Icon } from "@/components/icon";
import { requirePlatformSession } from "@/lib/auth/session";
import { listOperationalAlerts } from "@/lib/repositories/alerts";
import { userActionAlerts, userAttentionHref, userAttentionTitle } from "@/domain/user-attention";

export const metadata = { title: "Atenção" };

export default async function AtencaoPage() {
  const session = await requirePlatformSession();
  const alerts = await listOperationalAlerts(session.tenantId, session.userId);
  const actionable = userActionAlerts(alerts);
  const seenDestinations = new Set<string>();
  const attentionItems = actionable.filter((alert) => {
    const href = userAttentionHref(alert);
    if (seenDestinations.has(href)) return false;
    seenDestinations.add(href);
    return true;
  });
  const total = attentionItems.length;

  return (
    <div className="simple-home simple-attention-page">
      <header className="simple-home-head">
        <div><span>ATENÇÃO</span><h1>O que precisa de você</h1><p>Só aparece aqui o que você realmente consegue resolver.</p></div>
      </header>

      {total > 0 ? (
        <section className="simple-attention-list">
          {attentionItems.map((alert) => (
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
