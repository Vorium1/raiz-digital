import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sidebar = read("src/components/sidebar.tsx");
const mobile = read("src/components/mobile-navigation.tsx");
const home = read("src/app/(platform)/inicio/page.tsx");
const dashboard = read("src/app/(platform)/dashboard/page.tsx");
const send = read("src/components/simple-send-flow.tsx");
const reviewInbox = read("src/app/(platform)/revisar/page.tsx");
const field = read("src/components/simple-field-overview.tsx");
const results = read("src/app/(platform)/resultados/page.tsx");
const simpleReview = read("src/components/simple-final-review.tsx");
const simpleResult = read("src/app/(platform)/resultado/[analysisId]/page.tsx");

// A navegação principal é um app de tarefas, não uma árvore de módulos/ERP.
assert.match(sidebar, /const SEND_HREF = "\/enviar"/);
assert.match(mobile, /const SEND_HREF = "\/enviar"/);
assert.doesNotMatch(sidebar, /FLUXO PRINCIPAL|RECURSOS TÉCNICOS|GESTÃO|CAMPO/);
assert.doesNotMatch(mobile, /FLUXO PRINCIPAL|RECURSOS TÉCNICOS|GESTÃO|CAMPO/);
assert.match(home, /const SEND_HREF = "\/enviar"/);
assert.match(dashboard, /redirect\("\/inicio"\)/);

// O fluxo simples mantém evidência/readiness técnica por baixo sem publicar silenciosamente.
assert.match(send, /buildAnalysisEvidence/);
assert.match(send, /evaluateAnalysisDepthReadiness/);
assert.match(send, /readiness:\s*\{/);
assert.match(send, /hasAgronomicContext:\s*readiness\.effectiveLayer >= 2/);
assert.match(send, /router\.push\(`\/analise\/\$\{analysisId\}`\)/);
assert.doesNotMatch(send, /publish-report/);

// Entradas simples nunca devolvem o usuário ao cockpit técnico sem ele pedir detalhes.
assert.match(reviewInbox, /href=\{`\/analise\/\$\{item\.id\}`\}/);
assert.match(field, /`\/analise\/\$\{latest\.id\}`/);
assert.match(field, /Detalhes técnicos/);
assert.match(results, /href=\{`\/resultado\/\$\{report\.analysisId\}`\}/);
assert.match(simpleReview, /href=\{`\/resultado\/\$\{analysisId\}`\}/);
assert.doesNotMatch(simpleReview, /publish-report/);

// A visualização simples de resultado só usa snapshot publicado validado; nunca reconstrói a versão
// oficial a partir de prescrição viva ou publica por conta própria.
assert.match(simpleResult, /getPublishedReportSnapshot/);
assert.match(simpleResult, /published\.hashVerified !== true/);
assert.match(simpleResult, /approvedPrescription\.responsePayload/);
assert.doesNotMatch(simpleResult, /getLatestAgronomicPrescription|getLatestAgronomicNarrative/);
assert.doesNotMatch(simpleResult, /publish-report|PublishReportButton/);

console.log("ux3-zero-training: navegação simples + motor completo + entrega publicada fail-closed");
