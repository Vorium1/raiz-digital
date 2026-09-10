"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
export type PortfolioMapField = { id: string; name: string; boundary: Geometry | null; clientName: string; propertyName: string; evaluationStatus: "SEM_ANALISE" | "NAO_INTERPRETAVEL" | "EM_ANDAMENTO" | "APROVADO" };

const STATUS_COLOR: Record<PortfolioMapField["evaluationStatus"], string> = {
  // Nunca verde/"saudável" pra área sem avaliação real -- achado real da auditoria (item B). Cinza neutro
  // é o único tom honesto quando não há avaliação nenhuma; âmbar/vermelho só quando há um problema real
  // já identificado (não interpretável); verde só quando de fato aprovado por um profissional.
  SEM_ANALISE: "#9AA79F",
  EM_ANDAMENTO: "#3B82F6",
  NAO_INTERPRETAVEL: "#D97706",
  APROVADO: "#12B76A",
};
const STATUS_LABEL: Record<PortfolioMapField["evaluationStatus"], string> = {
  SEM_ANALISE: "Sem análise",
  EM_ANDAMENTO: "Em andamento",
  NAO_INTERPRETAVEL: "Parâmetro não interpretável",
  APROVADO: "Aprovado",
};

function geometryRings(geometry: Geometry): [number, number][][] {
  const toLatLng = (ring: number[][]) => ring.map(([lon, lat]) => [lat, lon] as [number, number]);
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][]).map(toLatLng);
  return (geometry.coordinates as number[][][][]).flatMap((polygon) => polygon.map(toLatLng));
}

/**
 * Mapa da carteira (RAIZ 2.0, Fase 1, Etapa 4) -- reaproveita a MESMA base (Esri World Imagery + rótulos
 * CARTO) já usada em `RealFieldMap`, só que desenhando VÁRIOS talhões de uma vez em vez de um só. Cor vem
 * sempre de `evaluationStatus`, calculado no banco (`getPortfolioFieldSummaries`) -- nunca uma criticidade
 * inventada aqui no componente. Clique num talhão abre o Talhão 360° real dele.
 */
export function PortfolioMap({ fields, height = 420 }: { fields: PortfolioMapField[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const withGeometry = fields.filter((f) => f.boundary);
  const withoutGeometry = fields.length - withGeometry.length;

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const L = mod.default;
      map = L.map(containerRef.current, { attributionControl: true }).setView([-15.7797, -47.9297], 4);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 19, opacity: 0.85, attribution: "&copy; OpenStreetMap contributors &copy; CARTO" }).addTo(map);

      const bounds: [number, number][] = [];
      for (const field of fieldsRef.current) {
        if (!field.boundary) continue;
        const color = STATUS_COLOR[field.evaluationStatus];
        for (const ring of geometryRings(field.boundary)) {
          const polygon = L.polygon(ring, { color, weight: 2, fillColor: color, fillOpacity: 0.35 }).addTo(map!);
          polygon.bindTooltip(`${field.name} — ${STATUS_LABEL[field.evaluationStatus]}`, { direction: "top" });
          polygon.on("click", () => router.push(`/talhoes/${field.id}`));
          bounds.push(...ring);
        }
      }
      if (bounds.length) {
        const latLngBounds = L.latLngBounds(bounds);
        if (latLngBounds.isValid()) map.fitBounds(latLngBounds, { padding: [28, 28], maxZoom: 15 });
      }
    });
    return () => { cancelled = true; map?.remove(); };
  }, [fields, router]);

  return (
    <div className="portfolio-map">
      <div ref={containerRef} className="portfolio-map-canvas" style={{ height }} />
      <div className="portfolio-map-legend">
        {(Object.keys(STATUS_LABEL) as Array<PortfolioMapField["evaluationStatus"]>).map((status) => (
          <span key={status}><i style={{ background: STATUS_COLOR[status] }}/>{STATUS_LABEL[status]}</span>
        ))}
        {withoutGeometry > 0 && <span className="portfolio-map-note">{withoutGeometry} talhão(ões) sem geometria disponível, não aparecem no mapa</span>}
      </div>
    </div>
  );
}
