"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import type { VigorZone } from "@/domain/ndvi-engine";
import { VIGOR_ZONE_LABELS, classifyNdviValue } from "@/domain/ndvi-engine";

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

const ZONE_ORDER: VigorZone[] = ["SEM_VEGETACAO", "BAIXO", "MODERADO", "ALTO", "MUITO_ALTO"];
export const NDVI_ZONE_COLOR: Record<VigorZone, string> = {
  SEM_VEGETACAO: "#9a8468",
  BAIXO: "#d9655a",
  MODERADO: "#d89943",
  ALTO: "#8fbf6b",
  MUITO_ALTO: "#29966f",
};
/** Domínio fixo do gráfico de histórico: 0 a 1, o mesmo intervalo das faixas de vigor de
 * `classifyNdviValue` (0.2/0.4/0.6/0.8) -- nunca auto-escalado pelo min/max do histórico, que
 * exageraria visualmente diferenças pequenas e sem relação com a escala real de vigor. */
const CHART_MIN = 0;
const CHART_MAX = 1;

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
 *
 * Fase 2, Bloco D: a base só guarda estatística agregada por aquisição (mean/min/max/nuvem, sem
 * raster) -- por isso a camada espacial (recorte NDVI pixel a pixel) não está disponível, e este
 * painel organiza o que existe de verdade: histórico de aquisições em gráfico + lista, com data e
 * qualidade de cada uma. Nunca colore o polígono do talhão inteiro como se fosse um raster real --
 * `dominantZoneColor` é sempre uma aproximação de talhão inteiro, documentada como tal por quem chama.
 */
export function FieldNdviPanel({ fieldId, onZoneColor }: { fieldId: string; onZoneColor?: (color: string | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
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
      setHistory(payload.history ?? []);
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
      setHistory((current) => [payload.snapshot, ...current.filter((s) => s.id !== payload.snapshot.id)]);
      setVariabilityNote(payload.variability?.hasSignificantVariability ? payload.variability.note : null);
      onZoneColor?.(dominantZoneColor(payload.snapshot?.zoneBreakdownPct));
    } finally {
      setFetching(false);
    }
  }

  // Histórico ordenado do mais antigo pro mais recente pro gráfico ler da esquerda pra direita.
  const chartHistory = useMemo(() => [...history].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()), [history]);

  if (loading) return <div className="ndvi-panel card"><p className="ndvi-panel-meta"><Icon name="clock" size={14} /> Carregando vigor por satélite…</p></div>;

  return (
    <div className="ndvi-panel card">
      <div className="ndvi-panel-head">
        <span className="eyebrow">VIGOR VEGETATIVO (SATÉLITE) · SÓ ESTATÍSTICA AGREGADA</span>
        <button type="button" className="button ghost small" onClick={handleFetchSatellite} disabled={fetching}>
          <Icon name="history" size={14} />
          {fetching ? "Buscando…" : latest ? "Atualizar leitura" : "Buscar leitura"}
        </button>
      </div>
      <p className="ndvi-panel-limitation"><Icon name="shield" size={13}/>Esta instância guarda só a estatística por aquisição (NDVI médio/mín/máx e % de nuvem dentro do talhão) — não há imagem/raster armazenado, então não é possível recortar um mapa espacial de vigor pixel a pixel aqui. A dependência concreta para habilitar essa camada é armazenar (ou servir sob demanda) o raster/tile da cena, o que esta instância ainda não faz.</p>

      {error && <p className="ndvi-panel-error"><Icon name="warning" size={14} />{error}</p>}

      {!latest && !error && (
        <p className="chart-empty">Nenhuma leitura de satélite ainda para este talhão. Use “Buscar leitura” para consultar imagens Sentinel-2 recentes.</p>
      )}

      {latest && (
        <>
          <p className="ndvi-panel-meta">
            Imagem de {new Date(latest.capturedAt).toLocaleDateString("pt-BR")} · NDVI médio {latest.meanNdvi.toFixed(2)}
            {latest.cloudCoverPct != null ? ` · ${Math.round(latest.cloudCoverPct)}% da área do talhão sem pixel válido nesta cena` : ""}
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

      {chartHistory.length > 0 && (
        <div className="ndvi-history">
          <div className="field-ops-section-head compact"><div><span className="eyebrow">HISTÓRICO DO TALHÃO</span><h2>{chartHistory.length} {chartHistory.length === 1 ? "aquisição registrada" : "aquisições registradas"}</h2></div></div>
          <NdviHistoryChart history={chartHistory} />
          <ul className="ndvi-history-list">
            {[...chartHistory].reverse().map((snapshot) => {
              const zone = classifyNdviValue(snapshot.meanNdvi);
              return (
                <li key={snapshot.id}>
                  <i style={{ background: NDVI_ZONE_COLOR[zone] }} />
                  <span className="ndvi-history-date">{new Date(snapshot.capturedAt).toLocaleDateString("pt-BR")}</span>
                  <span>NDVI médio {snapshot.meanNdvi.toFixed(2)}</span>
                  <span>{VIGOR_ZONE_LABELS[zone]}</span>
                  <span className="ndvi-history-quality">{snapshot.cloudCoverPct != null ? `${Math.round(snapshot.cloudCoverPct)}% sem pixel válido` : "qualidade não informada"}</span>
                  <span className="ndvi-history-source">{snapshot.source}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Gráfico de linha do NDVI médio ao longo do tempo, em SVG puro (sem biblioteca). Domínio fixo 0-1,
 * com faixas de vigor como fundo, pra leitura consistente com a barra de faixas acima. Só descreve o
 * que existe -- nenhuma tendência ou anomalia é calculada aqui (esse texto viria da IA/curador, não
 * deste componente).
 */
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
          <text x={xFor(0)} y={height - 4} fontSize={9} fill="var(--ink-muted, #7a8a82)" textAnchor="start">{new Date(history[0].capturedAt).toLocaleDateString("pt-BR")}</text>
          <text x={xFor(history.length - 1)} y={height - 4} fontSize={9} fill="var(--ink-muted, #7a8a82)" textAnchor="end">{new Date(history[history.length - 1].capturedAt).toLocaleDateString("pt-BR")}</text>
        </>
      )}
    </svg>
  );
}
