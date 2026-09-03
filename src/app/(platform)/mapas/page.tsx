import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { AgronomicMapExplorer } from "@/components/agronomic-map-explorer";
import { PageIntro } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";
import { samplePoints } from "@/lib/demo-data";

export const metadata = { title: "Mapas" };

export default function MapsPage() {
  if (isDatabaseMode()) {
    return (
      <>
        <Topbar eyebrow="Inteligência" title="Mapas"/>
        <div className="content-wrap">
          <PageIntro title="Mapa agronômico" description="Cada ponto é a coordenada real do PostGIS. Selecione um parâmetro para colorir pela classificação já homologada — sem parâmetro, o mapa mostra só o status de coleta."/>
          <AgronomicMapExplorer/>
        </div>
      </>
    );
  }
  return (
    <>
      <Topbar eyebrow="Inteligência · demonstração" title="Mapas"/>
      <div className="content-wrap">
        <div className="demo-banner"><Icon name="warning" size={14}/><span>Esta é uma demonstração visual. O mapa real usa PostGIS e classificação homologada.</span></div>
        <PageIntro title="Mapa agronômico" description="Selecione parâmetro, profundidade e safra/cultura para colorir os pontos reais de amostragem pela classificação determinística."/>
        <div className="map-layout">
          <section className="card map-panel">
            <div className="map-toolbar"><div><span className="eyebrow">FAZENDA HORIZONTE · EXEMPLO</span><h3>Talhão Norte · Parâmetro: pH</h3></div></div>
            <div className="operational-map">
              <div className="map-field-shape"></div>
              {samplePoints.map((point) => (
                <span key={point.id} className={`map-point ${point.className}`} style={{ left: `${point.x + 5}%`, top: `${point.y + 7}%` }}>
                  <b>{point.id}</b><small>pH {point.value}</small>
                </span>
              ))}
              <div className="map-attribution">Mapa demonstrativo · WGS84</div>
            </div>
          </section>
          <aside className="card collection-panel">
            <div className="card-header"><div><span className="eyebrow">LEGENDA</span><h2>Classificação (pH)</h2></div></div>
            <dl className="detail-list">
              <div><dt><span className="map-point high" style={{ position: "static", display: "inline-flex", width: 16, height: 16, marginRight: 6 }}/>Adequado</dt><dd>2 pontos</dd></div>
              <div><dt><span className="map-point medium" style={{ position: "static", display: "inline-flex", width: 16, height: 16, marginRight: 6 }}/>Atenção</dt><dd>2 pontos</dd></div>
              <div><dt><span className="map-point low" style={{ position: "static", display: "inline-flex", width: 16, height: 16, marginRight: 6 }}/>Crítico</dt><dd>2 pontos</dd></div>
            </dl>
          </aside>
        </div>
      </div>
    </>
  );
}
