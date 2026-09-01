import { Topbar } from "@/components/topbar";
import { Icon } from "@/components/icon";
import { FieldOperationsManager } from "@/components/field-operations-manager";
import { PageIntro, StatusBadge } from "@/components/ui";
import { samplePoints } from "@/lib/demo-data";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Coletas e mapas" };

export default function CollectionsPage() {
  if (isDatabaseMode()) return <><Topbar eyebrow="Campo" title="Coletas e mapas"/><div className="content-wrap"><PageIntro title="Operação georreferenciada" description="Cadastre áreas, gere grids, importe pontos GPS e confirme a coleta no campo. As coordenadas são validadas pelo PostGIS antes de seguirem para o laudo."/><FieldOperationsManager/></div></>;
  return <><Topbar eyebrow="Campo · demonstração" title="Coletas e mapas"/><div className="content-wrap"><div className="demo-banner"><Icon name="warning" size={14}/><span>Mapa, pontos, responsável e valores abaixo são exemplos visuais.</span></div><PageIntro title="Operação georreferenciada" description="Planeje grids, importe GPS e confirme cada ponto de coleta dentro do talhão, com rastreabilidade da amostra e do técnico."/><div className="map-layout"><section className="card map-panel"><div className="map-toolbar"><div><span className="eyebrow">FAZENDA HORIZONTE</span><h3>Talhão Norte · Ordem OC-0261</h3></div><div><button type="button" className="button secondary"><Icon name="upload" size={15}/>Importar GPS</button></div></div><div className="operational-map"><div className="map-field-shape"></div>{samplePoints.map(point=><span key={point.id} className={`map-point ${point.className}`} style={{left:`${point.x+5}%`,top:`${point.y+7}%`}}><b>{point.id}</b><small>pH {point.value}</small></span>)}<div className="map-attribution">Mapa demonstrativo · WGS84</div></div></section><aside className="card collection-panel"><div className="card-header"><div><span className="eyebrow">ORDEM DE COLETA</span><h2>OC-0261</h2></div><StatusBadge tone="info">Em andamento</StatusBadge></div><dl className="detail-list"><div><dt>Responsável</dt><dd>Lucas Martins</dd></div><div><dt>Profundidade</dt><dd>0–20 cm</dd></div><div><dt>Previstos</dt><dd>24 pontos</dd></div><div><dt>Coletados</dt><dd>18 pontos</dd></div></dl></aside></div></div></>;
}
