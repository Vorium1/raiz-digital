"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

const primaryItems = [
  { href: "/dashboard", label: "Início", icon: "home" },
  { href: "/clientes", label: "Clientes", icon: "users" },
  { href: "/analises", label: "Análises", icon: "flask" },
] as const;

const moreItems = [
  { href: "/coletas", label: "Coletas e mapas", description: "Campo, GPS e pontos de amostragem", icon: "map" },
  { href: "/relatorios", label: "Relatórios", description: "Laudos e documentos publicados", icon: "file" },
  { href: "/historico", label: "Histórico", description: "Evolução por área e safra", icon: "history" },
  { href: "/financeiro", label: "Financeiro", description: "Assinatura, cobranças e pagamentos", icon: "wallet" },
  { href: "/configuracoes", label: "Configurações", description: "Equipe, integrações e governança", icon: "settings" },
] as const;

export function MobileNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = moreItems.some((item) => isActive(item.href));

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Fechar menu adicional"
          onClick={() => setMoreOpen(false)}
        />
      )}

      <section id="mobile-more-menu" className={`mobile-more-sheet ${moreOpen ? "open" : ""}`} aria-hidden={!moreOpen}>
        <div className="mobile-sheet-handle" aria-hidden="true" />
        <div className="mobile-sheet-heading">
          <div>
            <span className="eyebrow">MAIS OPÇÕES</span>
            <h2>O que você quer fazer?</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar menu" onClick={() => setMoreOpen(false)}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <nav className="mobile-more-list" aria-label="Navegação adicional">
          {moreItems.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}>
              <span className="mobile-more-icon"><Icon name={item.icon} size={20} /></span>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <Icon name="chevron" size={17} />
            </Link>
          ))}
        </nav>
      </section>

      <nav className="mobile-bottom-nav" aria-label="Navegação principal no celular">
        <Link href={primaryItems[0].href} className={isActive(primaryItems[0].href) ? "active" : ""} aria-current={isActive(primaryItems[0].href) ? "page" : undefined}>
          <Icon name={primaryItems[0].icon} size={21} /><span>{primaryItems[0].label}</span>
        </Link>
        <Link href={primaryItems[1].href} className={isActive(primaryItems[1].href) ? "active" : ""} aria-current={isActive(primaryItems[1].href) ? "page" : undefined}>
          <Icon name={primaryItems[1].icon} size={21} /><span>{primaryItems[1].label}</span>
        </Link>
        <Link href="/analises/nova" className={`mobile-create-action ${isActive("/analises/nova") ? "active" : ""}`} aria-label="Criar nova análise">
          <span><Icon name="plus" size={25} /></span><b>Criar</b>
        </Link>
        <Link href={primaryItems[2].href} className={isActive(primaryItems[2].href) && !isActive("/analises/nova") ? "active" : ""} aria-current={isActive(primaryItems[2].href) && !isActive("/analises/nova") ? "page" : undefined}>
          <Icon name={primaryItems[2].icon} size={21} /><span>{primaryItems[2].label}</span>
        </Link>
        <button
          type="button"
          className={moreOpen || moreActive ? "active" : ""}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen((current) => !current)}
        >
          <Icon name="dots" size={21} /><span>Mais</span>
        </button>
      </nav>
    </>
  );
}
