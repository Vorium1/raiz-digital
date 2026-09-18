import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sidebar = read("src/components/sidebar.tsx");
const mobile = read("src/components/mobile-navigation.tsx");
const home = read("src/app/(platform)/inicio/page.tsx");
const dashboard = read("src/app/(platform)/dashboard/page.tsx");
const send = read("src/components/simple-send-flow.tsx");
const existingUpload = read("src/components/simple-existing-analysis-upload.tsx");
const labImporter = read("src/components/lab-importer.tsx");
const reviewInbox = read("src/app/(platform)/revisar/page.tsx");
const field = read("src/components/simple-field-overview.tsx");
const fieldOverviewRepository = read("src/lib/repositories/field-overview.ts");
const fieldVigor = read("src/components/simple-field-vigor.tsx");
const results = read("src/app/(platform)/resultados/page.tsx");
const simpleAnalysis = read("src/app/(platform)/analise/[id]/page.tsx");
const simpleResult = read("src/app/(platform)/resultado/[analysisId]/page.tsx");
const simpleRefresh = read("src/components/simple-refresh-analysis.tsx");
const simpleReview = read("src/components/simple-final-review.tsx");
const simpleRecommendationContext = read("src/components/simple-recommendation-context.tsx");
const interpretationsRepository = read("src/lib/repositories/interpretations.ts");
const prescriptionProvider = read("src/lib/ai/agronomic-prescription-provider.ts");
const deterministicFallback = read("src/lib/ai/providers/deterministic-limited-prescription-provider.ts");
const prescriptionWorkflow = read("src/lib/workflows/agronomic-prescription-draft.ts");
const simplePublish = read("src/components/simple-publish-result-button.tsx");

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
assert.match(send, /<LabImporter simple /);
assert.match(existingUpload, /<LabImporter simple /);
assert.match(labImporter, /simple && preview && preview\.blockers > 0/);
assert.match(labImporter, /!simple && preview && <div className="import-preview"/);
assert.match(labImporter, /sourceType:\s*"PDF_OCR"/);
assert.match(send, /sourceType:\s*file\.sourceType/);
assert.match(send, /sourceFileName:\s*file\.originalFileName/);

