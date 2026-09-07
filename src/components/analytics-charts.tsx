import type { ParameterAverage, StatusBucket, FieldConfidenceRank, ParameterHistoryPoint } from "@/lib/repositories/analytics-dashboard";
import { classificationColor } from "@/lib/classification-colors";

/**
 * Gráficos do "Painel de análises" -- desenhados à mão em SVG/CSS, sem
 * biblioteca (mesmo padrão já usado no resto do app, ex.: `.trend-visual`).
 * Todos recebem dado real já calculado no repositório; nenhum componente
 * aqui inventa número -- quando a lista vem vazia, mostram um estado vazio
 * explícito, nunca um gráfico com dado de exemplo.
 */

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  COLLECTION_SCHEDULED: "Coleta agendada",
  COLLECTION_IN_PROGRESS: "Coleta em andamento",
  AWAITING_LAB: "Aguardando laboratório",
  IMPORTED: "Laudo importado",
  INCONSISTENT: "Inconsistente",
  READY_TO_INTERPRET: "Pronta pra interpretar",
  INTERPRETED: "Interpretada",
  AWAITING_REVIEW: "Aguardando revisão",
  APPROVED: "Aprovada",
  REPORT_SENT: "Relatório enviado",
  ARCHIVED: "Arquivada",
};

/** Paleta categórica de ordem fixa -- mesma ordem sempre, nunca reatribuída quando um filtro muda quais status aparecem. */
const STATUS_PALETTE = ["#00c4d6", "#4dd9e6", "#b86f3e", "#29966f", "#d89943", "#d9655a", "#8b5cf6", "#93a19b"];

export function EmptyChartState({ message }: { message: string }) {
  return <div className="chart-empty"><span>{message}</span></div>;
}

/** Barra horizontal: valor médio medido, com a faixa de suficiência da cultura desenhada atrás como referência. */
export function ParameterRangeBar({ parameter }: { parameter: ParameterAverage }) {
  const bands = parameter.sufficiencyRanges;
  if (!bands || bands.length === 0) {
    return (
      <div className="range-bar-row">
        <div className="range-bar-label"><strong>{parameter.parameterCode}</strong><small>sem faixa homologada pra esta cultura</small></div>
        <div className="range-bar-track"><div className="range-bar-value-only">{parameter.avgValue.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {parameter.unit}</div></div>
      </div>
    );
  }
  const finiteBounds = bands.flatMap((b) => [b.min, b.max]).filter((v): v is number => typeof v === "number");
  const domainMin = Math.min(parameter.avgValue, ...finiteBounds);
  const domainMax = Math.max(parameter.avgValue, ...finiteBounds);
  const span = domainMax - domainMin || 1;
  const toPct = (v: number) => ((v - domainMin) / span) * 100;
  const matchedBand = bands.find((b) => (b.min == null || parameter.avgValue >= b.min) && (b.max == null || parameter.avgValue <= b.max));
  const color = classificationColor(matchedBand?.label);
  return (
    <div className="range-bar-row">
      <div className="range-bar-label">
        <strong>{parameter.parameterCode}</strong>
        <small>{parameter.avgValue.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {parameter.unit} · {matchedBand?.label ?? "fora de faixa conhecida"}</small>
      </div>
      <div className="range-bar-track">
        {bands.map((band, i) => {
          const left = toPct(band.min ?? domainMin);
          const right = toPct(band.max ?? domainMax);
          return <div key={i} className="range-bar-band" style={{ left: `${left}%`, width: `${Math.max(right - left, 1.5)}%`, background: `${classificationColor(band.label)}33` }} title={band.label} />;
        })}
        <div className="range-bar-marker" style={{ left: `${toPct(parameter.avgValue)}%`, background: color }} />
      </div>
    </div>
  );
}

/** Gráfico de rosca: distribuição de status das análises no escopo filtrado. */
export function StatusDonut({ buckets }: { buckets: StatusBucket[] }) {
  if (buckets.length === 0) return <EmptyChartState message="Nenhuma análise no escopo selecionado ainda." />;
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = buckets.map((bucket, i) => {
    const fraction = bucket.count / total;
    const dash = fraction * circumference;
    const segment = { ...bucket, color: STATUS_PALETTE[i % STATUS_PALETTE.length], dash, offset };
    offset += dash;
    return segment;
  });
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" className="donut-svg" role="img" aria-label={`Distribuição de status: ${buckets.map((b) => `${STATUS_LABEL[b.status] ?? b.status} ${b.count}`).join(", ")}`}>
        <g transform="rotate(-90 50 50)">
          {segments.map((s) => (
            <circle key={s.status} cx="50" cy="50" r={radius} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${s.dash} ${circumference - s.dash}`} strokeDashoffset={-s.offset} />
          ))}
        </g>
        <text x="50" y="47" textAnchor="middle" className="donut-total-value">{total}</text>
        <text x="50" y="60" textAnchor="middle" className="donut-total-label">análises</text>
      </svg>
      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.status}><i style={{ background: s.color }} /><span>{STATUS_LABEL[s.status] ?? s.status}</span><b>{s.count}</b></li>
        ))}
      </ul>
    </div>
  );
}

/** Linha simples: evolução de um parâmetro (ex.: pH) ao longo das últimas análises de um talhão. */
export function ParameterTrendLine({ points, parameterLabel }: { points: ParameterHistoryPoint[]; parameterLabel: string }) {
  if (points.length === 0) return <EmptyChartState message={`Sem histórico de ${parameterLabel} para este talhão ainda.`} />;
  if (points.length === 1) {
    return <div className="trend-single"><strong>{points[0].value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {points[0].unit}</strong><small>única análise registrada até agora -- evolução aparece a partir da 2ª.</small></div>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const width = 100, height = 100, padding = 6;
  const stepX = (width - padding * 2) / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: height - padding - ((p.value - min) / span) * (height - padding * 2),
  }));
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;
  return (
    <div className="trend-line-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="trend-line-svg" role="img" aria-label={`Evolução de ${parameterLabel}: ${points.map((p) => p.value.toLocaleString("pt-BR")).join(" -> ")}`}>
        <path d={areaD} fill="url(#trendFill)" stroke="none" />
        <path d={pathD} fill="none" stroke="var(--teal)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r="2" fill="var(--forest)" stroke="var(--teal)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />)}
        <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--teal)" stopOpacity="0.28" /><stop offset="100%" stopColor="var(--teal)" stopOpacity="0" /></linearGradient></defs>
      </svg>
      <div className="trend-line-axis">
        {points.map((p) => <span key={p.analysisId}>{new Date(p.createdAt).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })}</span>)}
      </div>
    </div>
  );
}

/** Lista ranqueada (talhões por confiabilidade) -- barra horizontal proporcional, sem biblioteca de gráfico. */
export function ConfidenceRankingList({ items }: { items: FieldConfidenceRank[] }) {
  if (items.length === 0) return <EmptyChartState message="Nenhum talhão com confiabilidade calculada ainda." />;
  const max = Math.max(...items.map((i) => i.avgConfidence), 100);
  return (
    <ul className="confidence-ranking">
      {items.map((item) => (
        <li key={item.fieldId}>
          <div className="confidence-ranking-head"><span>{item.fieldName}</span><b>{Math.round(item.avgConfidence)}</b></div>
          <div className="confidence-ranking-track"><i style={{ width: `${(item.avgConfidence / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
