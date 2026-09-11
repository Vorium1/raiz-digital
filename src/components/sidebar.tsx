"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
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
        <BrandLogo variant="dark" height={38} priority />
      </Link>

      <div className="tenant-switcher" aria-label={`Empresa atual: ${tenantLabel}`}>
        <div className="tenant-avatar">{tenantInitials}</div>
        <div><small>Empresa atual</small><strong>{tenantLabel}</strong></div>
        <Icon name="chevron" size={16} />
      </div>

      {/* Patch de responsividade (Fase 3, fechamento final): CTA "Criar nova análise" removido daqui pra
          desktop -- a mesma ação já existe na topbar ("Nova análise", src/components/topbar.tsx) e manter
          os dois consumia altura útil da sidebar sem necessidade. O mobile preserva sua própria ação
          equivalente em MobileNavigation, que não depende deste componente. */}

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

      {/* Card "Base técnica homologada" removido da navegação lateral (consumia altura fixa permanente e
          declarava situação técnica com texto hardcoded). A informação em si não foi apagada do sistema --
          continua existindo em /biblioteca-tecnica e nas rotas de regras/homologação; só não fica mais
          fixada na sidebar. */}
      <div className="sidebar-bottom">
        <Link href="/configuracoes" className={pathname.startsWith("/configuracoes") ? "active" : ""}><Icon name="settings" size={19}/><span>Configurações</span></Link>
        <div className="user-card">
          <div className="user-avatar">{userInitials}</div>
          <div><strong>{userLabel}</strong><small>{roleText}</small></div>
          <Icon name="dots" size={18}/>
        </div>
      </div>
    </aside>
  );
}
