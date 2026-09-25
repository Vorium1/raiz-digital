"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { RealFieldMap, type MapImageOverlay, type MapLegendEntry } from "@/components/real-field-map";
import type { NdviTemporalAnalysis, VigorZone } from "@/domain/ndvi-engine";
import { VIGOR_ZONE_LABELS } from "@/domain/ndvi-engine";

type Snapshot = {
  id: string;
  capturedAt: string;
  meanNdvi: number;
  minNdvi?: number | null;
  maxNdvi?: number | null;
  cloudCoverPct: number | null;
  rasterObjectKey?: string | null;
  zoneBreakdownPct?: Partial<Record<VigorZone, number>>;
};

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

const ZONE_ORDER: VigorZone[] = ["SEM_VEGETACAO", "BAIXO", "MODERADO", "ALTO", "MUITO_ALTO"];
const ZONE_COLOR: Record<VigorZone, string> = {
  SEM_VEGETACAO: "#9a8468",
  BAIXO: "#d9655a",
  MODERADO: "#d89943",
  ALTO: "#8fbf6b",
  MUITO_ALTO: "#29966f",
};

function dominantZone(breakdown: Partial<Record<VigorZone, number>> | undefined) {
  if (!breakdown) return null;
  let best: VigorZone | null = null;
  let bestPct = -1;
  for (const zone of ZONE_ORDER) {
    const pct = breakdown[zone] ?? 0;
    if (pct > bestPct) {
      best = zone;
      bestPct = pct;
    }
  }
  return best && bestPct >= 0 ? { zone: best, pct: bestPct } : null;
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function parseBounds(raw: string | null): MapImageOverlay["bounds"] | null {
  if (!raw) return null;
  const values = raw.split(",").map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [minLon, minLat, maxLon, maxLat] = values;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return [[minLat, minLon], [maxLat, maxLon]];
}

function hasRaster(snapshot: Snapshot | null | undefined): snapshot is Snapshot {
  return Boolean(snapshot?.rasterObjectKey);
}

function compactZoneLabel(zone: VigorZone) {
  if (zone === "SEM_VEGETACAO") return "Solo exposto / sem vegetação";
  const label = VIGOR_ZONE_LABELS[zone];
  if (typeof label === "string" && label.trim()) return label.replace("Vigor ", "");
  return zone.replaceAll("_", " ").toLocaleLowerCase("pt-BR");
}

function temporalLabel(temporal: NdviTemporalAnalysis | null) {
  if (!temporal) return { label: "Sem comparação", detail: "Histórico insuficiente" };
  if (temporal.direction === "ALTA") return { label: "Vigor em alta", detail: temporal.note };
  if (temporal.direction === "QUEDA") return { label: "Vigor em queda", detail: temporal.note };
  if (temporal.direction === "ESTAVEL") return { label: "Vigor estável", detail: temporal.note };
  return { label: "Sem comparação", detail: temporal.note };
}

export function SimpleFieldVigor({ fieldId, areaHa }: { fieldId: string; areaHa: number }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [temporal, setTemporal] = useState<NdviTemporalAnalysis | null>(null);
  const [boundary, setBoundary] = useState<Geometry | null>(null);
  const [rasterDate, setRasterDate] = useState("");
  const [overlay, setOverlay] = useState<MapImageOverlay | null>(null);
  const [error, setError] = useState("");
  const [rasterError, setRasterError] = useState("");
  const [rasterAttempt, setRasterAttempt] = useState(0);

  const archivedHistory = useMemo(
    () => history.filter(hasRaster).sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()),
    [history],
  );
  const archived = archivedHistory[0] ?? null;
  const selected = useMemo(
    () => archivedHistory.find((snapshot) => snapshot.capturedAt.slice(0, 10) === rasterDate) ?? archived,
    [archivedHistory, rasterDate, archived],
  );
  const dominant = useMemo(() => dominantZone(selected?.zoneBreakdownPct), [selected]);
  const trend = useMemo(() => temporalLabel(temporal), [temporal]);
  const vigorLegend = useMemo<MapLegendEntry[]>(
    () => ZONE_ORDER.map((zone) => ({ label: VIGOR_ZONE_LABELS[zone], color: ZONE_COLOR[zone] })),
    [],
  );

  function applyPayload(payload: any) {
    const nextHistory = Array.isArray(payload.history) ? payload.history as Snapshot[] : [];
    const nextLatest = (payload.latest ?? payload.snapshot ?? null) as Snapshot | null;
    const newestRaster = nextHistory.find(hasRaster) ?? null;
    setHistory(nextHistory);
    setLatest(nextLatest);
    setTemporal((payload.temporal ?? null) as NdviTemporalAnalysis | null);
    setBoundary(payload.fieldBoundary ?? null);
    setRasterDate((current) => {
      if (current && nextHistory.some((snapshot) => hasRaster(snapshot) && snapshot.capturedAt.slice(0, 10) === current)) return current;
      return newestRaster?.capturedAt.slice(0, 10) ?? "";
    });
  }

  async function refreshSatellite({ automatic = false }: { automatic?: boolean } = {}) {
    setRefreshing(true);
    if (!automatic) setError("");
    try {
      const response = await fetch(`/api/fields/${fieldId}/ndvi`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível buscar a imagem de satélite agora.");
      applyPayload(payload);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível buscar a imagem de satélite agora.");
      return false;
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/fields/${fieldId}/ndvi`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o vigor desta área.");
        if (cancelled) return;
        applyPayload(payload);
        const nextHistory = Array.isArray(payload.history) ? payload.history as Snapshot[] : [];
        const hasArchivedRaster = nextHistory.some(hasRaster);
        if (!hasArchivedRaster && payload.fieldBoundary) {
          const key = `raiz:ndvi:auto:${fieldId}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, new Date().toISOString());
            const refreshed = await refreshSatellite({ automatic: true });
            if (!refreshed) sessionStorage.removeItem(key);
          }
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Não foi possível carregar o vigor desta área.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  useEffect(() => {
    if (!rasterDate || !boundary) {
      setOverlay(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setOverlay(null);
    setRasterError("");
    void (async () => {
      try {
        const response = await fetch(`/api/fields/${fieldId}/ndvi/map?date=${encodeURIComponent(rasterDate)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Imagem NDVI indisponível para esta data.");
        const bounds = parseBounds(response.headers.get("x-raiz-ndvi-bbox"));
        if (!bounds) throw new Error("Imagem NDVI sem envelope geográfico válido.");
        const blob = await response.blob();
        if (!blob.type.includes("image/png")) throw new Error("Formato inesperado da imagem NDVI.");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setOverlay({ url: objectUrl, bounds, opacity: 0.74 });
      } catch (caught) {
        if (!controller.signal.aborted) setRasterError(caught instanceof Error ? caught.message : "Não foi possível abrir o mapa de vigor.");
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fieldId, rasterDate, boundary, rasterAttempt]);

  return (
    <section className="simple-field-vigor">
      <div className="simple-field-vigor-head">
        <div>
          <span>NDVI · VIGOR VEGETATIVO</span>
          <h2>Leitura do talhão por satélite</h2>
          <p>Sentinel-2 real, recortado no limite cadastrado desta área.</p>
        </div>
        <button type="button" onClick={() => void refreshSatellite()} disabled={refreshing}>
          <Icon name="history" size={14}/>
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {loading ? (
        <div className="simple-field-vigor-loading"><Icon name="clock" size={18}/> Buscando a leitura mais recente…</div>
      ) : selected && boundary ? (
        <>
          <div className="simple-field-vigor-meta">
            <strong>{formatDate(selected.capturedAt)}</strong>
            <span>Sentinel-2 · leitura real da área</span>
            {selected.cloudCoverPct != null && <span>{Math.round(selected.cloudCoverPct)}% sem pixel válido</span>}
          </div>

          {archivedHistory.length > 1 && (
            <div className="simple-field-vigor-timeline" aria-label="Histórico de aquisições NDVI">
              {archivedHistory.slice(0, 8).map((snapshot) => {
                const date = snapshot.capturedAt.slice(0, 10);
                const active = date === rasterDate;
                return (
                  <button key={snapshot.id} type="button" className={active ? "active" : ""} onClick={() => setRasterDate(date)}>
                    <span>{formatDate(snapshot.capturedAt)}</span>
                    <strong>{snapshot.meanNdvi.toFixed(2)}</strong>
                  </button>
                );
              })}
            </div>
          )}

          <div className="simple-field-vigor-summary">
            <div>
              <span>NDVI MÉDIO</span>
              <strong>{selected.meanNdvi.toFixed(2)}</strong>
              <small>média desta aquisição</small>
            </div>
            <div>
              <span>MAIOR VIGOR</span>
              <strong>{selected.maxNdvi != null ? selected.maxNdvi.toFixed(2) : "—"}</strong>
              <small>maior NDVI observado</small>
            </div>
            <div>
              <span>FAIXA DOMINANTE</span>
              <strong>{dominant ? compactZoneLabel(dominant.zone) : "—"}</strong>
              <small>{dominant ? `${dominant.pct.toFixed(1)}% · ~${(areaHa * dominant.pct / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha` : "sem distribuição disponível"}</small>
            </div>
            <div>
              <span>TENDÊNCIA</span>
              <strong>{trend.label}</strong>
              <small>{temporal?.deltaFromPrevious != null ? `${temporal.deltaFromPrevious >= 0 ? "+" : ""}${temporal.deltaFromPrevious.toFixed(2)} vs. leitura comparável anterior` : "aguardando histórico comparável"}</small>
            </div>
          </div>

          <div className="simple-field-vigor-zones">
            <div className="simple-field-vigor-zones-head">
              <strong>Distribuição do vigor no talhão</strong>
              <small>% da área e hectares aproximados por faixa</small>
            </div>
            <div className="simple-field-vigor-zone-bar" aria-label="Distribuição das faixas de vigor">
              {ZONE_ORDER.map((zone) => {
                const pct = selected.zoneBreakdownPct?.[zone] ?? 0;
                return pct > 0 ? <span key={zone} style={{ width: `${pct}%`, background: ZONE_COLOR[zone] }} title={`${VIGOR_ZONE_LABELS[zone]}: ${pct.toFixed(1)}%`} /> : null;
              })}
            </div>
            <div className="simple-field-vigor-zone-grid">
              {ZONE_ORDER.map((zone) => {
                const pct = selected.zoneBreakdownPct?.[zone] ?? 0;
                const hectares = areaHa > 0 ? areaHa * pct / 100 : null;
                return (
                  <div key={zone} className={pct > 0 ? "" : "muted"}>
                    <i style={{ background: ZONE_COLOR[zone] }} />
                    <span>
                      <b>{compactZoneLabel(zone)}</b>
                      <small>{hectares != null ? `~${hectares.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha` : "—"}</small>
                    </span>
                    <strong>{pct.toFixed(1)}%</strong>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="simple-field-vigor-map-head">
            <div>
              <span>MAPA NDVI</span>
              <strong>Onde o vigor muda dentro da área</strong>
            </div>
            <small>{formatDate(selected.capturedAt)}</small>
          </div>

          {rasterError ? (
            <div role="alert" className="simple-field-vigor-empty">
              <strong>Não foi possível abrir a imagem de satélite.</strong>
              <p>{rasterError}</p>
              <button type="button" className="button ghost small" onClick={() => setRasterAttempt((attempt) => attempt + 1)}>Tentar carregar imagem novamente</button>
            </div>
          ) : overlay ? (
            <RealFieldMap
              boundary={boundary}
              points={[]}
              height={430}
              hint={`NDVI · ${formatDate(selected.capturedAt)} · limite do talhão em destaque`}
              imageOverlay={overlay}
              legend={vigorLegend}
            />
          ) : (
            <div className="simple-field-vigor-map-loading">
              <Icon name="leaf" size={21}/>
              <div>
                <strong>Preparando o mapa de vigor…</strong>
                <small>A imagem Sentinel-2 está sendo posicionada sobre o talhão.</small>
              </div>
            </div>
          )}

          <div className="simple-field-vigor-explainer">
            <div>
              <strong>Como ler</strong>
              <p>As cores mostram diferenças de vigor vegetativo dentro do limite cadastrado. A área em hectares é uma aproximação obtida pela participação de pixels válidos em cada faixa.</p>
            </div>
            <div>
              <strong>O que não significa</strong>
              <p>NDVI não é previsão direta de sacas, nem identifica sozinho deficiência, doença ou causa de baixo vigor. Solo, cultura, estágio, clima e manejo precisam ser avaliados em conjunto.</p>
            </div>
          </div>

          {temporal?.note && <p className="simple-field-vigor-note"><strong>Comparação temporal:</strong> {temporal.note}</p>}
        </>
      ) : (
        <div className="simple-field-vigor-empty">
          <span><Icon name="leaf" size={23}/></span>
          <div>
            <strong>{refreshing ? "Buscando imagem de satélite…" : latest ? "A leitura existe, mas a imagem ainda não foi preparada." : "Ainda não há imagem de vigor."}</strong>
            <small>A RAIZ tenta preparar isso automaticamente. Você também pode tocar em Atualizar.</small>
          </div>
        </div>
      )}

      {error && (
        <details className="simple-field-vigor-error">
          <summary>Não foi possível atualizar o satélite agora.</summary>
          <small>{error}</small>
        </details>
      )}
    </section>
  );
}
