"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { RealFieldMap, type MapImageOverlay } from "@/components/real-field-map";
import type { NdviObservationQuality, NdviTemporalAnalysis, VigorZone } from "@/domain/ndvi-engine";
import { NDVI_QUALITY_LABELS, VIGOR_ZONE_LABELS, classifyNdviValue } from "@/domain/ndvi-engine";

type Snapshot = {
  id: string;
  capturedAt: string;
  source: string;
  cloudCoverPct: number | null;
  meanNdvi: number;
  minNdvi?: number | null;
  maxNdvi?: number | null;
  pixelCount?: number | null;
  zoneBreakdownPct: Partial<Record<VigorZone, number>>;
};

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

const ZONE_ORDER: VigorZone[] = ["SEM_VEGETACAO", "BAIXO", "MODERADO", "ALTO", "MUITO_ALTO"];
export const NDVI_ZONE_COLOR: Record<VigorZone, string> = {
  SEM_VEGETACAO: "#9a8468",
  BAIXO: "#d9655a",
  MODERADO: "#d89943",
  ALTO: "#8fbf6b",
  MUITO_ALTO: "#29966f",
};
const CHART_MIN = 0;
const CHART_MAX = 1;

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

export function dominantZoneColor(breakdown: Partial<Record<VigorZone, number>> | undefined): string | null {
  if (!breakdown) return null;
  let best: VigorZone | null = null;
  let bestPct = -1;
  for (const zone of ZONE_ORDER) {
    const pct = breakdown[zone] ?? 0;
    if (pct > bestPct) { best = zone; bestPct = pct; }
  }
  return best ? NDVI_ZONE_COLOR[best] : null;
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
 * Centro de inteligência Sentinel-2 do talhão. Combina raster NDVI espacial real, distribuição de
 * vigor, qualidade, série temporal e variabilidade. A pessoa pode navegar entre aquisições que já
 * pertencem ao histórico auditado do talhão; o backend não aceita datas arbitrárias.
 */
export function FieldNdviPanel({ fieldId, onZoneColor }: { fieldId: string; onZoneColor?: (color: string | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [fieldBoundary, setFieldBoundary] = useState<Geometry | null>(null);
  const [variabilityNote, setVariabilityNote] = useState<string | null>(null);
  const [quality, setQuality] = useState<NdviObservationQuality>("INDETERMINADA");
  const [temporal, setTemporal] = useState<NdviTemporalAnalysis | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRasterDate, setSelectedRasterDate] = useState("");
  const [rasterLoading, setRasterLoading] = useState(false);
  const [rasterError, setRasterError] = useState<string | null>(null);
  const [rasterOverlay, setRasterOverlay] = useState<MapImageOverlay | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRefreshNote(null);
    void (async () => {
      const res = await fetch(`/api/fields/${fieldId}/ndvi`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(payload.error ?? "Não foi possível carregar os dados de satélite deste talhão.");
        setLoading(false);
        return;
      }
      const nextLatest = (payload.latest ?? null) as Snapshot | null;
      setLatest(nextLatest);
      setHistory(payload.history ?? []);
      setFieldBoundary(payload.fieldBoundary ?? null);
      setSelectedRasterDate(nextLatest?.capturedAt.slice(0, 10) ?? "");
      setVariabilityNote(payload.variability?.hasSignificantVariability ? payload.variability.note : null);
      setQuality(payload.quality ?? "INDETERMINADA");
      setTemporal(payload.temporal ?? null);
      setLoading(false);
      onZoneColor?.(dominantZoneColor(nextLatest?.zoneBreakdownPct));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  useEffect(() => {
    if (!selectedRasterDate || !fieldBoundary) {
      setRasterOverlay(null);
      setRasterError(null);
      setRasterLoading(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setRasterLoading(true);
    setRasterError(null);
    setRasterOverlay(null);

    void (async () => {
      try {
        const response = await fetch(`/api/fields/${fieldId}/ndvi/map?date=${encodeURIComponent(selectedRasterDate)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? `Mapa NDVI indisponível (HTTP ${response.status}).`);
        }
        const bounds = parseRasterBounds(response.headers.get("x-raiz-ndvi-bbox"));
        if (!bounds) throw new Error("O raster NDVI foi recebido sem envelope geográfico válido.");
        const blob = await response.blob();
        if (!blob.type.includes("image/png")) throw new Error("O raster NDVI retornou em formato inesperado.");
        objectUrl = URL.createObjectURL(blob);
        if (controller.signal.aborted) return;
        setRasterOverlay({ url: objectUrl, bounds, opacity: 0.78 });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setRasterError(caught instanceof Error ? caught.message : "Não foi possível carregar o mapa NDVI espacial.");
      } finally {
        if (!controller.signal.aborted) setRasterLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fieldId, selectedRasterDate, fieldBoundary]);

  async function handleFetchSatellite() {
    setFetching(true);
    setError(null);
    setRefreshNote(null);
    try {
      const res = await fetch(`/api/fields/${fieldId}/ndvi`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? "Não foi possível buscar a leitura de satélite.");
        return;
      }
      const nextLatest = (payload.latest ?? payload.snapshot ?? null) as Snapshot | null;
      setLatest(nextLatest);
      setHistory(payload.history ?? []);
      setFieldBoundary(payload.fieldBoundary ?? fieldBoundary);
      setSelectedRasterDate(nextLatest?.capturedAt.slice(0, 10) ?? "");
      setVariabilityNote(payload.variability?.hasSignificantVariability ? payload.variability.note : null);
      setQuality(payload.quality ?? "INDETERMINADA");
      setTemporal(payload.temporal ?? null);
      setRefreshNote(
        payload.importedCount
          ? `${payload.importedCount} aquisições Sentinel-2 recentes foram atualizadas na série temporal deste talhão.`
          : "Série temporal atualizada.",
      );
      onZoneColor?.(dominantZoneColor(nextLatest?.zoneBreakdownPct));
    } finally {
      setFetching(false);
    }
  }

  const chartHistory = useMemo(
    () => [...history].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()),
    [history],
  );
  const rasterHistory = useMemo(() => [...chartHistory].reverse(), [chartHistory]);
  const selectedRasterSnapshot = useMemo(
    () => history.find((item) => item.capturedAt.slice(0, 10) === selectedRasterDate) ?? latest,
    [history, latest, selectedRasterDate],
  );
  const rasterLegend = useMemo(
    () => ZONE_ORDER.map((zone) => ({ label: VIGOR_ZONE_LABELS[zone], color: NDVI_ZONE_COLOR[zone] })),
    [],
  );

  if (loading) return <div className="ndvi-panel card"><p className="ndvi-panel-meta"><Icon name="clock" size={14} /> Carregando vigor por satélite…</p></div>;

  return (
    <div className="ndvi-panel card">
      <div className="ndvi-panel-head">
        <span className="eyebrow">INTELIGÊNCIA ESPACIAL + TEMPORAL · SENTINEL-2</span>
        <button type="button" className="button ghost small" onClick={handleFetchSatellite} disabled={fetching}>
          <Icon name="history" size={14} />
          {fetching ? "Buscando série…" : latest ? "Atualizar 120 dias" : "Buscar histórico"}
        </button>
      </div>
      <p className="ndvi-panel-limitation"><Icon name="shield" size={13}/>A RAIZ usa Sentinel-2 L2A, mascara nuvem/sombra e recorta a visualização no limite real do talhão. O mapa é um raster NDVI real servido sob demanda; não é interpolação do laboratório e não representa produtividade.</p>

      {error && <p className="ndvi-panel-error"><Icon name="warning" size={14} />{error}</p>}
      {refreshNote && <p className="ndvi-panel-meta"><Icon name="check" size={14} />{refreshNote}</p>}

      {!latest && !error && (
        <p className="chart-empty">Nenhuma leitura de satélite ainda para este talhão. “Buscar histórico” consulta uma janela de 120 dias e grava somente aquisições reais do Sentinel-2.</p>
      )}

      {latest && (
        <>
          <p className="ndvi-panel-meta">
            Aquisição mais recente: {formatDateOnly(latest.capturedAt)} · NDVI médio {latest.meanNdvi.toFixed(2)}
            {latest.cloudCoverPct != null ? ` · ${Math.round(latest.cloudCoverPct)}% da área sem pixel válido` : ""}
            {` · ${NDVI_QUALITY_LABELS[quality]}`}
          </p>

          {fieldBoundary && (
            <div className="ndvi-history">
              <div className="field-ops-section-head compact">
                <div><span className="eyebrow">MAPA NDVI REAL</span><h2>Vigor dentro do limite do talhão</h2></div>
                {rasterHistory.length > 1 && (
                  <label className="field-overview-depth-context">
                    <span>Aquisição</span>
                    <select value={selectedRasterDate} onChange={(event) => setSelectedRasterDate(event.target.value)}>
                      {rasterHistory.map((snapshot) => (
                        <option key={snapshot.id} value={snapshot.capturedAt.slice(0, 10)}>
                          {formatDateOnly(snapshot.capturedAt)} · NDVI {snapshot.meanNdvi.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {selectedRasterSnapshot && (
                <p className="ndvi-panel-meta">
                  Visualizando {formatDateOnly(selectedRasterSnapshot.capturedAt)} · NDVI médio {selectedRasterSnapshot.meanNdvi.toFixed(2)}
                  {selectedRasterSnapshot.cloudCoverPct != null ? ` · ${Math.round(selectedRasterSnapshot.cloudCoverPct)}% sem pixel válido` : ""}
                </p>
              )}
              {rasterLoading && <p className="ndvi-panel-meta"><Icon name="clock" size={14}/>Carregando raster Sentinel-2 da aquisição…</p>}
              {rasterError && <p className="ndvi-panel-error"><Icon name="warning" size={14}/>{rasterError}</p>}
              <RealFieldMap
                boundary={fieldBoundary}
                points={[]}
                height={380}
                legend={rasterLegend}
                hint={rasterOverlay ? `Raster NDVI · ${formatDateOnly(selectedRasterDate)}` : "Imagem-base real do talhão; raster NDVI aguardando disponibilidade"}
                imageOverlay={rasterOverlay}
              />
            </div>
          )}

          <div className="ndvi-zone-bar">
            {ZONE_ORDER.filter((zone) => (latest.zoneBreakdownPct[zone] ?? 0) > 0).map((zone) => (
              <div key={zone} style={{ width: `${latest.zoneBreakdownPct[zone]}%`, background: NDVI_ZONE_COLOR[zone] }} title={`${VIGOR_ZONE_LABELS[zone]}: ${latest.zoneBreakdownPct[zone]}%`} />
            ))}
          </div>
          <ul className="ndvi-zone-legend">
            {ZONE_ORDER.filter((zone) => (latest.zoneBreakdownPct[zone] ?? 0) > 0).map((zone) => (
              <li key={zone}><i style={{ background: NDVI_ZONE_COLOR[zone] }} />{VIGOR_ZONE_LABELS[zone]} — {latest.zoneBreakdownPct[zone]}%</li>
            ))}
          </ul>
          {variabilityNote && <p className="ndvi-panel-variability"><Icon name="warning" size={14} />{variabilityNote}</p>}

          {temporal && (
            <div className="ndvi-history">
              <div className="field-ops-section-head compact">
                <div><span className="eyebrow">SINAL TEMPORAL</span><h2>Leitura atual × histórico do próprio talhão</h2></div>
              </div>
              <p className="ndvi-panel-meta">
                {temporal.previousCapturedAt && temporal.deltaFromPrevious != null
                  ? `Vs. leitura anterior (${formatDateOnly(temporal.previousCapturedAt)}): ${temporal.deltaFromPrevious >= 0 ? "+" : ""}${temporal.deltaFromPrevious.toFixed(2)} NDVI.`
                  : "Ainda sem leitura anterior comparável."}
                {temporal.baselineMedian != null && temporal.deltaFromBaseline != null
                  ? ` · Vs. mediana das ${temporal.baselineCount} anteriores: ${temporal.deltaFromBaseline >= 0 ? "+" : ""}${temporal.deltaFromBaseline.toFixed(2)}.`
                  : ""}
              </p>
              <p className={temporal.hasRelevantTemporalChange ? "ndvi-panel-variability" : "ndvi-panel-meta"}>
                {temporal.hasRelevantTemporalChange && <Icon name="warning" size={14} />}
                {temporal.note}
              </p>
            </div>
          )}
        </>
      )}

      {chartHistory.length > 0 && (
        <div className="ndvi-history">
          <div className="field-ops-section-head compact"><div><span className="eyebrow">HISTÓRICO DO TALHÃO</span><h2>{chartHistory.length} {chartHistory.length === 1 ? "aquisição registrada" : "aquisições registradas"}</h2></div></div>
          <NdviHistoryChart history={chartHistory} />
          <ul className="ndvi-history-list">
            {[...chartHistory].reverse().map((snapshot) => {
              const zone = classifyNdviValue(snapshot.meanNdvi);
              const date = snapshot.capturedAt.slice(0, 10);
              return (
                <li key={snapshot.id}>
                  <i style={{ background: NDVI_ZONE_COLOR[zone] }} />
                  <span className="ndvi-history-date">{formatDateOnly(snapshot.capturedAt)}</span>
                  <span>NDVI médio {snapshot.meanNdvi.toFixed(2)}</span>
                  <span>{VIGOR_ZONE_LABELS[zone]}</span>
                  <span className="ndvi-history-quality">{snapshot.cloudCoverPct != null ? `${Math.round(snapshot.cloudCoverPct)}% sem pixel válido` : "qualidade não informada"}</span>
                  <button type="button" className="button ghost small" onClick={() => setSelectedRasterDate(date)} disabled={selectedRasterDate === date}>
                    {selectedRasterDate === date ? "No mapa" : "Ver mapa"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function NdviHistoryChart({ history }: { history: Snapshot[] }) {
  const width = 560;
  const height = 130;
  const padding = { top: 8, right: 12, bottom: 20, left: 12 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const xFor = (index: number) => padding.left + (history.length === 1 ? plotWidth / 2 : (index / (history.length - 1)) * plotWidth);
  const yFor = (value: number) => padding.top + (1 - (Math.min(CHART_MAX, Math.max(CHART_MIN, value)) - CHART_MIN) / (CHART_MAX - CHART_MIN)) * plotHeight;

  const linePath = history.map((snapshot, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(snapshot.meanNdvi).toFixed(1)}`).join(" ");
  const bandStops: Array<{ zone: VigorZone; from: number; to: number }> = [
    { zone: "SEM_VEGETACAO", from: 0, to: 0.2 },
    { zone: "BAIXO", from: 0.2, to: 0.4 },
    { zone: "MODERADO", from: 0.4, to: 0.6 },
    { zone: "ALTO", from: 0.6, to: 0.8 },
    { zone: "MUITO_ALTO", from: 0.8, to: 1 },
  ];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ndvi-history-chart" role="img" aria-label="NDVI médio ao longo do tempo, faixas de vigor coloridas ao fundo">
      {bandStops.map((band) => (
        <rect key={band.zone} x={padding.left} y={yFor(band.to)} width={plotWidth} height={yFor(band.from) - yFor(band.to)} fill={NDVI_ZONE_COLOR[band.zone]} opacity={0.12} />
      ))}
      <path d={linePath} fill="none" stroke="#29966f" strokeWidth={2} />
      {history.map((snapshot, index) => (
        <circle key={snapshot.id} cx={xFor(index)} cy={yFor(snapshot.meanNdvi)} r={3.5} fill={NDVI_ZONE_COLOR[classifyNdviValue(snapshot.meanNdvi)]} stroke="#0c1512" strokeWidth={1} />
      ))}
      {history.length > 1 && (
        <>
          <text x={xFor(0)} y={height - 4} fontSize={9} fill="var(--ink-muted, #7a8a82)" textAnchor="start">{formatDateOnly(history[0].capturedAt)}</text>
          <text x={xFor(history.length - 1)} y={height - 4} fontSize={9} fill="var(--ink-muted, #7a8a82)" textAnchor="end">{formatDateOnly(history[history.length - 1].capturedAt)}</text>
        </>
      )}
    </svg>
  );
}
