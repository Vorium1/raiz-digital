import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/components/report-final-visual.tsx");
const technicalPage = read("src/app/(platform)/relatorios/talhao/[analysisId]/page.tsx");
const resultPage = read("src/app/(platform)/resultado/[analysisId]/page.tsx");
const css = read("src/app/ux3-result-document.css");
const rootLayout = read("src/app/layout.tsx");
const publishedNdviMap = read("src/components/published-ndvi-map.tsx");
const realFieldMap = read("src/components/real-field-map.tsx");
const printButton = read("src/components/print-button.tsx");

assert.equal((component.match(/<section className="concept-report-page/g) ?? []).length, 5);
assert.match(component, /RELATÓRIO/);
assert.match(component, /A ÁREA EM UMA/);
assert.match(component, /O QUE O SOLO/);
assert.match(component, /EXECUÇÃO DA SAFRA/);
assert.match(component, /O PLANO PARA O/);

assert.match(css, /@page\{size:A4 portrait;margin:0\}/);
assert.match(css, /height:297mm/);
assert.match(css, /width:210mm/);
assert.match(css, /page-break-after:always/);
assert.match(css, /-webkit-text-fill-color:#075c3b/);
assert.match(css, /concept-map-frame-cover[\s\S]*real-field-map-canvas[\s\S]*height:100%!important/);
assert.match(css, /concept-map-frame-overview[\s\S]*real-field-map-canvas[\s\S]*height:100%!important/);
assert.match(css, /concept-map-shell-overview[\s\S]*padding:0/);
assert.match(css, /concept-page-heading-approved>span[\s\S]*line-height:1\.18/);
assert.match(css, /gm-style-pbc/);
assert.match(css, /gm-style-pbt/);
assert.match(css, /concept-fertility-profile/);
assert.match(css, /grid-template-columns:1\.05fr \.85fr 1\.75fr/);
assert.match(css, /profile-low:before/);
assert.match(css, /profile-high:before/);
assert.match(css, /concept-profile-legend/);


assert.match(css, /\.concept-report-page:last-child\{break-after:auto;page-break-after:auto\}/);

assert.match(component, /facts\.forEach\(\(fact\) => register\(fact\.parameterCode\)\)/);
assert.match(component, /rows\.forEach\(\(row\) => register\(row\.parameterCode\)\)/);
assert.match(component, /operationalSummary\.rows/);
assert.match(component, /buildProducerResultSummary/);
assert.match(component, /buildProducerCommercialPlanSummary/);
assert.match(component, /Ainda não é peso de fertilizante comercial/);
assert.match(component, /commercialTotalDisplay/);
assert.match(component, /totalQuantity \* 1000/);
assert.match(component, /plainProducerOpinion/);
assert.match(component, /Isso ainda não representa o peso de um fertilizante comercial/);
assert.match(component, /commercial \? "APLICAR" : operationalSummary\.rows\.length \? "NECESSIDADE APROVADA" : "SEM APLICAÇÃO GERAL"/);
assert.match(component, /Definir a fonte comercial antes de converter estas necessidades em produto/);
assert.match(component, /operationalSummary\.rows\.map/);

assert.doesNotMatch(component, /const priorityParameterCodes = \["P", "K", "B"\]/);
assert.doesNotMatch(component, /diagnosticCodes\.slice\(0, 3\)/);
assert.doesNotMatch(component, /recommendations\.slice\(0, 2\)/);
assert.match(component, /fertilityActionRows\.map/);
assert.match(component, /fertilityProfileRows\.filter\(\(item\) => item\.needsAction\)/);
assert.match(component, /quietNutrientLabels\.join/);
assert.match(component, /não aparecem em destaque porque/);
assert.match(component, /ANÁLISE/);
assert.match(component, /ESTADO/);
assert.match(component, /DECISÃO/);
assert.match(component, /limeProfileRow/);
assert.match(component, /VIGÊNCIA DA RECOMENDAÇÃO/);
assert.match(component, /Esta dose vale para esta safra/);
assert.doesNotMatch(component, /Plano plurianual não congelado/);
assert.doesNotMatch(component, /HORIZONTE DE FERTILIDADE/);
assert.doesNotMatch(component, /Horizonte de .* anos é planejamento/);
assert.doesNotMatch(component, />VALIDAR</);

assert.match(component, /effectivePointCoordinates\(point\)/);
assert.match(component, /PublishedNdviMap/);
assert.match(component, /points=\{props\.points\}/);
assert.doesNotMatch(component, /Math\.random|latitude\s*[+\-]=|longitude\s*[+\-]=/);
assert.match(component, /showLegend=\{false\}[\s\S]*?eager/);
assert.match(publishedNdviMap, /data-report-ndvi-state="loading"/);
assert.match(publishedNdviMap, /renderImmediately=\{eager\}/);
assert.match(realFieldMap, /renderImmediately = false/);
assert.match(printButton, /data-report-ndvi-state="loading"/);
assert.match(printButton, /Preparando PDF/);
assert.match(printButton, /document\.fonts\.ready/);
assert.match(printButton, /real-field-map-deferred/);
assert.match(printButton, /document\.images/);

assert.match(component, /MICRONUTRIENTES/);
assert.match(component, /BIOLOGIA/);
assert.match(component, /CLIMA \/ RISCO/);
assert.match(component, /APLICAÇÃO \/ POSICIONAMENTO/);

assert.match(technicalPage, /ndviSnapshot=\{viewingPublished \? publishedSnapshotV3\?\.ndviSnapshot \?\? null : null\}/);
assert.match(resultPage, /<FinalVisualReport/);
assert.match(resultPage, /ndviSnapshot=\{v3\?\.ndviSnapshot \?\? null\}/);
assert.match(resultPage, /commercialPlanSnapshot=\{v3\?\.commercialPlanSnapshot \?\? null\}/);
assert.match(rootLayout, /\/favicon-32x32\.png/);
assert.match(rootLayout, /\/favicon-48x48\.png/);

assert.doesNotMatch(resultPage, /summarizeSimpleInterpretation|recommendationTotalForArea/);
assert.match(component, /showTechnicalAppendix\?: boolean/);
assert.match(component, /ANEXO TÉCNICO/);
assert.match(component, /props\.facts\.map/);
assert.match(component, /recommendations\.map/);
assert.match(component, /props\.points\.map/);
assert.match(technicalPage, /showTechnicalAppendix/);
assert.doesNotMatch(resultPage, /showTechnicalAppendix/);

assert.match(technicalPage, /const publishedTechnicalBase = viewingPublished && snapshotOutput\?\.trace/);
assert.match(technicalPage, /technicalBase=\{viewingPublished \? publishedTechnicalBase : interpretation\?\.cropProfileName \?\? null\}/);
assert.match(technicalPage, /const shouldUsePublishedVersion = explicitlyPublished \|\| \(!explicitlyCurrent && publishedRecordExists\)/);
assert.match(technicalPage, /if \(shouldUsePublishedVersion && !canShowPublishedView\)/);
assert.match(technicalPage, /hashVerified === true/);

console.log("final-visual-report: 5 páginas conceituais, snapshot único, NDVI/pontos, doses e produto comercial fail-closed validados");
