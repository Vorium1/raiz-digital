import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/components/report-final-visual.tsx");
const technicalPage = read("src/app/(platform)/relatorios/talhao/[analysisId]/page.tsx");
const resultPage = read("src/app/(platform)/resultado/[analysisId]/page.tsx");
const css = read("src/app/ux3-result-document.css");
const publishedNdviMap = read("src/components/published-ndvi-map.tsx");
const realFieldMap = read("src/components/real-field-map.tsx");
const printButton = read("src/components/print-button.tsx");

assert.equal((component.match(/<section className="concept-report-page/g) ?? []).length, 5);
assert.match(component, /RELATÓRIO/);
assert.match(component, /A ÁREA EM UMA/);
assert.match(component, /O QUE O SOLO/);
assert.match(component, /PLANEJAMENTO TÉCNICO/);
assert.match(component, /O PLANO PARA O/);

assert.match(css, /@page\{size:A4 portrait;margin:0\}/);
assert.match(css, /height:297mm/);
assert.match(css, /width:210mm/);
assert.match(css, /page-break-after:always/);
assert.match(css, /\.concept-report-page:last-child\{break-after:auto;page-break-after:auto\}/);

assert.match(component, /facts\.forEach\(\(fact\) => register\(fact\.parameterCode\)\)/);
assert.match(component, /rows\.forEach\(\(row\) => register\(row\.parameterCode\)\)/);
assert.match(component, /operationalSummary\.rows/);
assert.match(component, /buildProducerResultSummary/);
assert.match(component, /buildProducerCommercialPlanSummary/);
assert.match(component, /Produto comercial ainda não congelado/);
assert.match(component, /A RAIZ não converte nutriente em fertilizante sem fonte definida/);
assert.match(component, /commercialTotalDisplay/);
assert.match(component, /totalQuantity \* 1000/);
assert.match(component, /plainProducerOpinion/);
assert.match(component, /Isso ainda não representa o peso de um fertilizante comercial/);
assert.match(component, /hasValidationPending \? "VALIDAR" : "CONFERIR"/);

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

assert.match(component, /HORIZONTE DE FERTILIDADE/);
assert.match(component, /MICRONUTRIENTES/);
assert.match(component, /BIOLOGIA DO SOLO/);
assert.match(component, /CLIMA \/ RISCO/);
assert.match(component, /APLICAÇÃO \/ POSICIONAMENTO/);

assert.match(technicalPage, /ndviSnapshot=\{viewingPublished \? publishedSnapshotV3\?\.ndviSnapshot \?\? null : null\}/);
assert.match(resultPage, /<FinalVisualReport/);
assert.match(resultPage, /ndviSnapshot=\{v3\?\.ndviSnapshot \?\? null\}/);
assert.match(resultPage, /commercialPlanSnapshot=\{v3\?\.commercialPlanSnapshot \?\? null\}/);
assert.doesNotMatch(resultPage, /summarizeSimpleInterpretation|recommendationTotalForArea/);

assert.match(technicalPage, /const publishedTechnicalBase = viewingPublished && snapshotOutput\?\.trace/);
assert.match(technicalPage, /technicalBase=\{viewingPublished \? publishedTechnicalBase : interpretation\?\.cropProfileName \?\? null\}/);
assert.match(technicalPage, /const shouldUsePublishedVersion = explicitlyPublished \|\| \(!explicitlyCurrent && publishedRecordExists\)/);
assert.match(technicalPage, /if \(shouldUsePublishedVersion && !canShowPublishedView\)/);
assert.match(technicalPage, /hashVerified === true/);

console.log("final-visual-report: 5 páginas conceituais, snapshot único, NDVI/pontos, doses e produto comercial fail-closed validados");
