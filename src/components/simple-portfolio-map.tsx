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
};

const PRESENTATION = {
  SEM_ANALISE: { color: "#aeb9b1", label: "Sem dados ainda" },
  NAO_INTERPRETAVEL: { color: "#d6a04b", label: "Precisa conferir" },
  EM_ANDAMENTO: { color: "#6d9f78", label: "Em andamento" },
  APROVADO: { color: "#2f7d45", label: "Pronto" },
} as const;

export function SimplePortfolioMap({ fields, height = 390 }: { fields: SimplePortfolioField[]; height?: number }) {
  const router = useRouter();
  const mapped = useMemo<PortfolioCanvasField[]>(() => fields
    .filter((field): field is SimplePortfolioField & { boundary: SpatialGeometry } => Boolean(field.boundary))
    .map((field) => {
      const state = PRESENTATION[field.evaluationStatus];
      return {
        id: field.id,
        name: field.name,
        boundary: field.boundary,
        strokeColor: state.color,
        fillColor: state.color,
        fillOpacity: 0.22,
        label: `${field.name} · ${state.label}`,
      };
    }), [fields]);

  const openField = useCallback((fieldId: string) => {
    router.push(`/talhoes/${fieldId}`);
  }, [router]);

  return (
    <div className="simple-map-wrap">
      <SpatialPortfolioMapCanvas fields={mapped} height={height} onFieldClick={openField}/>
      <div className="simple-map-hint">Clique em um talhão para abrir.</div>
    </div>
  );
}
