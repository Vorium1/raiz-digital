import Link from "next/link";
import { Icon } from "@/components/icon";

export function StatusBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`status-badge ${tone}`}><i />{children}</span>;
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
