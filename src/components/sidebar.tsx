"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { initials, roleLabel } from "@/lib/role-labels";
import { visibleNavigationSections } from "@/lib/navigation";

type SidebarProps = { tenantName?: string; userName?: string; role?: string; pendingAnalyses?: number };

export function Sidebar({ tenantName, userName, role, pendingAnalyses }: SidebarProps) {
  const pathname = usePathname();

  const tenantLabel = tenantName ?? "GrãoSul Agrícola";
  const tenantInitials = tenantName ? initials(tenantName) || "?" : "GS";
  const userLabel = userName ?? "Gui Bortoluzzi";
  const userInitials = userName ? initials(userName) || "?" : "GB";
  const roleText = role ? (roleLabel[role] ?? role) : "Administrador";
  const sections = visibleNavigationSections(role).map((section) => ({ ...section, items: section.items.filter((item) => item.href !== "/configuracoes") }));

  return (
    <aside className="sidebar">
      <Link className="brand" href="/dashboard" aria-label="Raiz Digital - Início">
        <Image src="/brand/logo-dark.svg" alt="Raiz Digital" width={184} height={46} priority />
      </Link>

      <div className="tenant-switcher" aria-label={`Empresa atual: ${tenantLabel}`}>
        <div className="tenant-avatar">{tenantInitials}</div>
        <div><small>Empresa atual</small><strong>{tenantLabel}</strong></div>
        <Icon name="chevron" size={16} />
      </div>

      <Link href="/analises/nova" className="sidebar-create"><Icon name="plus" size={18}/>Criar nova análise</Link>

      <nav className="sidebar-nav" aria-label="Navegação principal">
        {sections.map((section) => (
          <div className="sidebar-nav-section" key={section.label}>
            <span className="nav-label">{section.label}</span>
            {section.items.map((item) => {
              const path = item.href.split("#")[0].split("?")[0];
              const active = pathname === path || pathname.startsWith(`${path}/`);
              const count = item.href === "/analises" ? (pendingAnalyses ?? 7) : 0;
              return (
                <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                  <Icon name={item.icon} size={19} />
                  <span>{item.label}</span>
                  {count > 0 && <b aria-label={`${count} pendentes`}>{count}</b>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <Link href="/configuracoes" className={pathname.startsWith("/configuracoes") ? "active" : ""}><Icon name="settings" size={19}/><span>Configurações</span></Link>
        <div className="support-card">
          <Icon name="shield" size={20}/>
          <div><strong>Base técnica homologada</strong><small>RS Grãos · v1.0.0</small></div>
        </div>
        <div className="user-card">
          <div className="user-avatar">{userInitials}</div>
          <div><strong>{userLabel}</strong><small>{roleText}</small></div>
          <Icon name="dots" size={18}/>
        </div>
      </div>
    </aside>
  );
}
