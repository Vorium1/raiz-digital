"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RealFieldMap, type MapImageOverlay, type MapPoint } from "@/components/real-field-map";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { classificationColor } from "@/lib/classification-colors";
import { computeParameterDistribution } from "@/domain/parameter-distribution";
import { NDVI_ZONE_COLOR } from "@/components/field-ndvi-panel";
import { VIGOR_ZONE_LABELS } from "@/domain/ndvi-engine";

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };

type OrderSummary = {
  id: string; code: string; status: string; fieldId: string; fieldName: string; propertyName: string; clientName: string;
  seasonLabel: string; currentCrop?: string | null; fieldBoundary: Geometry; plannedPoints: number; collectedPoints: number;
  points: MapPoint[];
};

type MapLayerResponse = {
  fieldBoundary: Geometry;
  points: MapPoint[];
  availableParameters: string[];
  interpretationStatus: string | null;
  confidence: { score: number; level: string } | null;
  trace: { cropProfileCode: string | null; cropProfileVersion: string | null } | null;
  analysisId: string | null;
  reportId: string | null;
};

type NdviSnapshot = {
  capturedAt: string;
  meanNdvi: number;
  source: string;
  cloudCoverPct: number | null;
  rasterObjectKey?: string | null;
  zoneBreakdownPct: Partial<Record<string, number>>;
};

const STATUS_LABEL: Record<string, string> = {
  CALCULATED: "Calculado, sem revisão",
  IN_REVIEW: "Aguardando validação técnica",
  APPROVED: "Aprovada",
  AI_GENERATED: "Narrativa gerada",
  PUBLISHED: "Publicada",
};

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

function parseRasterBounds(raw: string | null): MapImageOverlay["bounds"] | null {
  if (!raw) return null;
  const values = raw.split(",").map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [minLon, minLat, maxLon, maxLat] = values;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return [[minLat, minLon], [maxLat, maxLon]];
}

function hasArchivedRaster(snapshot: NdviSnapshot | null | undefined): snapshot is NdviSnapshot {
  return Boolean(snapshot?.rasterObjectKey);
}

/**
 * Explorador de mapas como área de trabalho (RAIZ 2.0 Fase 2, Bloco A): lista pesquisável + mapa com
 * espaço dominante + painel de detalhe (embutido no próprio RealFieldMap) + controles de camada com
 * metadado (o que representa/unidade/data/fonte/método/limitações). Seleção (URL: ordem/parâmetro/
 * status/satélite) sobrevive a reload e navegação, mesmo padrão já usado no Talhão 360°.
 */
