import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { AgronomicMapExplorer } from "@/components/agronomic-map-explorer";
import { PageIntro } from "@/components/ui";
import { isDatabaseMode } from "@/lib/data-mode";

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
        <div className="data-card"><div className="empty-state"><Icon name="map"/><strong>Disponível no modo com banco de dados real</strong><small>Conecte DATA_MODE=database para ver o mapa agronômico com dados reais.</small></div></div>
      </div>
    </>
  );
}
