"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SpatialPortfolioMapCanvas } from "@/components/spatial-portfolio-map-canvas";
import type { MapImageOverlay, PortfolioCanvasField, SpatialGeometry } from "@/components/spatial-map-types";

export type PortfolioMapField = {
  id: string;
  name: string;
  boundary: SpatialGeometry | null;
  clientName: string;
  propertyName: string;
  evaluationStatus: "SEM_ANALISE" | "NAO_INTERPRETAVEL" | "EM_ANDAMENTO" | "APROVADO";
};

type SatelliteStatus = "QUEDA" | "ALTA" | "ESTAVEL" | "SEM_BASELINE" | "QUALIDADE_BAIXA" | "QUALIDADE_INDETERMINADA";
type SatelliteSignal = {
  fieldId: string;
  status: SatelliteStatus;
  latestCapturedAt: string;
  latestMeanNdvi: number;
  latestQuality: "ALTA" | "MODERADA" | "BAIXA" | "INDETERMINADA";
  deltaFromBaseline: number | null;
  baselineCount: number;
};
type MapMode = "AVALIACAO" | "NDVI_ESPACIAL" | "TENDENCIA";
type SatelliteDisplayStatus = SatelliteStatus | "SEM_LEITURA";

const STATUS_COLOR: Record<PortfolioMapField["evaluationStatus"], string> = {
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

const SATELLITE_COLOR: Record<SatelliteDisplayStatus, string> = {
  QUEDA: "#B86F3E",
  ALTA: "#00C4D6",
  ESTAVEL: "#12B76A",
  SEM_BASELINE: "#3B82F6",
  QUALIDADE_BAIXA: "#D97706",
  QUALIDADE_INDETERMINADA: "#7C8791",
  SEM_LEITURA: "#9AA79F",
};
const SATELLITE_LABEL: Record<SatelliteDisplayStatus, string> = {
  QUEDA: "Queda temporal de NDVI",
  ALTA: "Alta temporal de NDVI",
  ESTAVEL: "Sem mudança temporal relevante",
  SEM_BASELINE: "Histórico em formação",
  QUALIDADE_BAIXA: "Última leitura com qualidade baixa",
  QUALIDADE_INDETERMINADA: "Qualidade não determinada",
  SEM_LEITURA: "Sem leitura Sentinel-2",
};

const NDVI_ZONE_COLOR = {
  SEM_VEGETACAO: "#9a8468",
  BAIXO: "#d9655a",
  MODERADO: "#d89943",
  ALTO: "#8fbf6b",
  MUITO_ALTO: "#29966f",
} as const;
const NDVI_ZONE_LABEL = {
  SEM_VEGETACAO: "Sem vegetação / NDVI < 0,20",
  BAIXO: "Vigor baixo / 0,20–0,40",
  MODERADO: "Vigor moderado / 0,40–0,60",
  ALTO: "Vigor alto / 0,60–0,80",
  MUITO_ALTO: "Vigor muito alto / ≥ 0,80",
} as const;
const MAX_DASHBOARD_RASTERS = 12;

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function parseRasterBounds(raw: string | null): MapImageOverlay["bounds"] | null {
  if (!raw) return null;
  const values = raw.split(",").map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [minLon, minLat, maxLon, maxLat] = values;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return [[minLat, minLon], [maxLat, maxLon]];
}

/**
 * Mapa da carteira com três leituras separadas para não misturar conceitos:
 * 1) estado agronômico do fluxo;
 * 2) raster espacial NDVI real do Sentinel-2, com classes de vigor;
 * 3) tendência temporal agregada do NDVI.
 *
 * Google/Leaflet são apenas mapa-base. Raster, talhões e posições continuam sob controle da RAIZ.
 */
export function PortfolioMap({ fields, height = 420 }: { fields: PortfolioMapField[]; height?: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<MapMode>("AVALIACAO");
  const [satelliteSignals, setSatelliteSignals] = useState<SatelliteSignal[]>([]);
  const [satelliteLoading, setSatelliteLoading] = useState(true);
  const [satelliteError, setSatelliteError] = useState<string | null>(null);
  const [rasterOverlays, setRasterOverlays] = useState<Record<string, MapImageOverlay>>({});
  const [rasterLoading, setRasterLoading] = useState(false);
  const [rasterErrors, setRasterErrors] = useState<Record<string, string>>({});

  const withGeometry = useMemo(() => fields.filter((field): field is PortfolioMapField & { boundary: SpatialGeometry } => Boolean(field.boundary)), [fields]);
  const withoutGeometry = fields.length - withGeometry.length;
  const signalsByField = useMemo(() => new Map(satelliteSignals.map((signal) => [signal.fieldId, signal])), [satelliteSignals]);
  const presentSatelliteStatuses = useMemo(() => {
    const statuses = new Set<SatelliteDisplayStatus>();
    for (const field of fields) statuses.add(signalsByField.get(field.id)?.status ?? "SEM_LEITURA");
    return (Object.keys(SATELLITE_LABEL) as SatelliteDisplayStatus[]).filter((status) => statuses.has(status));
  }, [fields, signalsByField]);

  useEffect(() => {
    const controller = new AbortController();
    setSatelliteLoading(true);
    setSatelliteError(null);
    void fetch("/api/dashboard/satellite-portfolio", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Não foi possível carregar a camada satélite (HTTP ${response.status}).`);
        return response.json() as Promise<{ signals: SatelliteSignal[] }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setSatelliteSignals(payload.signals ?? []);
        setSatelliteLoading(false);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setSatelliteError(caught instanceof Error ? caught.message : "Falha ao carregar a camada satélite.");
        setSatelliteLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (mode !== "NDVI_ESPACIAL" || satelliteLoading) {
      setRasterLoading(false);
      return;
    }

    const controller = new AbortController();
    const objectUrls: string[] = [];
    setRasterLoading(true);
    setRasterErrors({});
    setRasterOverlays({});

    const candidates = withGeometry
      .map((field) => ({ field, signal: signalsByField.get(field.id) }))
      .filter((item): item is { field: PortfolioMapField & { boundary: SpatialGeometry }; signal: SatelliteSignal } => Boolean(item.signal))
      .slice(0, MAX_DASHBOARD_RASTERS);

    void Promise.allSettled(candidates.map(async ({ field, signal }) => {
      const date = signal.latestCapturedAt.slice(0, 10);
      const response = await fetch(`/api/fields/${field.id}/ndvi/map?date=${encodeURIComponent(date)}`, { signal: controller.signal });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      const bounds = parseRasterBounds(response.headers.get("x-raiz-ndvi-bbox"));
      if (!bounds) throw new Error("Raster sem envelope geográfico válido.");
      const blob = await response.blob();
      if (!blob.type.includes("image/png")) throw new Error("Raster retornado em formato inesperado.");
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      return { fieldId: field.id, overlay: { url, bounds, opacity: 0.82 } satisfies MapImageOverlay };
    })).then((results) => {
      if (controller.signal.aborted) return;
      const nextOverlays: Record<string, MapImageOverlay> = {};
      const nextErrors: Record<string, string> = {};
      results.forEach((result, index) => {
        const fieldId = candidates[index]?.field.id;
        if (!fieldId) return;
        if (result.status === "fulfilled") nextOverlays[fieldId] = result.value.overlay;
        else nextErrors[fieldId] = result.reason instanceof Error ? result.reason.message : "Raster NDVI indisponível.";
      });
      setRasterOverlays(nextOverlays);
      setRasterErrors(nextErrors);
      setRasterLoading(false);
    });

    return () => {
      controller.abort();
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [mode, satelliteLoading, signalsByField, withGeometry]);

  const canvasFields = useMemo<PortfolioCanvasField[]>(() => withGeometry.map((field) => {
    const signal = signalsByField.get(field.id);
    if (mode === "AVALIACAO") {
      const color = STATUS_COLOR[field.evaluationStatus];
      return {
        id: field.id,
        name: field.name,
        boundary: field.boundary,
        strokeColor: color,
        fillColor: color,
        fillOpacity: 0.35,
        label: STATUS_LABEL[field.evaluationStatus],
      };
    }
    if (mode === "TENDENCIA") {
      const status: SatelliteDisplayStatus = signal?.status ?? "SEM_LEITURA";
      const color = SATELLITE_COLOR[status];
      const detail = signal ? `${formatDateOnly(signal.latestCapturedAt)} · NDVI médio ${signal.latestMeanNdvi.toFixed(2)}` : "sem leitura";
      return {
        id: field.id,
        name: field.name,
        boundary: field.boundary,
        strokeColor: color,
        fillColor: color,
        fillOpacity: 0.35,
        label: `${SATELLITE_LABEL[status]} · ${detail}`,
      };
    }

    const overlay = rasterOverlays[field.id] ?? null;
    return {
      id: field.id,
      name: field.name,
      boundary: field.boundary,
      strokeColor: "#00C4D6",
      fillColor: overlay ? "#00C4D6" : "#7C8791",
      fillOpacity: overlay ? 0 : 0.12,
      label: signal
        ? overlay
          ? `Zonas de vigor NDVI · ${formatDateOnly(signal.latestCapturedAt)}`
          : `NDVI ${formatDateOnly(signal.latestCapturedAt)} · raster indisponível`
        : "Sem leitura Sentinel-2",
      rasterOverlay: overlay,
    };
  }), [mode, rasterOverlays, signalsByField, withGeometry]);

  const handleFieldClick = useCallback((fieldId: string) => {
    router.push(mode === "AVALIACAO" ? `/talhoes/${fieldId}` : `/talhoes/${fieldId}?aba=evidencias&evidencia=satelite`);
  }, [mode, router]);

  const rasterErrorCount = Object.keys(rasterErrors).length;
  const omittedRasterCount = mode === "NDVI_ESPACIAL"
    ? Math.max(0, withGeometry.filter((field) => signalsByField.has(field.id)).length - MAX_DASHBOARD_RASTERS)
    : 0;

  return (
    <div className="portfolio-map">
      <div className="field-overview-evidence-subnav" aria-label="Camada do mapa da carteira">
        <button type="button" className={mode === "AVALIACAO" ? "active" : ""} onClick={() => setMode("AVALIACAO")}>Avaliação</button>
        <button type="button" className={mode === "NDVI_ESPACIAL" ? "active" : ""} onClick={() => setMode("NDVI_ESPACIAL")}>Zonas NDVI</button>
        <button type="button" className={mode === "TENDENCIA" ? "active" : ""} onClick={() => setMode("TENDENCIA")}>Tendência NDVI</button>
      </div>

      {mode === "NDVI_ESPACIAL" && (
        <p className="ndvi-panel-limitation">
          Zonas de vigor espectral do Sentinel-2 dentro do limite real do talhão. As cores representam classes de NDVI, não produtividade medida e não substituem mapa de colheita.
        </p>
      )}
      {mode === "TENDENCIA" && <p className="ndvi-panel-limitation">Tendência temporal do NDVI do próprio talhão. Esta leitura não atribui causa agronômica nem produtividade.</p>}
      {satelliteError && mode !== "AVALIACAO" && <p className="ndvi-panel-error">{satelliteError}</p>}
      {mode === "NDVI_ESPACIAL" && rasterLoading && <p className="ndvi-panel-meta">Carregando rasters NDVI reais do filtro atual…</p>}
      {mode === "NDVI_ESPACIAL" && rasterErrorCount > 0 && <p className="ndvi-panel-error">{rasterErrorCount} talhão(ões) possuem leitura temporal, mas o raster espacial não pôde ser carregado agora. O contorno permanece visível e nenhuma faixa é inventada.</p>}
      {omittedRasterCount > 0 && <p className="ndvi-panel-limitation">Para proteger quota e desempenho, esta visão carrega até {MAX_DASHBOARD_RASTERS} rasters por vez. Abra um talhão para visualizar os demais com detalhe.</p>}

      <SpatialPortfolioMapCanvas fields={canvasFields} height={height} onFieldClick={handleFieldClick} />

      <div className="portfolio-map-legend">
        {mode === "AVALIACAO" && (Object.keys(STATUS_LABEL) as Array<PortfolioMapField["evaluationStatus"]>).map((status) => (
          <span key={status}><i style={{ background: STATUS_COLOR[status] }}/>{STATUS_LABEL[status]}</span>
        ))}
        {mode === "TENDENCIA" && presentSatelliteStatuses.map((status) => (
          <span key={status}><i style={{ background: SATELLITE_COLOR[status] }}/>{SATELLITE_LABEL[status]}</span>
        ))}
        {mode === "NDVI_ESPACIAL" && (Object.keys(NDVI_ZONE_LABEL) as Array<keyof typeof NDVI_ZONE_LABEL>).map((zone) => (
          <span key={zone}><i style={{ background: NDVI_ZONE_COLOR[zone] }}/>{NDVI_ZONE_LABEL[zone]}</span>
        ))}
        {withoutGeometry > 0 && <span className="portfolio-map-note">{withoutGeometry} talhão(ões) sem geometria disponível, não aparecem no mapa</span>}
        {satelliteLoading && mode !== "AVALIACAO" && <span className="portfolio-map-note">Carregando histórico Sentinel-2…</span>}
      </div>
    </div>
  );
}
