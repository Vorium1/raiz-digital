"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ClassificationBadge } from "@/components/ui";
import { RealFieldMap } from "@/components/real-field-map";

type Mode = "fields" | "seasons" | "points" | "properties";

type ContextData = {
  fields: Array<{ id: string; name: string; propertyId: string }>;
  properties: Array<{ id: string; name: string }>;
  seasons: Array<{ id: string; seasonLabel: string; fieldId: string }>;
};

type PointOption = { id: string; code: string; fieldName: string };

type ParameterComparisonRow = {
  parameterCode: string;
  unitA: string | null; unitB: string | null;
  methodsA: string[]; methodsB: string[];
  sampleTypesA: string[]; sampleTypesB: string[];
  depthA: { from: number; to: number } | null; depthB: { from: number; to: number } | null;
  nA: number; nB: number;
  avgA: number | null; avgB: number | null;
  classificationA: string | null; classificationB: string | null;
  comparable: boolean;
  incompatibilityReasons: string[];
  absoluteDifference: number | null;
  isPercentUnit: boolean;
};

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "fields", label: "Talhão × Talhão" },
  { value: "seasons", label: "Safra × Safra" },
  { value: "points", label: "Ponto × Ponto" },
  { value: "properties", label: "Propriedade × Propriedade" },
];

function formatValue(value: number | null, unit: string | null) {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}

function formatDifference(row: ParameterComparisonRow) {
  if (row.absoluteDifference == null) return "—";
  const sign = row.absoluteDifference > 0 ? "+" : "";
  const suffix = row.isPercentUnit ? "pp" : (row.unitA ?? "");
  return `${sign}${row.absoluteDifference.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${suffix}`.trim();
}

/**
 * Tabela de comparação por parâmetro (Fase 2, Bloco E): valor observado de cada lado, diferença
 * absoluta (nunca percentual sobre base inválida -- pH sempre em unidades de pH, "%" sempre em pontos
 * percentuais), classificação quando existe, e o motivo explícito quando a comparação não é válida
 * (unidade/método/tipo de amostra/profundidade incompatíveis) -- as evidências individuais continuam
 * visíveis mesmo assim, nunca escondidas.
 */
function ParameterComparisonTable({ rows, labelA, labelB }: { rows: ParameterComparisonRow[]; labelA: string; labelB: string }) {
  const comparableRows = useMemo(() => rows.filter((r) => r.comparable && r.absoluteDifference != null).sort((a, b) => Math.abs(b.absoluteDifference!) - Math.abs(a.absoluteDifference!)), [rows]);

  if (rows.length === 0) return <p className="report-empty-note" style={{ padding: 16 }}>Nenhum resultado laboratorial em comum pra comparar ainda.</p>;

  return (
    <>
      {comparableRows.length > 0 && <DifferenceChart rows={comparableRows} />}
      <div className="comparison-table-wrap">
        <table className="report-table comparison-table">
          <thead><tr><th>Parâmetro</th><th>{labelA}</th><th>{labelB}</th><th>Diferença</th><th>Comparabilidade</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.parameterCode} className={row.comparable ? "" : "comparison-row-incompatible"}>
                <td><strong>{row.parameterCode}</strong></td>
                <td>{formatValue(row.avgA, row.unitA)}{row.nA > 1 ? ` (n=${row.nA})` : ""}{row.classificationA && <ClassificationBadge label={row.classificationA} />}</td>
                <td>{formatValue(row.avgB, row.unitB)}{row.nB > 1 ? ` (n=${row.nB})` : ""}{row.classificationB && <ClassificationBadge label={row.classificationB} />}</td>
                <td className={row.comparable && row.absoluteDifference != null ? (row.absoluteDifference > 0 ? "comparison-diff-up" : row.absoluteDifference < 0 ? "comparison-diff-down" : "") : ""}>{row.comparable ? formatDifference(row) : "—"}</td>
                <td>
                  {row.comparable
                    ? <span className="comparison-compatible"><Icon name="check" size={12}/>Comparável</span>
                    : <span className="comparison-incompatible" title={row.incompatibilityReasons.join(" ")}><Icon name="warning" size={12}/>Não comparável</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((r) => !r.comparable) && (
        <div className="comparison-incompatible-notes">
          {rows.filter((r) => !r.comparable).map((r) => (
            <p key={r.parameterCode}><strong>{r.parameterCode}:</strong> {r.incompatibilityReasons.join(" ")}</p>
          ))}
        </div>
      )}
    </>
  );
}