export function AgronomicMapExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mobileView, setMobileView] = useState<"lista" | "mapa">(() => searchParams.get("ponto") ? "mapa" : "lista");

  const [selectedOrderId, setSelectedOrderIdState] = useState(searchParams.get("ordem") ?? "");
  const [parameter, setParameterState] = useState(searchParams.get("parametro") ?? "");
  const [statusFilter, setStatusFilterState] = useState<"all" | "collected" | "pending">((searchParams.get("status") as any) ?? "all");
  const selectedPointId = searchParams.get("ponto") ?? "";
  const [layerMode, setLayerMode] = useState<"points" | "interpolation">("points");
  const [satelliteLayer, setSatelliteLayerState] = useState(searchParams.get("satelite") === "1");
  const [layer, setLayer] = useState<MapLayerResponse | null>(null);
  const [layerLoading, setLayerLoading] = useState(false);
  const [layerError, setLayerError] = useState<string | null>(null);
  const [ndvi, setNdvi] = useState<NdviSnapshot | null>(null);
  const [ndviFieldId, setNdviFieldId] = useState<string | null>(null);
  const [ndviLoading, setNdviLoading] = useState(false);
  const [ndviLatestNeedsArchive, setNdviLatestNeedsArchive] = useState(false);
  const [ndviHasStatisticalHistory, setNdviHasStatisticalHistory] = useState(false);
  const [ndviRaster, setNdviRaster] = useState<MapImageOverlay | null>(null);
  const [ndviRasterLoading, setNdviRasterLoading] = useState(false);
  const [ndviRasterError, setNdviRasterError] = useState<string | null>(null);

  function updateUrl(next: { ordem?: string; parametro?: string; status?: string; satelite?: boolean; ponto?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.ordem !== undefined) { if (next.ordem) params.set("ordem", next.ordem); else params.delete("ordem"); }
    if (next.parametro !== undefined) { if (next.parametro) params.set("parametro", next.parametro); else params.delete("parametro"); }
    if (next.status !== undefined) { if (next.status !== "all") params.set("status", next.status); else params.delete("status"); }
    if (next.satelite !== undefined) { if (next.satelite) params.set("satelite", "1"); else params.delete("satelite"); }
    if (next.ponto !== undefined) { if (next.ponto) params.set("ponto", next.ponto); else params.delete("ponto"); }
    router.replace(`/mapas?${params.toString()}`, { scroll: false });
  }
  function setSelectedOrderId(next: string) {
    setLayer(null);
    setLayerError(null);
    setNdvi(null);
    setNdviFieldId(null);
    setNdviLatestNeedsArchive(false);
    setNdviHasStatisticalHistory(false);
    setNdviRaster(null);
    setNdviRasterError(null);
    setSelectedOrderIdState(next);
    updateUrl({ ordem: next, ponto: "" });
  }
  function setParameter(next: string) {
    setLayer(null);
    setLayerError(null);
    setParameterState(next);
    updateUrl({ parametro: next });
  }
  function setStatusFilter(next: "all" | "collected" | "pending") { setStatusFilterState(next); updateUrl({ status: next, ponto: "" }); }
  function setSatelliteLayer(next: boolean) { setSatelliteLayerState(next); updateUrl({ satelite: next }); }

  useEffect(() => {
    if (selectedPointId) setMobileView("mapa");
  }, [selectedPointId]);

  useEffect(() => {
    void fetch("/api/collection-orders", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const list: OrderSummary[] = data.orders ?? [];
        setOrders(list);
        setSelectedOrderIdState((current) => (current && list.some((o) => o.id === current)) ? current : (list[0]?.id ?? ""));
        setLoading(false);
      });
  }, []);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;

  /** Lista "Talhões" deve mostrar um talhão único, não uma linha por ordem de coleta -- bug real
   * confirmado na auditoria (item G): um talhão com 3 ordens aparecia 3 vezes, sem deixar claro que era
   * o mesmo lugar. Agrupa pelo `fieldId` real (nunca pelo nome -- dois talhões podem ter nomes iguais em
   * propriedades diferentes); quando o talhão tem mais de uma ordem, elas ficam subordinadas dentro do
   * próprio card, não soltas na lista principal. */
  const fieldGroups = useMemo(() => {
    const map = new Map<string, { fieldId: string; fieldName: string; propertyName: string; clientName: string; orders: OrderSummary[] }>();
    for (const order of orders) {
      const existing = map.get(order.fieldId);
      if (existing) existing.orders.push(order);
      else map.set(order.fieldId, { fieldId: order.fieldId, fieldName: order.fieldName, propertyName: order.propertyName, clientName: order.clientName, orders: [order] });
    }
    return Array.from(map.values());
  }, [orders]);

  const filteredFieldGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return fieldGroups;
    return fieldGroups.filter((g) => g.fieldId === selectedOrder?.fieldId
      || g.fieldName.toLowerCase().includes(term) || g.propertyName.toLowerCase().includes(term) || g.clientName.toLowerCase().includes(term));
  }, [fieldGroups, search, selectedOrder]);

  useEffect(() => {
    if (!selectedOrderId) {
      setLayer(null);
      setLayerLoading(false);
      setLayerError(null);
      return;
    }
    const controller = new AbortController();
    setLayer(null);
    setLayerLoading(true);
    setLayerError(null);
    const query = parameter ? `?parameter=${encodeURIComponent(parameter)}` : "";
    void fetch(`/api/collection-orders/${selectedOrderId}/map-layer${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? `Não foi possível carregar a camada do mapa (HTTP ${response.status}).`);
        }
        return response.json() as Promise<MapLayerResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setLayer(data);
        setLayerLoading(false);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setLayer(null);
        setLayerLoading(false);
        setLayerError(caught instanceof Error ? caught.message : "Não foi possível carregar a camada do mapa.");
      });
    return () => controller.abort();
  }, [selectedOrderId, parameter]);

  // A leitura temporal vem apenas do que já está salvo; ligar a camada nunca dispara aquisição externa.
  // A tela /mapas usa somente snapshot que já possui raster arquivado. Estatística legada continua
  // visível no Talhão 360°, mas não é promovida silenciosamente a imagem histórica nesta tela.
  useEffect(() => {
    if (!satelliteLayer || !selectedOrder) {
      setNdvi(null);
      setNdviFieldId(null);
      setNdviLatestNeedsArchive(false);
      setNdviHasStatisticalHistory(false);
      setNdviLoading(false);
      return;
    }
    const controller = new AbortController();
    const fieldId = selectedOrder.fieldId;
    setNdvi(null);
    setNdviFieldId(null);
    setNdviLatestNeedsArchive(false);
    setNdviHasStatisticalHistory(false);
    setNdviLoading(true);
    void fetch(`/api/fields/${fieldId}/ndvi`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Não foi possível carregar a leitura NDVI (HTTP ${response.status}).`);
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const latest = (data.latest ?? null) as NdviSnapshot | null;
        const history = (data.history ?? []) as NdviSnapshot[];
        const archivedSnapshot = history.find(hasArchivedRaster) ?? null;
        setNdvi(archivedSnapshot);
        setNdviFieldId(fieldId);
        setNdviHasStatisticalHistory(Boolean(latest) || history.length > 0);
        setNdviLatestNeedsArchive(Boolean(latest && !hasArchivedRaster(latest)));
        setNdviLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setNdvi(null);
        setNdviFieldId(null);
        setNdviLatestNeedsArchive(false);
        setNdviHasStatisticalHistory(false);
        setNdviLoading(false);
      });
    return () => controller.abort();
  }, [satelliteLayer, selectedOrder]);

  const currentNdvi = selectedOrder && ndviFieldId === selectedOrder.fieldId ? ndvi : null;

  // O raster espacial usa exatamente uma aquisição que já possui artefato histórico arquivado.
  useEffect(() => {
    if (!satelliteLayer || !selectedOrder || !currentNdvi?.capturedAt || !currentNdvi.rasterObjectKey) {
      setNdviRaster(null);
      setNdviRasterLoading(false);
      setNdviRasterError(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setNdviRaster(null);
    setNdviRasterLoading(true);
    setNdviRasterError(null);
    const date = currentNdvi.capturedAt.slice(0, 10);

    void fetch(`/api/fields/${selectedOrder.fieldId}/ndvi/map?date=${encodeURIComponent(date)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? `Raster NDVI indisponível (HTTP ${response.status}).`);
        }
        const bounds = parseRasterBounds(response.headers.get("x-raiz-ndvi-bbox"));
        if (!bounds) throw new Error("Raster NDVI sem envelope geográfico válido.");
        const blob = await response.blob();
        if (!blob.type.includes("image/png")) throw new Error("Raster NDVI retornado em formato inesperado.");
        objectUrl = URL.createObjectURL(blob);
        if (controller.signal.aborted) return;
        setNdviRaster({ url: objectUrl, bounds, opacity: 0.78 });
        setNdviRasterLoading(false);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setNdviRaster(null);
        setNdviRasterLoading(false);
        setNdviRasterError(caught instanceof Error ? caught.message : "Não foi possível carregar o raster NDVI espacial.");
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [satelliteLayer, selectedOrder, currentNdvi?.capturedAt, currentNdvi?.rasterObjectKey]);

  const points: MapPoint[] = useMemo(() => {
    const source = layer?.points ?? selectedOrder?.points ?? [];
    return source.filter((point) => statusFilter === "all" || (statusFilter === "collected") === Boolean(point.collectedAt));
  }, [layer, selectedOrder, statusFilter]);

  const colorFor = useCallback((point: MapPoint) => {
    if (!parameter) {
      const collected = Boolean(point.collectedAt);
      return { stroke: collected ? "#00C4D6" : "#B86F3E", fill: collected ? "#00C4D6" : "#F2C879", fillOpacity: collected ? 0.9 : 0.6 };
    }
    if (point.interpretable) {
      const color = classificationColor(point.classification ?? null);
      return { stroke: color, fill: color, fillOpacity: 0.85 };
    }
    return { stroke: "#9AA79F", fill: "#C9D1CC", fillOpacity: point.labResultCount > 0 ? 0.55 : 0.3 };
  }, [parameter]);

  const legend = useMemo(() => {
    if (!parameter) return [{ label: "Coletado", color: "#00C4D6" }, { label: "Pendente", color: "#B86F3E" }];
    const present = new Set((layer?.points ?? []).map((point) => point.classification).filter(Boolean) as string[]);
    const entries = Array.from(present).map((label) => ({ label, color: classificationColor(label) }));
    entries.push({ label: "Sem classificação / sem faixa homologada", color: "#9AA79F" });
    return entries;
  }, [parameter, layer]);

  const distribution = useMemo(() => (parameter && layer ? computeParameterDistribution(parameter, layer.points) : null), [parameter, layer]);

  function selectField(orderId: string) {
    setSelectedOrderId(orderId);
    setMobileView("mapa");
  }

  if (loading) return <div className="agro-loading"><Icon name="clock" size={15}/>Carregando mapa agronômico…</div>;

  if (!orders.length) {
    return <div className="pending-engine"><Icon name="map" size={24}/><div><span className="eyebrow">SEM ORDEM DE COLETA</span><h3>Nenhum talhão com pontos de amostragem ainda.</h3><p>Crie uma ordem de coleta em Talhões &amp; Safras para o mapa aparecer aqui.</p></div></div>;
  }

  return (
    <div className="map-explorer">
      <div className="map-explorer-mobile-tabs">
        <button type="button" className={mobileView === "lista" ? "active" : ""} onClick={() => setMobileView("lista")}><Icon name="list" size={14}/>Lista</button>
        <button type="button" className={mobileView === "mapa" ? "active" : ""} onClick={() => setMobileView("mapa")}><Icon name="map" size={14}/>Mapa</button>
      </div>

      <div className={`map-explorer-list card ${mobileView === "lista" ? "" : "map-explorer-hide-mobile"}`}>
        <div className="field-ops-section-head compact"><div><span className="eyebrow">TALHÕES</span><h2>Selecione</h2></div><span className="field-ops-count">{filteredFieldGroups.length}</span></div>
        <div className="map-explorer-search"><Icon name="search" size={14}/><input type="search" placeholder="Buscar talhão, propriedade ou cliente…" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
        {filteredFieldGroups.length === 0 && <p className="report-empty-note" style={{ padding: 16 }}>Nenhum talhão encontrado para &quot;{search}&quot;.</p>}
        {filteredFieldGroups.map((group) => {
          const active = group.orders.some((order) => order.id === selectedOrderId);
          const totalPlanned = group.orders.reduce((sum, order) => sum + order.plannedPoints, 0);
          const totalCollected = group.orders.reduce((sum, order) => sum + order.collectedPoints, 0);
          return (
            <div key={group.fieldId} className="map-explorer-field-group">
              <button className={`field-order-item ${active ? "active" : ""}`} onClick={() => selectField(group.orders[0].id)}>
                <span><strong>{group.fieldName}</strong><small>{group.clientName} · {group.propertyName}{group.orders.length > 1 ? ` · ${group.orders.length} ordens` : ""}{group.orders[0]?.seasonLabel ? ` · ${group.orders[0].seasonLabel}` : ""}</small></span>
                <b>{totalCollected}/{totalPlanned}</b>
              </button>
              <Link href={`/talhoes/${group.fieldId}`} className="map-explorer-field-360" title="Abrir Talhão 360°"><Icon name="sparkles" size={13}/>Visão 360°</Link>
              {active && group.orders.length > 1 && (
                <div className="map-explorer-order-subpicker">
                  {group.orders.map((order) => (
                    <button key={order.id} className={selectedOrderId === order.id ? "active" : ""} onClick={() => setSelectedOrderId(order.id)}>{order.seasonLabel} · {order.code}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={`map-explorer-main card ${mobileView === "mapa" ? "" : "map-explorer-hide-mobile"}`}>
        {selectedOrder && (
          <>
            <div className="map-explorer-toolbar">
              <label><span>Parâmetro</span>
                <select value={parameter} onChange={(event) => setParameter(event.target.value)}>
                  <option value="">Status de coleta</option>
                  {(layer?.availableParameters ?? []).map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <label><span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">Todos</option>
                  <option value="collected">Coletados</option>
                  <option value="pending">Pendentes</option>
                </select>
              </label>
              <div className="map-explorer-layer-toggle">
                <button type="button" className={layerMode === "points" ? "active" : ""} onClick={() => setLayerMode("points")}>Pontos</button>
                <button type="button" className={layerMode === "interpolation" ? "active" : ""} onClick={() => setLayerMode("interpolation")}>Interpolação</button>
              </div>
              <label className="map-explorer-satellite-toggle">
                <input type="checkbox" checked={satelliteLayer} onChange={(e) => setSatelliteLayer(e.target.checked)}/>
                <span>NDVI espacial (Sentinel-2)</span>
              </label>
              {layer?.analysisId && <Link href={`/analises/${layer.analysisId}`} className="button ghost small">Análise de origem</Link>}
            </div>

            <div className="map-explorer-layer-info">
              {!parameter ? (
                <p><strong>Camada: status de coleta.</strong> Representa se o ponto planejado já foi visitado em campo. Sem unidade. Fonte: pontos de amostragem reais (PostGIS). Sem limitação além da posição (ver detalhe de GPS ao clicar num ponto).</p>
              ) : (
                <p><strong>Camada: {parameter}.</strong> Representa o valor laboratorial observado em cada ponto e, quando existe faixa homologada, a classificação agronômica. Unidade: {distribution?.unit ?? "varia por ponto — ver detalhe"}. Fonte: laudo laboratorial (lab_results). Método: varia por ponto — clique no ponto pra ver o método exato. Limitação: cinza = sem classificação (falta faixa homologada ou parâmetro não coberto), não significa &quot;adequado&quot;.</p>
              )}
              {satelliteLayer && (
                ndviLoading ? <p><Icon name="clock" size={12}/> Carregando leitura de satélite…</p>
                : currentNdvi ? <p><strong>Camada: zonas de vigor NDVI.</strong> Raster histórico arquivado da aquisição Sentinel-2 de {formatDateOnly(currentNdvi.capturedAt)} ({currentNdvi.source}){currentNdvi.cloudCoverPct != null ? `, ${Math.round(currentNdvi.cloudCoverPct)}% da área sem pixel válido nesta cena` : ""}. As cores mostram classes de vigor espectral dentro do talhão; não representam produtividade medida nem interpolação de laboratório.</p>
                : ndviHasStatisticalHistory
                  ? <p><strong>Raster NDVI ainda não arquivado.</strong> Existe histórico estatístico deste talhão, mas nenhuma aquisição desta janela pode ser mostrada como raster histórico imutável ainda. <Link href={`/talhoes/${selectedOrder.fieldId}`}>Abra o Talhão 360° e use “Atualizar 120 dias”</Link> para arquivar as aquisições.</p>
                  : <p>Nenhuma leitura de satélite salva ainda para este talhão. <Link href={`/talhoes/${selectedOrder.fieldId}`}>Buscar no Talhão 360°</Link>.</p>
              )}
              {satelliteLayer && currentNdvi && ndviLatestNeedsArchive && <p><Icon name="warning" size={12}/> A aquisição estatística mais recente ainda não possui raster arquivado; o mapa está exibindo a aquisição arquivada mais recente disponível.</p>}
              {satelliteLayer && ndviRasterLoading && <p><Icon name="clock" size={12}/> Carregando raster NDVI espacial…</p>}
              {satelliteLayer && ndviRasterError && <p className="ndvi-panel-error"><strong>Raster espacial indisponível.</strong> {ndviRasterError} O contorno e os pontos reais permanecem visíveis; nenhuma faixa é inventada.</p>}
              {layerError && <p className="ndvi-panel-error"><strong>Camada agronômica indisponível.</strong> {layerError}</p>}
            </div>

            {parameter && layer && layer.interpretationStatus && (
              <div className="map-explorer-context">
                <span><b>{layer.trace?.cropProfileCode ?? "—"}</b><small>perfil de cultura</small></span>
                <span><b>{layer.confidence ? `${layer.confidence.score}/100` : "—"}</b><small>confiabilidade</small></span>
                <span><StatusBadge tone={layer.interpretationStatus === "APPROVED" ? "success" : "review"}>{STATUS_LABEL[layer.interpretationStatus] ?? layer.interpretationStatus}</StatusBadge></span>
              </div>
            )}

            {layerMode === "interpolation" && (
              <div className="map-explorer-layer-notice">
                <Icon name="shield" size={15}/>
                <span><strong>Interpolação ainda não disponível.</strong> Liberada quando a densidade de pontos e a validação espacial forem homologadas por um agrônomo responsável, por talhão. O mapa abaixo mostra os pontos reais — nunca uma zona estimada.</span>
              </div>
            )}
            {layerLoading ? (
              <div className="agro-loading"><Icon name="clock" size={15}/>Carregando camada…</div>
            ) : (
              <RealFieldMap
                boundary={layer?.fieldBoundary ?? selectedOrder.fieldBoundary}
                points={points}
                height={420}
                colorFor={colorFor}
                legend={legend}
                imageOverlay={satelliteLayer ? ndviRaster : null}
                selectedPointId={selectedPointId || null}
                onPointSelect={(point) => updateUrl({ ponto: point?.id ?? "" })}
                hint={parameter ? `Camada: ${parameter}` : "Clique num ponto para ver os dados"}
              />
            )}

            {parameter && distribution && (
              <div className="map-explorer-distribution">
                {distribution.observedCount === 0 ? (
                  <p className="report-empty-note">Nenhum ponto desta coleta tem resultado lançado para {parameter} ainda.</p>
                ) : (
                  <dl>
                    <div><dt>Amostras</dt><dd>{distribution.sampleCount}</dd></div>
                    <div><dt>Com valor</dt><dd>{distribution.observedCount}</dd></div>
                    <div><dt>Sem valor</dt><dd>{distribution.missingCount}</dd></div>
                    <div><dt>Mín.</dt><dd>{distribution.min?.toFixed(2)}</dd></div>
                    <div><dt>Máx.</dt><dd>{distribution.max?.toFixed(2)}</dd></div>
                    <div><dt>Média</dt><dd>{distribution.mean?.toFixed(2)}</dd></div>
                    <div><dt>Mediana</dt><dd>{distribution.median?.toFixed(2)}</dd></div>
                  </dl>
                )}
              </div>
            )}
            {satelliteLayer && currentNdvi && (
              <ul className="ndvi-zone-legend" style={{ padding: "0 4px" }}>
                {Object.entries(currentNdvi.zoneBreakdownPct).filter(([, pct]) => (pct ?? 0) > 0).map(([zone, pct]) => (
                  <li key={zone}><i style={{ background: NDVI_ZONE_COLOR[zone as keyof typeof NDVI_ZONE_COLOR] }}/>{VIGOR_ZONE_LABELS[zone as keyof typeof VIGOR_ZONE_LABELS] ?? zone} — {pct}%</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
