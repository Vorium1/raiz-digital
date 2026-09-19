"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { SpatialPortfolioMapCanvas } from "@/components/spatial-portfolio-map-canvas";
import type { PortfolioCanvasField, SpatialGeometry } from "@/components/spatial-map-types";

export type SimplePortfolioField = {
  id: string;
  name: string;
  boundary: SpatialGeometry | null;
  clientName: string;
  propertyName: string;
  evaluationStatus: "SEM_ANALISE" | "NAO_INTERPRETAVEL" | "EM_ANDAMENTO" | "APROVADO";
  ndviMean?: number | null;
  ndviZoneBreakdown?: Record<string, number> | null;
};


const NDVI_ZONE_COLOR: Record<string, string> = {
  SEM_VEGETACAO: "#8e7d66",
  BAIXO: "#e43d30",
  MODERADO: "#f1bd3f",
  ALTO: "#77bf55",
  MUITO_ALTO: "#138f58",
};

function dominantNdviZone(zoneBreakdown: Record<string, number> | null | undefined) {
  if (!zoneBreakdown) return null;
  return Object.entries(zoneBreakdown)
    .filter(([, pct]) => Number(pct) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? null;
}

const PRESENTATION = {
  SEM_ANALISE: { color: "#aeb9b1", label: "Sem dados ainda" },
  NAO_INTERPRETAVEL: { color: "#d6a04b", label: "Precisa continuar" },
  EM_ANDAMENTO: { color: "#6d9f78", label: "Em andamento" },
  APROVADO: { color: "#2f7d45", label: "Pronto" },
} as const;

export function SimplePortfolioMap({ fields, height = 390 }: { fields: SimplePortfolioField[]; height?: number }) {
  const router = useRouter();
  const mapped = useMemo<PortfolioCanvasField[]>(() => fields
    .filter((field): field is SimplePortfolioField & { boundary: SpatialGeometry } => Boolean(field.boundary))
    .map((field) => {
      const state = PRESENTATION[field.evaluationStatus];
      const ndviZone = dominantNdviZone(field.ndviZoneBreakdown);
      const ndviColor = ndviZone ? NDVI_ZONE_COLOR[ndviZone] : null;
      return {
        id: field.id,
        name: field.name,
        boundary: field.boundary,
        strokeColor: state.color,
        fillColor: ndviColor ?? state.color,
        fillOpacity: ndviColor ? 0.38 : 0.22,
        label: field.ndviMean != null
          ? `${field.name} · NDVI ${field.ndviMean.toFixed(2)}`
          : `${field.name} · ${state.label}`,
      };
    }), [fields]);

  const openField = useCallback((fieldId: string) => {
    router.push(`/talhoes/${fieldId}`);
  }, [router]);

  return (
    <div className="simple-map-wrap">
      <SpatialPortfolioMapCanvas fields={mapped} height={height} onFieldClick={openField}/>
      <div className="simple-map-hint">Cor interna = vigor NDVI quando disponível. Borda = estado da análise. Clique no talhão para abrir.</div>
    </div>
  );
}
