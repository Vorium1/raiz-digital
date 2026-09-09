"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { RealFieldMap, type MapPoint } from "@/components/real-field-map";
import { FieldNdviPanel } from "@/components/field-ndvi-panel";

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
type FieldRow = { id: string; propertyId: string; name: string; areaHa: number; boundary: Geometry };
type PropertyRow = { id: string; clientId: string; name: string; municipality: string; state: string };
type SeasonRow = { id: string; fieldId: string; seasonLabel: string; currentCrop: string | null; nextCrop: string | null };
type OrderPoint = { id: string; code: string; latitude: number; longitude: number; collectedAt: string | null; depthFromCm: number; depthToCm: number; subsampleCount: number | null; gpsSource: string | null; observedLatitude: number | null; observedLongitude: number | null; accuracyM: number | null; notes: string | null; labResultCount: number };
type OrderRow = { id: string; code: string; status: string; gridAreaHa: number | null; cropSeasonId: string; fieldId: string; plannedPoints: number; collectedPoints: number; points: OrderPoint[]; plannedAt: string | null };

type Tab = "talhoes" | "safras" | "ordens";

/**
 * "Propriedades & Talhões": lista + mapa real (PostGIS -> Leaflet, mesmo
 * `RealFieldMap` já usado no resto do app) num único painel de consulta --
 * ideia vinda do conceito visual aprovado pelo diretor (mockup "lista à
 * esquerda alterna Talhões/Safras/Ordens de coleta, mapa mostra o
 * talhão selecionado"). Reaproveita os MESMOS endpoints que o formulário
 * de cadastro (`/api/context`, `/api/collection-orders`) já usa -- não
 * duplica lógica de busca, só monta uma visão de navegação por cima do
 * dado que já existe. Cadastro/edição continuam no formulário abaixo
 * (`FieldOperationsManager`); este painel é só pra ACHAR e ENTENDER
 * rápido um talhão, não pra editar.
 */
