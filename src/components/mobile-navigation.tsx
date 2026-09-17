"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";

const REVIEW_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);
const SEND_HREF = "/enviar";

export function MobileNavigation({ role }: { role?: string; isPlatformCurator?: boolean }) {
  const pathname = usePathname();
  const canReview = Boolean(role && REVIEW_ROLES.has(role));

  const isActive = (href: string) => {
    const path = href.split("?")[0];
    if (path === "/inicio") return pathname === "/inicio" || pathname === "/dashboard";
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <nav className="simple-mobile-nav" aria-label="Navegação principal no celular">
      <Link href="/inicio" className={isActive("/inicio") ? "active" : ""}>
        <Icon name="home" size={21}/><span>Início</span>
      </Link>
      <Link href="/talhoes" className={isActive("/talhoes") ? "active" : ""}>
        <Icon name="layers" size={21}/><span>Talhões</span>
      </Link>
      <Link href={SEND_HREF} className={`simple-mobile-send ${isActive(SEND_HREF) ? "active" : ""}`} aria-label="Enviar dados">
        <span><Icon name="upload" size={23}/></span><b>Enviar</b>
      </Link>
      {canReview ? (
        <Link href="/revisar" className={isActive("/revisar") ? "active" : ""}>
          <Icon name="shield" size={21}/><span>Revisar</span>
        </Link>
      ) : (
        <Link href="/resultados" className={isActive("/resultados") ? "active" : ""}>
          <Icon name="file" size={21}/><span>Resultados</span>
        </Link>
      )}
      <Link href="/configuracoes" className={isActive("/configuracoes") ? "active" : ""}>
        <Icon name="dots" size={21}/><span>Mais</span>
      </Link>
    </nav>
  );
}
