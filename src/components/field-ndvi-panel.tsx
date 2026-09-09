"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import type { VigorZone } from "@/domain/ndvi-engine";
import { VIGOR_ZONE_LABELS } from "@/domain/ndvi-engine";

type Snapshot = {
  id: string;
  capturedAt: string;
  source: string;
  cloudCoverPct: number | null;
  meanNdvi: number;
  zoneBreakdownPct: Partial<Record<VigorZone, number>>;
};

const ZONE_ORDER: VigorZone[] = ["SEM_VEGETACAO", "BAIXO", "MODERADO", "ALTO", "MUITO_ALTO"];
export const NDVI_ZONE_COLOR: Record<VigorZone, string> = {
  SEM_VEGETACAO: "#9a8468",
  BAIXO: "#d9655a",
  MODERADO: "#d89943",
  ALTO: "#8fbf6b",
  MUITO_ALTO: "#29966f",
};

/** Cor representativa do talhão inteiro (pra pintar o contorno no mapa) -- a faixa de vigor com maior
 * % de área, não uma média de cor (misturar cor de faixas diferentes não teria leitura real). */
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

/**
 * Painel de vigor vegetativo por satélite (Sentinel-2/NDVI) -- item 4 do checklist do diretor.
 * Nunca mostra número de produtividade: só a faixa de vigor (classificação determinística em
 * `src/domain/ndvi-engine.ts`) e, quando existe, o aviso de variabilidade interna do talhão.
 * Sem `COPERNICUS_CLIENT_ID`/`COPERNICUS_CLIENT_SECRET` configurados nesta instância, o botão
 * "Buscar leitura" mostra o erro claro devolvido pela API em vez de qualquer dado inventado.
 */
export function FieldNdviPanel({ fieldId, onZoneColor }: { fieldId: string; onZoneColor?: (color: string | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [variabilityNote, setVariabilityNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await fetch(`/api/fields/${fieldId}/ndvi`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (cancelled) return;
      setLatest(payload.latest ?? null);
      setVariabilityNote(payload.variability?.hasSignificantVariability ? payload.variability.note : null);
      setLoading(false);
      onZoneColor?.(dominantZoneColor(payload.latest?.zoneBreakdownPct));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  async function handleFetchSatellite() {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/fields/${fieldId}/ndvi`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? "Não foi possível buscar a leitura de satélite.");
        return;
      }
      setLatest(payload.snapshot);
      setVariabilityNote(payload.variability?.hasSignificantVariability ? payload.variability.note : null);
      onZoneColor?.(dominantZoneColor(payload.snapshot?.zoneBreakdownPct));
    } finally {
      setFetching(false);
    }
  }

  if (loading) return <div className="ndvi-panel card"><p className="ndvi-panel-meta"><Icon name="clock" size={14} /> Carregando vigor por satélite…</p></div>;

  return (
    <div className="ndvi-panel card">
      <div className="ndvi-panel-head">
        <span className="eyebrow">VIGOR VEGETATIVO (SATÉLITE)</span>
        <button type="button" className="button ghost small" onClick={handleFetchSatellite} disabled={fetching}>
          <Icon name="history" size={14} />
          {fetching ? "Buscando…" : latest ? "Atualizar leitura" : "Buscar leitura"}
        </button>
      </div>

      {error && <p className="ndvi-panel-error"><Icon name="warning" size={14} />{error}</p>}

      {!latest && !error && (
        <p className="chart-empty">Nenhuma leitura de satélite ainda para este talhão. Use “Buscar leitura” para consultar imagens Sentinel-2 recentes.</p>
      )}

      {latest && (
        <>
          <p className="ndvi-panel-meta">
            Imagem de {new Date(latest.capturedAt).toLocaleDateString("pt-BR")} · NDVI médio {latest.meanNdvi.toFixed(2)}
            {latest.cloudCoverPct != null ? ` · ${Math.round(latest.cloudCoverPct)}% nuvem` : ""}
          </p>
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
        </>
      )}
    </div>
  );
}
