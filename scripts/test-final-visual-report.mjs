import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/components/report-final-visual.tsx");
const technicalPage = read("src/app/(platform)/relatorios/talhao/[analysisId]/page.tsx");
const resultPage = read("src/app/(platform)/resultado/[analysisId]/page.tsx");
const css = read("src/app/ux3-result-document.css");

assert.equal((component.match(/<section className="concept-report-page/g) ?? []).length, 5);
assert.match(component, /Inteligência que vira ação/);
assert.match(component, /O solo mostra o caminho/);
assert.match(component, /Quanto aplicar e por quê/);
assert.match(component, /Decisão hoje. Solo acompanhado amanhã/);
assert.match(component, /Uma orientação sem complicação/);

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

assert.match(component, /effectivePointCoordinates\(point\)/);
assert.match(component, /PublishedNdviMap/);
assert.match(component, /points=\{props\.points\}/);
assert.doesNotMatch(component, /Math\.random|latitude\s*[+\-]=|longitude\s*[+\-]=/);

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
