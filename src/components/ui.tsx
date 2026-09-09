import Link from "next/link";
import { Icon } from "@/components/icon";
import { classificationColor } from "@/lib/classification-colors";

export function StatusBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`status-badge ${tone}`}><i />{children}</span>;
}

/**
 * "Semáforo" de uma classificação agronômica (ex.: "Muito baixo", "Adequado",
 * "Alto") -- mesma cor usada no mapa (`classificationColor`), agora também
 * na tabela de resultado por parâmetro. Não decide nada: só reaproveita a
 * cor já definida pra aquele rótulo. Layout idêntico ao `StatusBadge`
 * (mesma pílula/bolinha), cor vem do rótulo em vez de um tom fixo.
 */
export function ClassificationBadge({ label }: { label: string }) {
  const color = classificationColor(label);
  return (
    <span className="status-badge" style={{ background: `${color}1f`, color }}>
      <i style={{ background: color }} />
      {label}
    </span>
  );
}

export function EmptyState({ icon = "leaf", title, description, action }: { icon?: "leaf" | "file" | "map"; title: string; description: string; action?: { href: string; label: string } }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} size={26}/></div>
      <h3>{title}</h3><p>{description}</p>
      {action && <Link className="button secondary" href={action.href}>{action.label}<Icon name="arrow" size={16}/></Link>}
    </div>
  );
}

export function PageIntro({ title, description }: { title: string; description: string }) {
  return <div className="page-intro"><h2>{title}</h2><p>{description}</p></div>;
}
