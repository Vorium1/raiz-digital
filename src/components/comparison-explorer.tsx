"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";

type Mode = "fields" | "seasons" | "points" | "properties";

type ContextData = {
  fields: Array<{ id: string; name: string; propertyId: string }>;
  properties: Array<{ id: string; name: string }>;
  seasons: Array<{ id: string; seasonLabel: string; fieldId: string }>;
};

type PointOption = { id: string; code: string; fieldName: string };

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "fields", label: "Talhão × Talhão" },
  { value: "seasons", label: "Safra × Safra" },
  { value: "points", label: "Ponto × Ponto" },
  { value: "properties", label: "Propriedade × Propriedade" },
];

export function ComparisonExplorer() {
  const [mode, setMode] = useState<Mode>("fields");
  const [context, setContext] = useState<ContextData>({ fields: [], properties: [], seasons: [] });
  const [points, setPoints] = useState<PointOption[]>([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/context").then((r) => r.json()).then((data) => setContext({ fields: data.fields ?? [], properties: data.properties ?? [], seasons: data.seasons ?? [] }));
    void fetch("/api/collection-orders").then((r) => r.json()).then((data) => {
      const flattened: PointOption[] = [];
      for (const order of data.orders ?? []) for (const point of order.points ?? []) flattened.push({ id: point.id, code: point.code, fieldName: order.fieldName });
      setPoints(flattened);
    });
  }, []);

  const options = useMemo(() => {
    if (mode === "fields") return context.fields.map((f) => ({ value: f.id, label: f.name }));
    if (mode === "seasons") return context.seasons.map((s) => ({ value: s.id, label: `${context.fields.find((f) => f.id === s.fieldId)?.name ?? "Talhão"} · ${s.seasonLabel}` }));
    if (mode === "points") return points.map((p) => ({ value: p.id, label: `${p.code} · ${p.fieldName}` }));
    return context.properties.map((p) => ({ value: p.id, label: p.name }));
  }, [mode, context, points]);

  useEffect(() => { setA(""); setB(""); setResult(null); setError(null); }, [mode]);

  async function compare() {
    if (!a || !b) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/comparisons?mode=${mode}&a=${a}&b=${b}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao comparar.");
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao comparar."); }
    finally { setLoading(false); }
  }

  return (
    <div className="comparison-explorer">
      <div className="comparison-toolbar">
        <div className="map-explorer-layer-toggle">
          {MODES.map((item) => <button key={item.value} type="button" className={mode === item.value ? "active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}
        </div>
        <Link href="/relatorios" className="button ghost">Ver evolução temporal em Relatórios <Icon name="arrow" size={14}/></Link>
      </div>

      <div className="comparison-pickers">
        <select value={a} onChange={(e) => setA(e.target.value)}><option value="">Selecione o primeiro</option>{options.map((opt) => <option key={opt.value} value={opt.value} disabled={opt.value === b}>{opt.label}</option>)}</select>
        <Icon name="arrow" size={16}/>
        <select value={b} onChange={(e) => setB(e.target.value)}><option value="">Selecione o segundo</option>{options.map((opt) => <option key={opt.value} value={opt.value} disabled={opt.value === a}>{opt.label}</option>)}</select>
        <button type="button" className="button secondary" disabled={!a || !b || loading} onClick={() => void compare()}>{loading ? "Comparando…" : "Comparar"}</button>
      </div>

      {error && <div className="agro-message danger"><Icon name="warning" size={15}/><span>{error}</span></div>}

      {result && mode !== "properties" && mode !== "points" && (
        <div className="comparison-grid">
          {[{ label: result.labelA, data: result.dataA, context: result.contextA }, { label: result.labelB, data: result.dataB, context: result.contextB }].map((side, index) => (
            <div className="card comparison-column" key={index}>
              <div className="field-ops-section-head compact"><div><span className="eyebrow">{index === 0 ? "A" : "B"}</span><h2>{side.label}</h2></div></div>
              {side.data?.interpretation?.length ? (
                <table className="report-table"><thead><tr><th>Ponto</th><th>Parâmetro</th><th>Classificação</th></tr></thead>
                  <tbody>{side.data.interpretation.map((item: any, i: number) => <tr key={i}><td>{item.sampleCode}</td><td>{item.parameterCode}</td><td>{item.interpretable ? item.classification : "—"}</td></tr>)}</tbody>
                </table>
              ) : <p className="report-empty-note" style={{ padding: "0 22px 18px" }}>Nenhuma interpretação homologada ainda para este item.</p>}
            </div>
          ))}
        </div>
      )}

      {result && mode === "points" && (
        <div className="comparison-grid">
          {[result.pointA, result.pointB].map((point: any, index: number) => (
            <div className="card comparison-column" key={index}>
              <div className="field-ops-section-head compact"><div><span className="eyebrow">{index === 0 ? "A" : "B"}</span><h2>{point?.code ?? "—"}</h2></div></div>
              {point?.results?.length ? (
                <table className="report-table"><thead><tr><th>Parâmetro</th><th>Valor</th><th>Classificação</th></tr></thead>
                  <tbody>{point.results.map((r: any, i: number) => <tr key={i}><td>{r.parameterCode}</td><td>{r.value} {r.unit}</td><td>{r.classification ?? "—"}</td></tr>)}</tbody>
                </table>
              ) : <p className="report-empty-note" style={{ padding: "0 22px 18px" }}>Nenhum resultado laboratorial ainda para este ponto.</p>}
            </div>
          ))}
        </div>
      )}

      {result && mode === "properties" && (
        <div className="card">
          <table className="report-table">
            <thead><tr><th>Indicador</th><th>{result.summaryA?.name ?? "A"}</th><th>{result.summaryB?.name ?? "B"}</th></tr></thead>
            <tbody>
              <tr><td>Talhões</td><td>{result.summaryA?.fields ?? "—"}</td><td>{result.summaryB?.fields ?? "—"}</td></tr>
              <tr><td>Área total</td><td>{result.summaryA ? `${Number(result.summaryA.totalAreaHa).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : "—"}</td><td>{result.summaryB ? `${Number(result.summaryB.totalAreaHa).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : "—"}</td></tr>
              <tr><td>Cobertura de coleta</td><td>{result.summaryA?.totalPoints ? `${Math.round((result.summaryA.collectedPoints / result.summaryA.totalPoints) * 100)}%` : "—"}</td><td>{result.summaryB?.totalPoints ? `${Math.round((result.summaryB.collectedPoints / result.summaryB.totalPoints) * 100)}%` : "—"}</td></tr>
              <tr><td>Confiabilidade média</td><td>{result.summaryA?.avgConfidence != null ? `${Math.round(result.summaryA.avgConfidence)}/100` : "—"}</td><td>{result.summaryB?.avgConfidence != null ? `${Math.round(result.summaryB.avgConfidence)}/100` : "—"}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
