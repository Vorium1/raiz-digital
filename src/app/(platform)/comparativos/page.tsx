import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { PageIntro } from "@/components/ui";
import { ComparisonExplorer } from "@/components/comparison-explorer";
import { isDatabaseMode } from "@/lib/data-mode";
import { demoComparison } from "@/lib/demo-data";

export const metadata = { title: "Comparativos" };

export default function ComparativesPage() {
  if (!isDatabaseMode()) {
    const maxPh = Math.max(...demoComparison.items.map((item) => item.ph));
    const maxP = Math.max(...demoComparison.items.map((item) => item.p));
    return <><Topbar eyebrow="Inteligência · demonstração" title="Comparativos"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Modo demonstração ativo — exemplo ilustrativo.</span></div><PageIntro title="Comparar talhões, safras, pontos e propriedades" description="Só compara classificações já homologadas — sem inferência."/>
      <section className="card">
        <div className="field-ops-section-head compact"><div><span className="eyebrow">EXEMPLO</span><h2>{demoComparison.dimension}</h2></div></div>
        <div style={{ padding: "6px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {demoComparison.items.map((item) => (
            <div key={item.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}><strong>{item.label}</strong><span>pH {item.ph.toFixed(1)} · P {item.p.toFixed(1)} mg/dm³</span></div>
              <div style={{ background: "#e7ece9", borderRadius: 5, height: 8, overflow: "hidden", marginBottom: 3 }}><div style={{ background: "var(--teal)", height: "100%", width: `${(item.ph / maxPh) * 100}%` }}/></div>
              <div style={{ background: "#e7ece9", borderRadius: 5, height: 8, overflow: "hidden" }}><div style={{ background: "var(--copper)", height: "100%", width: `${(item.p / maxP) * 100}%` }}/></div>
            </div>
          ))}
        </div>
      </section>
    </div></>;
  }
  return (
    <>
      <Topbar eyebrow="Inteligência" title="Comparativos"/>
      <div className="content-wrap">
        <PageIntro title="Comparar talhões, safras, pontos e propriedades" description="Usa somente classificações já homologadas pelo motor determinístico — sem interpretação inventada para preencher lacuna."/>
        <ComparisonExplorer/>
      </div>
    </>
  );
}
