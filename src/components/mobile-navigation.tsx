"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { visibleNavigationSections } from "@/lib/navigation";

const PRIMARY_HREFS = ["/dashboard", "/clientes", "/analises"];

export function MobileNavigation({ role }: { role?: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    const path = href.split("#")[0].split("?")[0];
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const sections = visibleNavigationSections(role);
  const allItems = sections.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label })));
  const primaryItems = PRIMARY_HREFS.map((href) => allItems.find((item) => item.href === href)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const moreSections = sections.map((section) => ({ ...section, items: section.items.filter((item) => !PRIMARY_HREFS.includes(item.href)) })).filter((section) => section.items.length > 0);
  const moreActive = moreSections.some((section) => section.items.some((item) => isActive(item.href)));

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
          {moreSections.map((section) => (
            <div key={section.label} className="mobile-more-group">
              <span className="mobile-more-group-label">{section.label}</span>
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}>
                  <span className="mobile-more-icon"><Icon name={item.icon} size={20} /></span>
                  <span><strong>{item.label}</strong></span>
                  <Icon name="chevron" size={17} />
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </section>

      <nav className="mobile-bottom-nav" aria-label="Navegação principal no celular">
        {primaryItems[0] && <Link href={primaryItems[0].href} className={isActive(primaryItems[0].href) ? "active" : ""} aria-current={isActive(primaryItems[0].href) ? "page" : undefined}>
          <Icon name={primaryItems[0].icon} size={21} /><span>{primaryItems[0].label}</span>
        </Link>}
        {primaryItems[1] && <Link href={primaryItems[1].href} className={isActive(primaryItems[1].href) ? "active" : ""} aria-current={isActive(primaryItems[1].href) ? "page" : undefined}>
          <Icon name={primaryItems[1].icon} size={21} /><span>{primaryItems[1].label}</span>
        </Link>}
        <Link href="/analises/nova" className={`mobile-create-action ${isActive("/analises/nova") ? "active" : ""}`} aria-label="Criar nova análise">
          <span><Icon name="plus" size={25} /></span><b>Criar</b>
        </Link>
        {primaryItems[2] && <Link href={primaryItems[2].href} className={isActive(primaryItems[2].href) && !isActive("/analises/nova") ? "active" : ""} aria-current={isActive(primaryItems[2].href) && !isActive("/analises/nova") ? "page" : undefined}>
          <Icon name={primaryItems[2].icon} size={21} /><span>{primaryItems[2].label}</span>
        </Link>}
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
