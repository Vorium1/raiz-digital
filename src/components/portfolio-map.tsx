"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
export type PortfolioMapField = { id: string; name: string; boundary: Geometry | null; clientName: string; propertyName: string; evaluationStatus: "SEM_ANALISE" | "NAO_INTERPRETAVEL" | "EM_ANDAMENTO" | "APROVADO" };

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
type MapMode = "AVALIACAO" | "SATELITE";
type SatelliteDisplayStatus = SatelliteStatus | "SEM_LEITURA";

const STATUS_COLOR: Record<PortfolioMapField["evaluationStatus"], string> = {
  // Nunca verde/"saudável" pra área sem avaliação real. Cinza neutro é o único tom honesto quando não
  // há avaliação; verde só quando a interpretação foi aprovada por um profissional.
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

/**
 * Cores da camada temporal não significam produtividade nem "saúde". Elas identificam somente o estado
 * do sinal calculado pelo mesmo motor temporal do Talhão 360°.
 */
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

function geometryRings(geometry: Geometry): [number, number][][] {
  const toLatLng = (ring: number[][]) => ring.map(([lon, lat]) => [lat, lon] as [number, number]);
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][]).map(toLatLng);
  return (geometry.coordinates as number[][][][]).flatMap((polygon) => polygon.map(toLatLng));
}

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/**
 * Mapa da carteira com duas leituras independentes sobre a mesma geometria real:
 * - Avaliação agronômica: estado do fluxo de interpretação/aprovação.
 * - Satélite temporal: sinal Sentinel-2 já persistido, calculado pelo mesmo motor do Talhão 360°.
 *
 * A camada satélite só lê o banco ao abrir o dashboard; nunca chama o Copernicus nem consome quota externa.
 */
export function PortfolioMap({ fields, height = 420 }: { fields: PortfolioMapField[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const [mode, setMode] = useState<MapMode>("AVALIACAO");
  const [satelliteSignals, setSatelliteSignals] = useState<SatelliteSignal[]>([]);
  const [satelliteLoading, setSatelliteLoading] = useState(true);
  const [satelliteError, setSatelliteError] = useState<string | null>(null);

  const withGeometry = fields.filter((field) => field.boundary);
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
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const L = mod.default;
      map = L.map(containerRef.current, { attributionControl: true }).setView([-15.7797, -47.9297], 4);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 19, opacity: 0.85, attribution: "&copy; OpenStreetMap contributors &copy; CARTO" }).addTo(map);

      const bounds: [number, number][] = [];
      for (const field of fields) {
        if (!field.boundary) continue;
        const signal = signalsByField.get(field.id);
        const satelliteStatus: SatelliteDisplayStatus = signal?.status ?? "SEM_LEITURA";
        const color = mode === "AVALIACAO" ? STATUS_COLOR[field.evaluationStatus] : SATELLITE_COLOR[satelliteStatus];
        const label = mode === "AVALIACAO"
          ? STATUS_LABEL[field.evaluationStatus]
          : `${SATELLITE_LABEL[satelliteStatus]}${signal ? ` · ${formatDateOnly(signal.latestCapturedAt)} · NDVI ${signal.latestMeanNdvi.toFixed(2)}` : ""}`;

        for (const ring of geometryRings(field.boundary)) {
          const polygon = L.polygon(ring, { color, weight: 2, fillColor: color, fillOpacity: 0.35 }).addTo(map!);
          polygon.bindTooltip(`${field.name} — ${label}`, { direction: "top" });
          polygon.on("click", () => router.push(mode === "SATELITE" ? `/talhoes/${field.id}?aba=evidencias&evidencia=satelite` : `/talhoes/${field.id}`));
          bounds.push(...ring);
        }
      }
      if (bounds.length) {
        const latLngBounds = L.latLngBounds(bounds);
        if (latLngBounds.isValid()) map.fitBounds(latLngBounds, { padding: [28, 28], maxZoom: 15 });
      }
    });
    return () => { cancelled = true; map?.remove(); };
  }, [fields, mode, router, signalsByField]);

  return (
    <div className="portfolio-map">
      <div className="field-overview-evidence-subnav" aria-label="Camada do mapa da carteira">
        <button type="button" className={mode === "AVALIACAO" ? "active" : ""} onClick={() => setMode("AVALIACAO")}>Avaliação agronômica</button>
        <button type="button" className={mode === "SATELITE" ? "active" : ""} onClick={() => setMode("SATELITE")}>Satélite temporal{satelliteLoading ? " · carregando" : ""}</button>
      </div>
      {mode === "SATELITE" && <p className="ndvi-panel-limitation">Camada temporal Sentinel-2: mostra tendência/qualidade da leitura, não produtividade nem causa agronômica. Clique no talhão para abrir as evidências espaciais e temporais.</p>}
      {mode === "SATELITE" && satelliteError && <p className="ndvi-panel-error">{satelliteError}</p>}
      <div ref={containerRef} className="portfolio-map-canvas" style={{ height }} />
      <div className="portfolio-map-legend">
        {mode === "AVALIACAO"
          ? (Object.keys(STATUS_LABEL) as Array<PortfolioMapField["evaluationStatus"]>).map((status) => (
              <span key={status}><i style={{ background: STATUS_COLOR[status] }}/>{STATUS_LABEL[status]}</span>
            ))
          : presentSatelliteStatuses.map((status) => (
              <span key={status}><i style={{ background: SATELLITE_COLOR[status] }}/>{SATELLITE_LABEL[status]}</span>
            ))}
        {withoutGeometry > 0 && <span className="portfolio-map-note">{withoutGeometry} talhão(ões) sem geometria disponível, não aparecem no mapa</span>}
      </div>
    </div>
  );
}
