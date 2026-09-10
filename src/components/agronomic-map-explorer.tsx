"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RealFieldMap, type MapPoint } from "@/components/real-field-map";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { classificationColor } from "@/lib/classification-colors";

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
};

const STATUS_LABEL: Record<string, string> = {
  CALCULATED: "Calculado, sem revisão",
  IN_REVIEW: "Aguardando validação técnica",
  APPROVED: "Aprovada",
  AI_GENERATED: "Narrativa gerada",
  PUBLISHED: "Publicada",
};

export function AgronomicMapExplorer() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [parameter, setParameter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "collected" | "pending">("all");
  const [layerMode, setLayerMode] = useState<"points" | "interpolation">("points");
  const [layer, setLayer] = useState<MapLayerResponse | null>(null);
  const [layerLoading, setLayerLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/collection-orders", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const list: OrderSummary[] = data.orders ?? [];
        setOrders(list);
        if (list.length) setSelectedOrderId((current) => current || list[0].id);
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

  useEffect(() => {
    if (!selectedOrderId) { setLayer(null); return; }
    setLayerLoading(true);
    const query = parameter ? `?parameter=${encodeURIComponent(parameter)}` : "";
    void fetch(`/api/collection-orders/${selectedOrderId}/map-layer${query}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: MapLayerResponse) => {
        setLayer(data);
        setLayerLoading(false);
        if (!parameter && data.availableParameters?.length) setParameter(data.availableParameters[0]);
      });
  }, [selectedOrderId, parameter]);

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
      const color = classificationColor(point.classification);
      return { stroke: color, fill: color, fillOpacity: 0.85 };
    }
    return { stroke: "#9AA79F", fill: "#C9D1CC", fillOpacity: point.labResultCount > 0 ? 0.55 : 0.3 };
  }, [parameter]);

  const legend = useMemo(() => {
    if (!parameter) return [{ label: "Coletado", color: "#00C4D6" }, { label: "Pendente", color: "#B86F3E" }];
    const present = new Set((layer?.points ?? []).map((point) => point.classification).filter(Boolean) as string[]);
    const entries = Array.from(present).map((label) => ({ label, color: classificationColor(label) }));
    entries.push({ label: "Sem classificação", color: "#9AA79F" });
    return entries;
  }, [parameter, layer]);

  if (loading) return <div className="agro-loading"><Icon name="clock" size={15}/>Carregando mapa agronômico…</div>;

  if (!orders.length) {
    return <div className="pending-engine"><Icon name="map" size={24}/><div><span className="eyebrow">SEM ORDEM DE COLETA</span><h3>Nenhum talhão com pontos de amostragem ainda.</h3><p>Crie uma ordem de coleta em Talhões &amp; Safras para o mapa aparecer aqui.</p></div></div>;
  }

  return (
    <div className="map-explorer">
      <div className="map-explorer-list card">
        <div className="field-ops-section-head compact"><div><span className="eyebrow">TALHÕES</span><h2>Selecione</h2></div><span className="field-ops-count">{fieldGroups.length}</span></div>
        {fieldGroups.map((group) => {
          const active = group.orders.some((order) => order.id === selectedOrderId);
          const totalPlanned = group.orders.reduce((sum, order) => sum + order.plannedPoints, 0);
          const totalCollected = group.orders.reduce((sum, order) => sum + order.collectedPoints, 0);
          return (
            <div key={group.fieldId} className="map-explorer-field-group">
              <button className={`field-order-item ${active ? "active" : ""}`} onClick={() => setSelectedOrderId(group.orders[0].id)}>
                <span><strong>{group.fieldName}</strong><small>{group.clientName} · {group.propertyName}{group.orders.length > 1 ? ` · ${group.orders.length} ordens` : ""}</small></span>
                <b>{totalCollected}/{totalPlanned}</b>
              </button>
              {/* Atalho real pra Talhão 360° (Fase 1, Etapa 5) direto da lista de talhões do mapa. */}
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

      <div className="map-explorer-main card">
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
            </div>

            {parameter && layer && (
              <div className="map-explorer-context">
                <span><b>{layer.trace?.cropProfileCode ?? "—"}</b><small>perfil de cultura</small></span>
                <span><b>{layer.confidence ? `${layer.confidence.score}/100` : "—"}</b><small>confiabilidade</small></span>
                <span><StatusBadge tone={layer.interpretationStatus === "APPROVED" ? "success" : layer.interpretationStatus ? "review" : "waiting"}>{layer.interpretationStatus ? (STATUS_LABEL[layer.interpretationStatus] ?? layer.interpretationStatus) : "Sem interpretação"}</StatusBadge></span>
              </div>
            )}

            {/* Bug real corrigido (fechamento Fase 1): antes, clicar em "Interpolação" substituía o mapa
                inteiro por um texto -- o contorno e os pontos reais somem da tela. O briefing pede o
                oposto: preservar o mapa de base e explicar o impedimento no controle da camada, não
                trocar o mapa por um aviso. Agora o mapa real continua sempre visível (mostrando os
                pontos, nunca uma zona interpolada inventada); o aviso aparece junto do próprio seletor
                de camada, perto de onde o usuário clicou. */}
            {layerMode === "interpolation" && (
              <div className="map-explorer-layer-notice">
                <Icon name="shield" size={15}/>
                <span><strong>Interpolação ainda não disponível.</strong> Liberada quando a densidade de pontos e a validação espacial forem homologadas por um agrônomo responsável, por talhão. O mapa abaixo mostra os pontos reais — nunca uma zona estimada.</span>
              </div>
            )}
            {layerLoading ? (
              <div className="agro-loading"><Icon name="clock" size={15}/>Carregando camada…</div>
            ) : (
              <RealFieldMap boundary={layer?.fieldBoundary ?? selectedOrder.fieldBoundary} points={points} height={420} colorFor={colorFor} legend={legend} hint={parameter ? `Camada: ${parameter}` : "Clique num ponto para ver os dados"}/>
            )}
          </>
        )}
      </div>
    </div>
  );
}
