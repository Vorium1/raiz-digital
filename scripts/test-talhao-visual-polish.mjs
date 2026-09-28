import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layers = await readFile(new URL("../src/components/simple-field-map-layers.tsx", import.meta.url), "utf8");
const mapData = await readFile(new URL("../src/lib/repositories/map-data.ts", import.meta.url), "utf8");
const ndviPalette = await readFile(new URL("../src/lib/ndvi-display-palette.ts", import.meta.url), "utf8");

assert.match(mapData, /classifiedParameters/, "API do mapa deve distinguir parâmetro medido de parâmetro classificável.");
assert.match(mapData, /item\?\.interpretable === true/, "Só interpretação corrente e interpretável pode entrar como fertilidade visual.");
assert.match(layers, /layerPayload\.classifiedParameters/, "Talhão deve montar botões somente a partir de parâmetros classificáveis.");
assert.doesNotMatch(layers, /Planejado × coletado|Ponto planejado/, "Talhão 360 não deve promover planejamento interno como segunda camada de verdade.");
assert.doesNotMatch(layers, /plannedLatitude|plannedLongitude/, "Tela principal não deve duplicar coordenadas planejadas.");
assert.match(layers, /Pontos de coleta/);
assert.match(layers, /Ponto real importado/);
assert.match(layers, /GPS coletado em campo/);
assert.match(layers, /Sem GPS real confirmado/);
assert.match(layers, /hiddenPlanningCount/, "Planejamento oculto deve continuar explicitamente contabilizado para auditoria visual.");

assert.match(ndviPalette, /BAIXO:\s*"#E52222"/, "Vigor baixo deve usar vermelho forte.");
assert.match(ndviPalette, /MODERADO:\s*"#FFB000"/, "Vigor moderado deve usar amarelo/âmbar forte.");
assert.match(ndviPalette, /ALTO:\s*"#2DBE4F"/, "Vigor alto deve usar verde forte.");
assert.match(ndviPalette, /MUITO_ALTO:\s*"#0B5D2A"/, "Vigor muito alto deve usar verde escuro.");
assert.match(ndviPalette, /SOURCE_TO_DISPLAY/, "Paleta nova deve continuar sendo apenas remapeamento de exibição.");
assert.match(ndviPalette, /context\.putImageData/, "Raster arquivado não deve ser regravado; transformação fica no canvas temporário.");

console.log("talhao-visual-polish: fertilidade útil, pontos reais e NDVI de alto contraste validados");
