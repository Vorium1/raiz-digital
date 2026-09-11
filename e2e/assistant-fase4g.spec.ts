import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Fase 4G — Provider Routing + Controle de Custo + Fechamento do Assistente. Todos os testes usam um
// provider generativo FAKE (`/api/dev/assistant-router-test`, dev-only) -- NUNCA o Gemini real. Chamadas
// reais só acontecem no benchmark explicitamente autorizado (`/api/dev/assistant-benchmark`), como já
// estabelecido nas Fases 4E/4F.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

async function callRouter(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async (body) => {
    const res = await fetch("/api/dev/assistant-router-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }, body);
}

const UNSUPPORTED_QUESTION = "me conte uma piada sobre agronomia";
const SUPPORTED_QUESTION = "quais são as principais pendências da minha operação";

test("Item 1/15: modo local funciona sozinho, sem nenhum provider generativo injetado (ausência total de provider externo não impede o uso)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "local", question: SUPPORTED_QUESTION, fakeGenerativeBehavior: "none" });
  expect(result.status).toBe(200);
  expect(result.body.response.provider).toBe("raiz-local-intent");
  expect(result.body.routing).toEqual({ mode: "local", localHandling: "handled", escalatedToGenerative: false, generativeOutcome: "not_attempted" });
});

test("Item 2: modo local NUNCA chama o provider generativo, mesmo numa pergunta unsupported", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "local", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "success" });
  expect(result.status).toBe(200);
  expect(result.body.routing.mode).toBe("local");
  expect(result.body.routing.escalatedToGenerative).toBe(false);
  expect(result.body.response.provider).toBe("raiz-local-intent");
});

test("Item 3: pergunta SUPORTADA pelo local nunca escalona pro generativo, mesmo em modo híbrido", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "hybrid", question: SUPPORTED_QUESTION, fakeGenerativeBehavior: "success" });
  expect(result.status).toBe(200);
  expect(result.body.routing.localHandling).toBe("handled");
  expect(result.body.routing.escalatedToGenerative).toBe(false);
  expect(result.body.response.provider).toBe("raiz-local-intent");
});

test("Item 4: pergunta UNSUPPORTED pode chamar o generativo em modo híbrido, e a resposta aprovada pelo Grounding Gate é usada", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "hybrid", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "success" });
  expect(result.status).toBe(200);
  expect(result.body.routing.localHandling).toBe("unsupported");
  expect(result.body.routing.escalatedToGenerative).toBe(true);
  expect(result.body.routing.generativeOutcome).toBe("approved");
  expect(result.body.response.provider).toBe("fake-generative");
});

test("Item 5: insufficient_evidence NUNCA escalona pro generativo (o dado não existe -- um generativo também não pode inventá-lo)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  // `evidence: {kind:"invalid"}` é exatamente o que `route.ts` monta quando `parseAssistantScreenContext`
  // rejeita o contexto enviado (id malformado, tipo desconhecido) -- `isInvalidContext` devolve
  // `INVALID_CONTEXT_RESPONSE`, já tagueado `handling: "insufficient_evidence"`.
  const result = await callRouter(page, {
    mode: "hybrid",
    question: "o que mudou nesta safra?",
    fakeGenerativeBehavior: "success",
    evidence: { found: false, kind: "invalid", entityIds: {} },
  });
  expect(result.status).toBe(200);
  expect(result.body.routing.localHandling).toBe("insufficient_evidence");
  expect(result.body.routing.escalatedToGenerative).toBe(false);
  expect(result.body.response.provider).toBe("raiz-local-intent");
});

test("Item 13 (via item 5): cross-tenant continua bloqueado -- entidade de outro tenant/inexistente nunca vira 'unsupported' escalonável", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, {
    mode: "hybrid",
    question: "me fale sobre este talhão",
    fakeGenerativeBehavior: "success",
    screenContext: { type: "field", id: "11111111-1111-4111-8111-111111111111" },
    evidence: { found: false, kind: "field", entityIds: { fieldId: "11111111-1111-4111-8111-111111111111" } },
  });
  expect(result.status).toBe(200);
  // found:false pro provider local vira uma resposta honesta ("não identifiquei"), nunca "unsupported" --
  // nunca escalona, nunca dá ao generativo a chance de "ajudar" inventando uma entidade que não existe.
  expect(result.body.routing.escalatedToGenerative).toBe(false);
});

test("Item 6/7: 429 do provider generativo -> fallback local seguro, sem erro técnico exposto", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "hybrid", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "error_429" });
  expect(result.status).toBe(200);
  expect(result.body.routing.generativeOutcome).toBe("provider_error");
  expect(result.body.response.provider).toBe("raiz-local-intent");
  // A resposta final pro "client" nunca contém o texto cru do erro (isso fica só em `routing.fallbackReason`,
  // que é telemetria de auditoria -- item 8 exige que o client nunca veja "429"/"Google"/etc.).
  expect(JSON.stringify(result.body.response)).not.toContain("429");
});

