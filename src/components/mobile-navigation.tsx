"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { visibleNavigationSections } from "@/lib/navigation";

const SEND_HREF = "/analises/nova?etapa=laudo&nivel=interpretacao-rapida";

export function MobileNavigation({ role, isPlatformCurator }: { role?: string; isPlatformCurator?: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    const path = href.split("#")[0].split("?")[0];
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const sections = visibleNavigationSections(role, isPlatformCurator);
  const allItems = sections.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label })));
  const start = allItems.find((item) => item.href === "/inicio");
  const map = allItems.find((item) => item.href === "/mapas");
  const review = allItems.find((item) => item.label === "Revisões") ?? allItems.find((item) => item.href === "/analises");
  const excluded = new Set([start?.href, map?.href, review?.href, SEND_HREF].filter(Boolean));
  const moreSections = sections
    .map((section) => ({ ...section, items: section.items.filter((item) => !excluded.has(item.href)) }))
    .filter((section) => section.items.length > 0);
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
            <span className="eyebrow">RAIZ UX 2.0</span>
            <h2>Mais opções</h2>
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

      <nav className="mobile-bottom-nav ux2-bottom-nav" aria-label="Navegação principal no celular">
        {start && (
          <Link href={start.href} className={isActive(start.href) ? "active" : ""} aria-current={isActive(start.href) ? "page" : undefined}>
            <Icon name="home" size={21} /><span>Início</span>
          </Link>
        )}
        {map && (
          <Link href={map.href} className={isActive(map.href) ? "active" : ""} aria-current={isActive(map.href) ? "page" : undefined}>
            <Icon name="map" size={21} /><span>Mapa</span>
          </Link>
        )}
        <Link href={SEND_HREF} className={`mobile-create-action ux2-send-action ${isActive("/analises/nova") ? "active" : ""}`} aria-label="Enviar dados para a RAIZ">
          <span><Icon name="upload" size={24} /></span><b>Enviar</b>
        </Link>
        {review && (
          <Link href={review.href} className={isActive(review.href) && !isActive("/analises/nova") ? "active" : ""} aria-current={isActive(review.href) ? "page" : undefined}>
            <Icon name={review.icon} size={21} /><span>{review.label === "Revisões" ? "Revisões" : "Operações"}</span>
          </Link>
        )}
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
