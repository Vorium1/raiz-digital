import type { AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";
import type { OperationalAssistantProvider, OperationalAssistantRequest, OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";
import { buildEvidenceCatalog } from "@/lib/ai/assistant-evidence-catalog";
import { checkFreeText, checkResponseGrounding } from "@/lib/ai/assistant-grounding-gate";
import { createGroundedProvider } from "@/lib/ai/grounded-operational-assistant-provider";
import { localIntentAssistantProvider } from "@/lib/ai/providers/local-intent-assistant-provider";
import { syntheticFieldEvidence, FIELD_ID } from "@/lib/ai/benchmark/fixtures";

/**
 * Fase 4F, item 6 — suíte adversarial do grounding gate, chamada por `/api/dev/assistant-benchmark`
 * (`provider: "grounding-gate-selftest"`) e por `e2e/assistant-fase4f.spec.ts`. Prova, com execução real
 * (não só leitura de código), que `checkFreeText`/`checkResponseGrounding` pegam cada categoria de
 * violação pedida, que um texto bem-fundamentado NUNCA é rejeitado por engano (falso positivo), e que
 * `createGroundedProvider` de fato troca pelo fallback quando o candidato viola o gate -- nunca tenta
 * "consertar" a saída.
 */

const fieldEvidence: AssistantEvidenceResult = { found: true, kind: "field", evidence: syntheticFieldEvidence, entityIds: { fieldId: FIELD_ID } };
const catalog = buildEvidenceCatalog(fieldEvidence);

type CheckCase = { name: string; text: string; expectRule: string | null };

const CASES: CheckCase[] = [
  { name: "texto bem fundamentado -- nenhuma violação (sanity check contra falso positivo)", text: `O talhão ${syntheticFieldEvidence.field.name} tem ${syntheticFieldEvidence.field.areaHa} ha.`, expectRule: null },
  { name: "uuid não presente na evidência", text: `Veja também o talhão 99999999-9999-4999-8999-999999999999.`, expectRule: "unknown_uuid" },
  { name: "número não presente na evidência", text: `A confiabilidade deste talhão é de 973 pontos.`, expectRule: "unverified_numeric_claim" },
  { name: "entidade não presente na evidência", text: `Compare com a Fazenda Horizonte Distante.`, expectRule: "unknown_entity_name" },
  { name: "coincidência espacial não suportada", text: `A área de baixo vigor coincide espacialmente com os pontos de fósforo baixo.`, expectRule: "spatial_coincidence_claim" },
  { name: "causalidade apresentada como fato", text: `O NDVI baixo causou a queda de produtividade.`, expectRule: "causality_claim" },
  { name: "URL solta em texto", text: `Veja mais detalhes em https://exemplo.com/relatorio.`, expectRule: "url_in_text" },
  { name: "recomendação/prescrição fora de escopo", text: `Recomendo aplicar 40 kg/ha de fósforo neste talhão.`, expectRule: "prescription_out_of_scope" },
];

function baseResponse(overrides: Partial<OperationalAssistantResponse> = {}): OperationalAssistantResponse {
  return {
    summary: "Resumo padrão.",
    facts: [], attention_points: [], patterns: [], hypotheses: [], missing_information: [], technical_references: [], suggested_actions: [],
    requires_professional_review: false, cards: [],
    suggestedQuestions: [], provider: "selftest", model: "selftest", isRealLanguageModel: true, generatedAt: new Date().toISOString(), handling: "handled",
    ...overrides,
  };
}

export async function runGroundingGateSelfTest(): Promise<{ allPassed: boolean; results: Array<{ name: string; pass: boolean; detail: string }> }> {
  const results: Array<{ name: string; pass: boolean; detail: string }> = [];

  for (const c of CASES) {
    const violations = checkFreeText(c.text, catalog, "summary");
    const pass = c.expectRule === null ? violations.length === 0 : violations.some((v) => v.rule === c.expectRule);
    results.push({ name: c.name, pass, detail: pass ? "ok" : `esperado ${c.expectRule ?? "nenhuma violação"}, obtido: ${JSON.stringify(violations)}` });
  }

  // checkResponseGrounding cobre summary + missing_information + hipóteses juntos.
  {
    const response = baseResponse({ summary: "Resumo normal.", missing_information: ["Veja https://exemplo.com/x"] });
    const violations = checkResponseGrounding(response, catalog);
    results.push({ name: "checkResponseGrounding também varre missing_information", pass: violations.some((v) => v.rule === "url_in_text"), detail: JSON.stringify(violations) });
  }
  {
    const response = baseResponse({ hypotheses: [{ statement: "O NDVI baixo causou a queda de produtividade.", supportingEvidence: ["x"], missingToConfirm: ["y"] }] });
    const violations = checkResponseGrounding(response, catalog);
    results.push({ name: "checkResponseGrounding também varre hypotheses[].statement", pass: violations.some((v) => v.rule === "causality_claim"), detail: JSON.stringify(violations) });
  }

  // createGroundedProvider -- fallback real, ponta a ponta.
  const request: OperationalAssistantRequest = { question: "O que mudou nesta safra?", tenantId: "00000000-0000-4000-8000-000000000000", userId: "00000000-0000-4000-8000-0000000000ff", role: "AGRONOMIST", screenContext: { type: "field", id: FIELD_ID }, evidence: fieldEvidence };

  const badCandidate: OperationalAssistantProvider = {
    name: "fake-bad", model: "fake-bad", isRealLanguageModel: true,
    async ask() { return baseResponse({ summary: "Recomendo aplicar 40 kg/ha de fósforo -- veja https://exemplo.com/x." }); },
  };
  const localFallbackResponse = await localIntentAssistantProvider.ask(request);
  const groundedWithBadCandidate = await createGroundedProvider(badCandidate, localIntentAssistantProvider).ask(request);
  results.push({
    name: "createGroundedProvider descarta candidato reprovado e usa o fallback (local) -- resposta final bate com o fallback puro, nunca um remendo do texto do candidato",
    pass: groundedWithBadCandidate.summary === localFallbackResponse.summary && groundedWithBadCandidate.provider === localFallbackResponse.provider,
    detail: JSON.stringify({ got: groundedWithBadCandidate.summary, expected: localFallbackResponse.summary }),
  });

  const goodCandidate: OperationalAssistantProvider = {
    name: "fake-good", model: "fake-good", isRealLanguageModel: true,
    async ask() { return baseResponse({ summary: `O talhão ${syntheticFieldEvidence.field.name} tem ${syntheticFieldEvidence.field.areaHa} ha.`, provider: "fake-good" }); },
  };
  const groundedWithGoodCandidate = await createGroundedProvider(goodCandidate, localIntentAssistantProvider).ask(request);
  results.push({
    name: "createGroundedProvider mantém a resposta do candidato quando ela passa no gate (nunca troca por engano)",
    pass: groundedWithGoodCandidate.provider === "fake-good",
    detail: JSON.stringify({ got: groundedWithGoodCandidate.provider }),
  });

  const throwingCandidate: OperationalAssistantProvider = {
    name: "fake-throwing", model: "fake-throwing", isRealLanguageModel: true,
    async ask() { throw new Error("erro de rede simulado"); },
  };
  const groundedWithThrowingCandidate = await createGroundedProvider(throwingCandidate, localIntentAssistantProvider).ask(request);
  results.push({
    name: "createGroundedProvider cai pro fallback quando o candidato lança erro (nunca propaga o erro pro client)",
    pass: groundedWithThrowingCandidate.summary === localFallbackResponse.summary,
    detail: JSON.stringify({ got: groundedWithThrowingCandidate.summary }),
  });

  return { allPassed: results.every((r) => r.pass), results };
}