test("Item 6/7: 503 do provider generativo -> fallback local seguro", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "hybrid", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "error_503" });
  expect(result.status).toBe(200);
  expect(result.body.routing.generativeOutcome).toBe("provider_error");
  expect(result.body.response.provider).toBe("raiz-local-intent");
});

test("Item 8: timeout do provider generativo -> fallback local, nunca trava a resposta", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const started = Date.now();
  const result = await callRouter(page, { mode: "hybrid", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "timeout" });
  const elapsedMs = Date.now() - started;
  expect(result.status).toBe(200);
  expect(result.body.routing.generativeOutcome).toBe("timeout");
  expect(result.body.response.provider).toBe("raiz-local-intent");
  expect(elapsedMs).toBeLessThan(5000); // a rota de teste usa timeoutMs:500 -- nunca fica pendurada
});

test("Item 9: JSON inválido do provider generativo -> fallback local", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "hybrid", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "invalid_json" });
  expect(result.status).toBe(200);
  expect(result.body.routing.generativeOutcome).toBe("provider_error");
  expect(result.body.response.provider).toBe("raiz-local-intent");
});

test("Item 10: Grounding Gate reprovado -> fallback local, resposta ungrounded nunca chega ao client", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "hybrid", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "grounding_fail" });
  expect(result.status).toBe(200);
  expect(result.body.routing.generativeOutcome).toBe("rejected_by_gate");
  expect(result.body.response.provider).toBe("raiz-local-intent");
  expect(result.body.response.summary).not.toContain("99999999-9999-4999-8999-999999999999");
});

test("Item 12: provider generativo não consegue fazer card/href malicioso sobreviver na resposta", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callRouter(page, { mode: "hybrid", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "malicious_href" });
  expect(result.status).toBe(200);
  expect(result.body.routing.generativeOutcome).toBe("approved"); // a resposta em si passa no gate (summary ok)
  expect(result.body.response.cards).toEqual([]); // mas cards SEMPRE zerado pra isRealLanguageModel:true
  // `suggested_actions` continua cru (`AssistantAction`, sem campo `href` no tipo) -- a resolução real
  // (posse/tenant/role -> href) só acontece em `/api/assistant` (route.ts, `validateAssistantActions`),
  // já coberta exaustivamente por `e2e/assistant-actions.spec.ts` (Bloco 4) -- não duplicado aqui.
  for (const action of result.body.response.suggested_actions) expect(action).not.toHaveProperty("href");
});

test("Item 11: limite diário de chamadas generativas por usuário atingido -> local continua funcionando, nada quebra", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra este teste.");
  if (!process.env.DATABASE_URL) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const insertedIds: string[] = [];
  try {
    const userRow = await client.query(`SELECT id::text AS id, (SELECT tenant_id::text FROM tenant_members WHERE user_id = users.id LIMIT 1) AS "tenantId" FROM users WHERE email = $1`, [TENANT_A_EMAIL]);
    const { id: userId, tenantId } = userRow.rows[0] ?? {};
    test.skip(!userId || !tenantId, "precisa localizar o usuário/tenant reais de admin@raiz.local.");
    if (!userId || !tenantId) return;

    // Limite padrão (sem override de env nesta instância): 20 chamadas generativas/dia por usuário --
    // insere 21 linhas reais em `ai_generations` (provider != local) pra estourar o limite de propósito.
    for (let i = 0; i < 21; i++) {
      const inserted = await client.query(
        `INSERT INTO ai_generations (tenant_id, kind, provider, model, prompt_version, request_payload, response_payload, status, created_by)
         VALUES ($1::uuid, 'OPERATIONAL_ASSISTANT', 'fake-generative', 'fake-model', 'test', '{}'::jsonb, '{}'::jsonb, 'APPROVED'::ai_review_status, $2::uuid)
         RETURNING id::text`,
        [tenantId, userId],
      );
      insertedIds.push(inserted.rows[0].id);
    }

    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    const result = await callRouter(page, { mode: "hybrid", question: UNSUPPORTED_QUESTION, fakeGenerativeBehavior: "success" });
    expect(result.status).toBe(200);
    expect(result.body.routing.generativeOutcome).toBe("rate_limited");
    expect(result.body.routing.escalatedToGenerative).toBe(false);
    // Local continua respondendo normalmente -- nada quebra, nenhuma mensagem assustadora sobre cota.
    expect(result.body.response.provider).toBe("raiz-local-intent");
    expect(JSON.stringify(result.body.response).toLowerCase()).not.toContain("quota");
    expect(JSON.stringify(result.body.response).toLowerCase()).not.toContain("429");
  } finally {
    for (const id of insertedIds) await client.query(`DELETE FROM ai_generations WHERE id = $1::uuid`, [id]);
    await client.end();
  }
});

test("Item 14: benchmark local continua 49/49 (Benchmark V2 + adversariais, Fase 4F) depois de todas as mudanças da Fase 4G", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/dev/assistant-benchmark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "local" }) });
    return res.json();
  });
  expect(result.scorecard.passedScenarios).toBe(result.scorecard.scenarioCount);
  expect(result.scorecard.scenarioCount).toBeGreaterThanOrEqual(49);
});