// Entradas simples nunca devolvem o usuário ao cockpit técnico sem ele pedir detalhes.
assert.match(reviewInbox, /href=\{`\/analise\/\$\{item\.id\}`\}/);
assert.match(reviewInbox, /getAnalysisEvidenceState/);
assert.match(reviewInbox, /freshness\.current === true/);
assert.match(reviewInbox, /item\.currentCrop \|\| item\.nextCrop/);
assert.match(field, /`\/analise\/\$\{latest\.id\}`/);
assert.match(field, /Detalhes técnicos/);
assert.doesNotMatch(field, /Falta uma informação para a RAIZ concluir esta análise/);
assert.match(field, /Análise precisa continuar/);
assert.match(field, /<SimpleFieldVigor fieldId=\{field\.id\}/);
assert.match(field, /points=\{collectionPoints as any\}/);
assert.match(fieldOverviewRepository, /AS "labResultCount"/);
assert.match(fieldOverviewRepository, /collectionPoints: pointsResult\.rows/);
assert.match(fieldVigor, /raiz:ndvi:auto:\$\{fieldId\}/);
assert.match(fieldVigor, /\/api\/fields\/\$\{fieldId\}\/ndvi/);
assert.match(fieldVigor, /method:\s*"POST"/);
assert.match(fieldVigor, /imageOverlay=\{overlay\}/);
assert.match(results, /href=\{`\/resultado\/\$\{report\.analysisId\}`\}/);
assert.match(results, /const seenAnalyses = new Set<string>\(\)/);
assert.match(results, /const latestResults = published\.filter/);
assert.match(simpleAnalysis, /getAnalysisEvidenceState/);
assert.match(simpleAnalysis, /summarizeSimpleInterpretation/);
assert.match(simpleAnalysis, /Varia entre os pontos/);
assert.match(simpleAnalysis, /currentCrop \|\| \(analysis as any\)\.nextCrop/);
assert.match(simpleResult, /summarizeSimpleInterpretation/);
assert.match(simpleResult, /Como está a área/);
assert.match(simpleResult, /context\.currentCrop \|\| context\.nextCrop \|\| context\.cropProfileName/);
assert.match(simpleResult, /<ReportSignature branding=\{branding\}\/>/);
assert.match(simpleResult, /estimatedPointCount/);
assert.match(simpleResult, /posições dos pontos são aproximadas/);
assert.match(simpleAnalysis, /<SimpleRefreshAnalysis analysisId=\{id\}/);
assert.match(simpleRefresh, /\/api\/analyses\/\$\{analysisId\}\/interpret/);
assert.match(simpleRefresh, /AGRONOMIC_RULES_CHANGED/);
assert.match(simpleRefresh, /raiz:ux3:rule-refresh:\$\{analysisId\}/);
assert.match(simpleRefresh, /interpret\?draft=local/);
assert.match(simpleRefresh, /useEffect/);
assert.match(simpleRefresh, /method:\s*"POST"/);
assert.match(interpretationsRepository, /normalizeUnit\(row\.parameterCode, row\.unit\)/);
assert.match(interpretationsRepository, /normalizeAnalyticalMethod\(row\.parameterCode, row\.method\)/);
assert.match(simpleReview, /href=\{`\/resultado\/\$\{analysisId\}`\}/);
assert.match(simpleReview, /<SimplePublishResultButton analysisId=\{analysisId\} interpretationId=\{interpretationId\}/);
assert.doesNotMatch(simpleReview, /publish-report/);
assert.match(simpleReview, /Preparar com os dados disponíveis/);
assert.match(simpleReview, /Conclusão pronta com os dados disponíveis/);
assert.match(simpleReview, /Aprovar conclusão/);
assert.match(simpleReview, /Limites desta conclusão/);
assert.doesNotMatch(simpleReview, /Ainda falta informação/);
assert.doesNotMatch(simpleReview, /prescriptionCurrent && pkValid && !needsPkContext/);
assert.match(simpleRecommendationContext, /<details className="simple-context-question">/);
assert.match(simpleRecommendationContext, /Incluir dose de fósforo e potássio/);
assert.match(simpleRecommendationContext, /conclui o relatório sem estimar valores/);
assert.match(prescriptionProvider, /return deterministicLimitedPrescriptionProvider/);
assert.match(deterministicFallback, /recommendations:\s*\[\]/);
assert.match(deterministicFallback, /managementPractices:\s*\[\]/);
assert.match(deterministicFallback, /isRealLanguageModel:\s*false/);
assert.match(deterministicFallback, /não criou doses ou práticas de manejo sem evidência suficiente/);
assert.match(prescriptionWorkflow, /input\.mode === "deterministic"/);
assert.match(prescriptionWorkflow, /deterministicLimitedPrescriptionProvider/);
assert.match(prescriptionWorkflow, /if \(provider\.isRealLanguageModel\)/);
assert.match(
  prescriptionWorkflow,
  /if \(provider\.isRealLanguageModel\) \{[\s\S]*?await getTenantPrescriptionUsage\(input\.tenantId\)[\s\S]*?provider = deterministicLimitedPrescriptionProvider/,
  "cota de IA deve degradar para fechamento determinístico, não bloquear o relatório",
);
assert.match(
  prescriptionWorkflow,
  /catch \(error\) \{[\s\S]*?!provider\.isRealLanguageModel[\s\S]*?provider = deterministicLimitedPrescriptionProvider[\s\S]*?provider\.prescribe/,
  "falha do LLM deve degradar para fechamento determinístico",
);
assert.match(simplePublish, /\/api\/interpretations\/\$\{interpretationId\}\/publish-report/);
assert.match(simplePublish, /method:\s*"POST"/);
assert.match(simplePublish, /router\.push\(`\/resultado\/\$\{analysisId\}`\)/);
assert.doesNotMatch(simplePublish, /useEffect/);

// A visualização simples de resultado só usa snapshot publicado validado; nunca reconstrói a versão
// oficial a partir de prescrição viva ou publica por conta própria.
assert.match(simpleResult, /getPublishedReportSnapshot/);
assert.match(simpleResult, /published\.hashVerified !== true/);
assert.match(simpleResult, /approvedPrescription\.responsePayload/);
assert.doesNotMatch(simpleResult, /getLatestAgronomicPrescription|getLatestAgronomicNarrative/);
assert.doesNotMatch(simpleResult, /publish-report|PublishReportButton/);

console.log("ux3-zero-training: navegação simples + motor completo + entrega publicada fail-closed");
