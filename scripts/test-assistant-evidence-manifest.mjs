import assert from "node:assert/strict";
import { buildEvidenceManifest } from "../src/lib/ai/assistant-evidence-manifest.ts";

// Fechamento técnico da Fase 4A (2º pedido, item 1) -- EvidenceManifest precisa derivar automaticamente
// ruleRefs/technicalSourceIds do Evidence Package, em vez de depender de cada chamador (/api/assistant)
// lembrar de passar isso manualmente. Antes da correção, esses campos ficavam SEMPRE vazios, mesmo quando
// a análise tinha regra e fontes técnicas reais.

const SCREEN_CONTEXT = { type: "analysis", id: "a1111111-1111-4111-8111-111111111111" };

function analysisEvidenceResult({ ruleUsed = null, technicalSources = [] } = {}) {
  return {
    found: true,
    kind: "analysis",
    entityIds: { analysisId: SCREEN_CONTEXT.id },
    evidence: { ruleUsed, technicalSources },
  };
}

// 1. Análise com regra real (código + versão + hash) -> manifest contém a referência da regra, com o hash
// truncado a 12 caracteres (nunca o hash inteiro solto).
const withRule = analysisEvidenceResult({ ruleUsed: { cropProfileCode: "SOJA-RS", cropProfileName: "Soja RS", version: "1.2.0", contentHash: "abcdef1234567890fedcba" } });
const manifestWithRule = buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: withRule, factsUsed: [] });
assert.deepEqual(manifestWithRule.ruleRefs, ["SOJA-RS@1.2.0#abcdef123456"]);

// 2. Análise com fontes técnicas reais (com id) -> manifest registra os IDs reais, nunca inventados.
const withSources = analysisEvidenceResult({ technicalSources: [{ id: "src-aaa", title: "Manual CQFS-RS/SC 2016" }, { id: "src-bbb", title: "Boletim técnico X" }] });
const manifestWithSources = buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: withSources, factsUsed: [] });
assert.deepEqual(manifestWithSources.technicalSourceIds, ["src-aaa", "src-bbb"]);

// 3. Contexto de análise SEM regra nem fonte (ruleUsed null, technicalSources vazio) -> arrays vazios
// honestamente, nunca um rótulo genérico inventado pra preencher.
const withoutRuleOrSource = analysisEvidenceResult();
const manifestEmpty = buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: withoutRuleOrSource, factsUsed: [] });
assert.deepEqual(manifestEmpty.ruleRefs, []);
assert.deepEqual(manifestEmpty.technicalSourceIds, []);

// 4. ruleUsed EXISTE (há uma interpretação) mas veio com os campos de identificação todos nulos (não tem
// crop_profile_id associado) -> ainda assim arrays vazios, nunca um rótulo tipo "regra desconhecida".
const emptyRuleShell = analysisEvidenceResult({ ruleUsed: { cropProfileCode: null, cropProfileName: null, version: null, contentHash: null } });
assert.deepEqual(buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: emptyRuleShell, factsUsed: [] }).ruleRefs, []);

// 5. Contexto que NÃO é análise (ex.: dashboard) nunca carrega regra/fonte -- mesmo se alguém tentasse
// forçar um objeto parecido, o dispatcher só deriva pra `kind === "analysis"`.
const dashboardResult = { found: true, kind: "dashboard", entityIds: {}, evidence: { summary: {} } };
const manifestDashboard = buildEvidenceManifest({ screenContext: { type: "dashboard" }, evidenceResult: dashboardResult, factsUsed: [] });
assert.deepEqual(manifestDashboard.ruleRefs, []);
assert.deepEqual(manifestDashboard.technicalSourceIds, []);

// 6. `found: false` (entidade não encontrada/outro tenant) nunca lança erro, nunca inventa regra/fonte.
const notFoundResult = { found: false, kind: "analysis", entityIds: { analysisId: "outro" } };
const manifestNotFound = buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: notFoundResult, factsUsed: [] });
assert.deepEqual(manifestNotFound.ruleRefs, []);
assert.deepEqual(manifestNotFound.technicalSourceIds, []);
assert.equal(typeof manifestNotFound.evidenceHash, "string");
assert.equal(manifestNotFound.evidenceHash.length, 64); // sha256 hex

// 7. `extraRuleRefs` (regras calculadas na camada de resposta, ex.: patterns futuros) são mescladas e
// deduplicadas com o que foi derivado automaticamente do Evidence Package.
const manifestWithExtra = buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: withRule, factsUsed: [], extraRuleRefs: ["parameter-predominance-v1", "SOJA-RS@1.2.0#abcdef123456"] });
assert.deepEqual(manifestWithExtra.ruleRefs, ["SOJA-RS@1.2.0#abcdef123456", "parameter-predominance-v1"]);

// 8. evidenceHash é determinístico -- o MESMO evidence produz sempre o MESMO hash.
const hashA = buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: withRule, factsUsed: [] }).evidenceHash;
const hashB = buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: withRule, factsUsed: [] }).evidenceHash;
assert.equal(hashA, hashB);
assert.notEqual(hashA, manifestEmpty.evidenceHash); // evidência diferente -> hash diferente

// 9. factsSnapshot respeita o teto de 20 itens (nunca copia histórico ilimitado pra auditoria).
const manyFacts = Array.from({ length: 35 }, (_, i) => ({ label: `fato ${i}`, value: String(i) }));
const manifestManyFacts = buildEvidenceManifest({ screenContext: SCREEN_CONTEXT, evidenceResult: withoutRuleOrSource, factsUsed: manyFacts });
assert.equal(manifestManyFacts.factsSnapshot.length, 20);

console.log("assistant-evidence-manifest: 9 cenários aprovados (ruleRefs/technicalSourceIds derivados automaticamente do Evidence Package; nunca inventa regra/fonte ausente; teto de fatos respeitado)");
