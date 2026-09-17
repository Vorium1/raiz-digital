"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { initials } from "@/lib/role-labels";

type SidebarProps = {
  tenantName?: string;
  userName?: string;
  role?: string;
  isPlatformCurator?: boolean;
  pendingAnalyses?: number;
};

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);
const SEND_HREF = "/analises/nova?etapa=laudo&nivel=interpretacao-rapida";

export function Sidebar({ userName, role, pendingAnalyses }: SidebarProps) {
  const pathname = usePathname();
  const canReview = Boolean(role && REVIEW_ROLES.has(role));
  const avatar = userName ? initials(userName) || "R" : "R";

  const items = [
    { href: "/inicio", label: "Início", icon: "home" as const },
    { href: SEND_HREF, label: "Enviar", icon: "upload" as const },
    { href: "/talhoes", label: "Talhões", icon: "layers" as const },
    ...(canReview ? [{ href: "/revisar", label: "Revisar", icon: "shield" as const }] : []),
    { href: "/resultados", label: "Resultados", icon: "file" as const },
  ];

  function activeFor(href: string) {
    const path = href.split("?")[0];
    if (path === "/inicio") return pathname === "/inicio" || pathname === "/dashboard";
    if (path === "/analises/nova") return pathname.startsWith("/analises/nova");
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <aside className="simple-sidebar" aria-label="Navegação principal">
      <Link className="simple-brand" href="/inicio" aria-label="RAIZ Digital - Início">
        <BrandLogo variant="light" height={40} priority />
      </Link>

      <nav className="simple-nav">
        {items.map((item) => {
          const active = activeFor(item.href);
          const count = item.label === "Revisar" ? (pendingAnalyses ?? 0) : 0;
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              <span className="simple-nav-icon"><Icon name={item.icon} size={23}/>{count > 0 && <b aria-label={`${count} itens para revisar`}>{count > 9 ? "9+" : count}</b>}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="simple-sidebar-bottom">
        <Link href="/configuracoes" aria-label="Mais opções" title="Mais opções"><Icon name="settings" size={21}/><span>Mais</span></Link>
        <span className="simple-avatar" title={userName ?? "Usuário"}>{avatar}</span>
      </div>
    </aside>
  );
}