export function PropertiesFieldsBrowser() {
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("talhoes");
  const [search, setSearch] = useState("");
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [vigorColor, setVigorColor] = useState<string | null>(null);
  useEffect(() => { setVigorColor(null); }, [selectedFieldId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [contextRes, ordersRes] = await Promise.all([
        fetch("/api/context", { cache: "no-store" }),
        fetch("/api/collection-orders", { cache: "no-store" }),
      ]);
      const context = await contextRes.json().catch(() => ({}));
      const ordersPayload = await ordersRes.json().catch(() => ({}));
      if (cancelled) return;
      setFields(context.fields ?? []);
      setProperties(context.properties ?? []);
      setSeasons(context.seasons ?? []);
      setOrders(ordersPayload.orders ?? []);
      setLoading(false);
      if ((context.fields ?? []).length > 0) setSelectedFieldId(context.fields[0].id);
    })();
    return () => { cancelled = true; };
  }, []);

  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const seasonsByField = useMemo(() => {
    const map = new Map<string, SeasonRow[]>();
    for (const s of seasons) map.set(s.fieldId, [...(map.get(s.fieldId) ?? []), s]);
    return map;
  }, [seasons]);
  const ordersByField = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of orders) map.set(o.fieldId, [...(map.get(o.fieldId) ?? []), o]);
    return map;
  }, [orders]);

  function latestSeasonFor(fieldId: string) {
    const list = seasonsByField.get(fieldId) ?? [];
    return list[0] ?? null;
  }
  function latestOrderFor(fieldId: string) {
    const list = (ordersByField.get(fieldId) ?? []).filter((o) => o.status !== "CANCELED");
    return list[0] ?? null;
  }

  const filteredFields = useMemo(() => {
    const term = search.trim().toLowerCase();
    return fields.filter((f) => {
      if (!term) return true;
      const property = propertyById.get(f.propertyId);
      return f.name.toLowerCase().includes(term) || (property?.name.toLowerCase().includes(term) ?? false);
    });
  }, [fields, search, propertyById]);

  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;
  const selectedProperty = selectedField ? propertyById.get(selectedField.propertyId) : null;
  const selectedSeason = selectedField ? latestSeasonFor(selectedField.id) : null;
  const selectedOrder = selectedField ? latestOrderFor(selectedField.id) : null;
  const coveragePct = selectedOrder && selectedOrder.plannedPoints > 0 ? Math.round((selectedOrder.collectedPoints / selectedOrder.plannedPoints) * 100) : null;

  const mapPoints: MapPoint[] = (selectedOrder?.points ?? []).map((p) => ({ ...p, sequence: null }));

  if (loading) return <div className="data-card"><div className="empty-state"><Icon name="clock"/><strong>Carregando propriedades e talhões…</strong></div></div>;
  if (fields.length === 0) return null;

  return (
    <section className="fields-browser">
      <div className="fields-browser-list card">
        <div className="fields-browser-search"><Icon name="search" size={16}/><input placeholder="Buscar talhão ou propriedade" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="fields-browser-tabs">
          <button type="button" className={tab === "talhoes" ? "active" : ""} onClick={() => setTab("talhoes")}>Talhões</button>
          <button type="button" className={tab === "safras" ? "active" : ""} onClick={() => setTab("safras")}>Safras</button>
          <button type="button" className={tab === "ordens" ? "active" : ""} onClick={() => setTab("ordens")}>Ordens de coleta</button>
        </div>
        <div className="fields-browser-items">
          {tab === "talhoes" && filteredFields.map((f) => {
            const property = propertyById.get(f.propertyId);
            const season = latestSeasonFor(f.id);
            const order = latestOrderFor(f.id);
            const pct = order && order.plannedPoints > 0 ? Math.round((order.collectedPoints / order.plannedPoints) * 100) : null;
            return (
              <button key={f.id} type="button" className={`fields-browser-item ${f.id === selectedFieldId ? "selected" : ""}`} onClick={() => setSelectedFieldId(f.id)}>
                <Icon name="layers" size={16} />
                <div>
                  <strong>{f.name}</strong>
                  <small>{property?.name ?? "—"} · {f.areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha{season ? ` · ${season.nextCrop ?? season.currentCrop ?? "sem cultura"} ${season.seasonLabel}` : ""}</small>
                </div>
                {pct != null && <span className="fields-browser-pct">{pct}%</span>}
              </button>
            );
          })}
          {tab === "safras" && seasons.map((s) => {
            const field = fields.find((f) => f.id === s.fieldId);
            if (!field) return null;
            return (
              <button key={s.id} type="button" className={`fields-browser-item ${s.fieldId === selectedFieldId ? "selected" : ""}`} onClick={() => setSelectedFieldId(s.fieldId)}>
                <Icon name="leaf" size={16} />
                <div><strong>{s.nextCrop ?? s.currentCrop ?? "Safra"} {s.seasonLabel}</strong><small>{field.name}</small></div>
              </button>
            );
          })}
          {tab === "ordens" && orders.map((o) => {
            const field = fields.find((f) => f.id === o.fieldId);
            if (!field) return null;
            return (
              <button key={o.id} type="button" className={`fields-browser-item ${o.fieldId === selectedFieldId ? "selected" : ""}`} onClick={() => setSelectedFieldId(o.fieldId)}>
                <Icon name="location" size={16} />
                <div><strong>{o.code}</strong><small>{field.name} · {o.collectedPoints}/{o.plannedPoints} pontos</small></div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="fields-browser-map">
        {selectedField ? (
          <>
            <RealFieldMap boundary={selectedField.boundary} points={mapPoints} height={420} boundaryFillColor={vigorColor ?? undefined} hint={selectedOrder ? "Clique num ponto pra ver os dados" : "Nenhuma ordem de coleta aberta pra este talhão ainda"} />
            {vigorColor && <p className="fields-browser-map-note">Contorno colorido pela faixa de vigor predominante do satélite (ver detalhe completo no painel abaixo).</p>}
          </>
        ) : <div className="chart-empty">Selecione um talhão pra ver o mapa.</div>}

        {selectedField && (
          <div className="fields-browser-detail">
            <span className="eyebrow">TALHÃO SELECIONADO</span>
            <h3>{selectedField.name} — {selectedProperty?.name ?? "—"}</h3>
            <div className="fields-browser-stats">
              <div><span>Área</span><strong>{selectedField.areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
              <div><span>Cultura / safra</span><strong>{selectedSeason ? `${selectedSeason.nextCrop ?? selectedSeason.currentCrop ?? "—"} ${selectedSeason.seasonLabel}` : "Sem safra cadastrada"}</strong></div>
              <div><span>Grid amostral</span><strong>{selectedOrder?.gridAreaHa ? `${selectedOrder.gridAreaHa} ha/pt` : "—"}</strong></div>
              <div><span>Cobertura de coleta</span><strong>{coveragePct != null ? `${coveragePct}%` : "—"}</strong></div>
            </div>
            <div className="fields-browser-actions">
              <Link href="#nova-ordem-coleta" className="button primary"><Icon name="plus" size={15}/>Nova ordem</Link>
              <Link href="#nova-ordem-coleta" className="button secondary">Ver pontos</Link>
              <Link href={`/relatorios/evolucao/${selectedField.id}`} className="button ghost">Análises</Link>
            </div>
          </div>
        )}

        {selectedField && <FieldNdviPanel fieldId={selectedField.id} onZoneColor={setVigorColor} />}
      </div>
    </section>
  );
}