/** Gráfico de diferenças em SVG puro, sem biblioteca -- só os parâmetros de fato comparáveis, ordenados
 * pela magnitude da diferença. Barra pra cada lado do zero, nunca um percentual sobre base inválida. */
function DifferenceChart({ rows }: { rows: ParameterComparisonRow[] }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.absoluteDifference ?? 0)), 0.001);
  const rowHeight = 26;
  const height = rows.length * rowHeight + 10;
  const width = 560;
  const midX = width / 2;
  const trackWidth = width / 2 - 90;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="comparison-chart" role="img" aria-label="Diferença absoluta por parâmetro entre os dois lados">
      <line x1={midX} y1={0} x2={midX} y2={height} stroke="var(--line, #333)" strokeWidth={1} />
      {rows.map((row, i) => {
        const diff = row.absoluteDifference ?? 0;
        const barWidth = (Math.abs(diff) / maxAbs) * trackWidth;
        const y = i * rowHeight + 6;
        const positive = diff >= 0;
        return (
          <g key={row.parameterCode}>
            <text x={midX - trackWidth - 6} y={y + 12} fontSize={9} fill="var(--muted, #93a19b)" textAnchor="start">{row.parameterCode}</text>
            <rect x={positive ? midX : midX - barWidth} y={y} width={barWidth} height={14} rx={3} fill={positive ? "#29966f" : "#d9655a"} />
            <text x={positive ? midX + barWidth + 6 : midX - barWidth - 6} y={y + 11} fontSize={8.5} fill="var(--ink, #eef1ef)" textAnchor={positive ? "start" : "end"}>{formatDifference(row)}</text>
          </g>
        );
      })}
    </svg>
  );
}

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

      {result && (mode === "fields" || mode === "seasons") && (
        <div className="card comparison-result">
          <div className="field-ops-section-head compact"><div><span className="eyebrow">COMPARAÇÃO POR PARÂMETRO</span><h2>{result.labelA} × {result.labelB}</h2></div></div>
          <ParameterComparisonTable rows={result.rows ?? []} labelA={result.labelA} labelB={result.labelB} />
        </div>
      )}

      {result && mode === "fields" && result.boundaryA && result.boundaryB && (
        <div className="comparison-side-maps">
          <div className="card"><div className="field-ops-section-head compact"><div><span className="eyebrow">A</span><h2>{result.labelA}</h2></div></div><RealFieldMap boundary={result.boundaryA} points={[]} height={280} hint="Contorno real"/></div>
          <div className="card"><div className="field-ops-section-head compact"><div><span className="eyebrow">B</span><h2>{result.labelB}</h2></div></div><RealFieldMap boundary={result.boundaryB} points={[]} height={280} hint="Contorno real"/></div>
        </div>
      )}

      {result && mode === "points" && (
        <div className="card comparison-result">
          <div className="field-ops-section-head compact"><div><span className="eyebrow">COMPARAÇÃO POR PARÂMETRO</span><h2>{result.pointA?.code ?? "—"} ({result.pointA?.fieldName ?? "—"}) × {result.pointB?.code ?? "—"} ({result.pointB?.fieldName ?? "—"})</h2></div></div>
          {!result.pointA || !result.pointB
            ? <p className="report-empty-note" style={{ padding: 16 }}>Um dos pontos selecionados não foi encontrado.</p>
            : <ParameterComparisonTable rows={result.rows ?? []} labelA={result.pointA.code} labelB={result.pointB.code} />}
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
