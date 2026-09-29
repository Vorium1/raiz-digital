import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/components/report-final-visual.tsx");
const page = read("src/app/(platform)/relatorios/talhao/[analysisId]/page.tsx");
const css = read("src/app/globals.css");

assert.equal((component.match(/<section className="report-a4-page">/g) ?? []).length, 3);
assert.match(css, /@page\{size:A4 portrait;margin:10mm\}/);
assert.match(css, /\.report-a4-page:last-child\{break-after:auto;page-break-after:auto\}/);
assert.match(css, /break-inside:avoid-page/);

assert.match(component, /facts\.forEach\(\(fact\) => register\(fact\.parameterCode\)\)/);
assert.match(component, /rows\.forEach\(\(row\) => register\(row\.parameterCode\)\)/);
assert.doesNotMatch(component, /summaries\.slice|recommendations\.slice/);
assert.match(component, /INSUFFICIENT_EVIDENCE/);
assert.match(component, /REQUIRES_AGRONOMIST_REVIEW/);

assert.match(component, /effectivePointCoordinates\(point\)/);
assert.match(component, /nenhum ponto é deslocado para caber no talhão/);
assert.doesNotMatch(component, /Math\.random|latitude\s*[+\-]=|longitude\s*[+\-]=/);

assert.match(component, /buildProducerResultSummary/);
assert.match(component, /buildProducerCommercialPlanSummary/);
assert.match(page, /commercialPlanSnapshot=\{viewingPublished \? publishedSnapshotV3\?\.commercialPlanSnapshot \?\? null : null\}/);
assert.match(component, /Produto comercial e custo não aparecem aqui porque não existe cenário comercial congelado/);

assert.match(component, /HORIZONTE DE FERTILIDADE/);
assert.match(component, /MICRONUTRIENTES E MATÉRIA ORGÂNICA/);
assert.match(component, /Contexto agroclimático informado/i);
assert.match(component, /CLIMA OFICIAL CONGELADO/);
assert.match(component, /INMET · CPTEC\/INPE · ZARC/);
assert.match(component, /agroclimateSnapshot\.forecast\.summaries/);
assert.match(component, /não altera automaticamente P, K, S ou calcário/);
assert.match(component, /BIOLOGIA DO SOLO/);
assert.match(component, /APLICAÇÃO E POSICIONAMENTO/);
assert.match(component, /Aplicar tudo de uma vez\?/);
assert.match(component, /Biologia isolada não gera crédito automático de N\/P\/K\/S/);

assert.match(page, /const publishedTechnicalBase = viewingPublished && snapshotOutput\?\.trace/);
assert.match(page, /technicalBase=\{viewingPublished \? publishedTechnicalBase : interpretation\?\.cropProfileName \?\? null\}/);
assert.match(page, /const shouldUsePublishedVersion = explicitlyPublished \|\| \(!explicitlyCurrent && publishedRecordExists\)/);
assert.match(page, /if \(shouldUsePublishedVersion && !canShowPublishedView\)/);
assert.match(page, /hashVerified === true/);

console.log("final-visual-report: 3 páginas A4, nutrientes completos, GPS fixo e snapshot fail-closed validados");
