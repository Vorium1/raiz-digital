"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { RealFieldMap, type MapImageOverlay } from "@/components/real-field-map";

type Snapshot = {
  id: string;
  capturedAt: string;
  meanNdvi: number;
  cloudCoverPct: number | null;
  rasterObjectKey?: string | null;
  zoneBreakdownPct?: Record<string, number>;
};

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

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

export function SimpleFieldVigor({ fieldId }: { fieldId: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [boundary, setBoundary] = useState<Geometry | null>(null);
  const [rasterDate, setRasterDate] = useState("");
  const [overlay, setOverlay] = useState<MapImageOverlay | null>(null);
  const [error, setError] = useState("");

  const archived = useMemo(() => history.find(hasRaster) ?? null, [history]);

  function applyPayload(payload: any) {
    const nextHistory = Array.isArray(payload.history) ? payload.history as Snapshot[] : [];
    const nextLatest = (payload.latest ?? payload.snapshot ?? null) as Snapshot | null;
    const newestRaster = nextHistory.find(hasRaster) ?? null;
    setHistory(nextHistory);
    setLatest(nextLatest);
    setBoundary(payload.fieldBoundary ?? null);
    setRasterDate(newestRaster?.capturedAt.slice(0, 10) ?? "");
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
        objectUrl = URL.createObjectURL(blob);
        if (!controller.signal.aborted) setOverlay({ url: objectUrl, bounds, opacity: 0.78 });
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Não foi possível abrir o mapa de vigor.");
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fieldId, rasterDate, boundary]);

  return (
    <section className="simple-field-vigor">
      <div className="simple-field-vigor-head">
        <div>
          <span>VIGOR DA ÁREA</span>
          <h2>Imagem de satélite</h2>
          <p>Leitura real Sentinel-2 dentro do limite deste talhão.</p>
        </div>
        <button type="button" onClick={() => void refreshSatellite()} disabled={refreshing}>
          <Icon name="history" size={14}/>
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {loading ? (
        <div className="simple-field-vigor-loading"><Icon name="clock" size={18}/> Buscando a leitura mais recente…</div>
      ) : archived && boundary ? (
        <>
          <div className="simple-field-vigor-meta">
            <strong>{formatDate(archived.capturedAt)}</strong>
            <span>NDVI médio {archived.meanNdvi.toFixed(2)}</span>
            {archived.cloudCoverPct != null && <span>{Math.round(archived.cloudCoverPct)}% sem pixel válido</span>}
          </div>
          <RealFieldMap
            boundary={boundary}
            points={[]}
            height={340}
            hint={overlay ? `Vigor da área · ${formatDate(archived.capturedAt)}` : "Carregando imagem de vigor…"}
            imageOverlay={overlay}
          />
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
