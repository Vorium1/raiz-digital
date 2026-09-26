import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { HistoricalComparisonExplorer } from "@/components/historical-comparison-explorer";

export const metadata = { title: "Histórico" };

const indicators = [
  { name: "pH em água", old: "5,2", current: "5,8", change: "+11,5%", tone: "up" },
  { name: "Fósforo", old: "8,4", current: "12,1", change: "+44,0%", tone: "up" },
  { name: "Potássio", old: "138", current: "142", change: "+2,9%", tone: "stable" },
  { name: "Matéria orgânica", old: "3,1", current: "3,0", change: "−3,2%", tone: "down" },
];

export default function HistoryPage() {
  if (isDatabaseMode()) return <><Topbar eyebrow="Evolução" title="Histórico agronômico"/><div className="content-wrap"><PageIntro title="O solo ao longo do tempo" description="Compare duas evidências reais do mesmo talhão. O delta só é calculado quando unidade, método, tipo de amostra e profundidade representam o mesmo contexto de medição."/><HistoricalComparisonExplorer/></div></>;
  return <><Topbar eyebrow="Evolução · demonstração" title="Histórico agronômico"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Comparações e tendências abaixo são exemplos visuais.</span></div><PageIntro title="O solo ao longo do tempo" description="Compare somente dados compatíveis por talhão, profundidade, método laboratorial e posição espacial."/><section className="card history-card"><div className="card-header"><div><span className="eyebrow">COMPARAÇÃO DEMONSTRATIVA</span><h2>Indicadores principais · 0–20 cm</h2></div></div><div className="indicator-comparison">{indicators.map(item=><article key={item.name}><span>{item.name}</span><div><small>2024/25</small><strong>{item.old}</strong></div><Icon name="arrow" size={18}/><div><small>2026/27</small><strong>{item.current}</strong></div><b className={item.tone}>{item.change}</b></article>)}</div></section></div></>;
}
