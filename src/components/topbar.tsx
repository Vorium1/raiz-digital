import Link from "next/link";
import { Icon } from "@/components/icon";
import { LogoutButton } from "@/components/logout-button";
import { NotificationsButton } from "@/components/notifications-button";
import { isDatabaseMode } from "@/lib/data-mode";

export function Topbar({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  const database = isDatabaseMode();
  return (
    <header className="topbar">
      <div className="page-title">
        {eyebrow && <span>{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        {children}
        {database && <LogoutButton />}
        {database ? <NotificationsButton/> : <button type="button" className="icon-button notification-button" aria-label="Abrir notificações"><Icon name="bell"/><i aria-hidden="true" /></button>}
        <Link href="/analises/nova" className="button primary topbar-create"><Icon name="plus" size={18}/>Nova análise</Link>
      </div>
    </header>
  );
}
