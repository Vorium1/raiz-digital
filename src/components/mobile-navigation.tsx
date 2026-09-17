"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);
const SEND_HREF = "/analises/nova?etapa=laudo&nivel=interpretacao-rapida";

export function MobileNavigation({ role }: { role?: string; isPlatformCurator?: boolean }) {
  const pathname = usePathname();
  const canReview = Boolean(role && REVIEW_ROLES.has(role));

  const isActive = (href: string) => {
    const path = href.split("?")[0];
    if (path === "/inicio") return pathname === "/inicio" || pathname === "/dashboard";
    if (path === "/analises/nova") return pathname.startsWith("/analises/nova");
    if (path === "/analises" && href.includes("status=revisao")) return pathname.startsWith("/analises") && !pathname.startsWith("/analises/nova");
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <nav className="simple-mobile-nav" aria-label="Navegação principal no celular">
      <Link href="/inicio" className={isActive("/inicio") ? "active" : ""}>
        <Icon name="home" size={21}/><span>Início</span>
      </Link>
      <Link href="/coletas" className={isActive("/coletas") ? "active" : ""}>
        <Icon name="layers" size={21}/><span>Talhões</span>
      </Link>
      <Link href={SEND_HREF} className={`simple-mobile-send ${isActive(SEND_HREF) ? "active" : ""}`} aria-label="Enviar dados">
        <span><Icon name="upload" size={23}/></span><b>Enviar</b>
      </Link>
      {canReview ? (
        <Link href="/analises?status=revisao" className={isActive("/analises?status=revisao") ? "active" : ""}>
          <Icon name="shield" size={21}/><span>Revisar</span>
        </Link>
      ) : (
        <Link href="/relatorios" className={isActive("/relatorios") ? "active" : ""}>
          <Icon name="file" size={21}/><span>Resultados</span>
        </Link>
      )}
      <Link href="/configuracoes" className={isActive("/configuracoes") ? "active" : ""}>
        <Icon name="dots" size={21}/><span>Mais</span>
      </Link>
    </nav>
  );
}
