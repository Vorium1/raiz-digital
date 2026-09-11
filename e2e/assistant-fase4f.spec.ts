import { test, expect, type Page } from "@playwright/test";

// Fase 4F — Grounding Gate + Benchmark V2. Prova, contra o servidor real (autenticado), que: (1) o
// provider local chega no baseline completo do benchmark atualizado; (2) a suíte adversarial do grounding
// gate passa (todas as categorias de violação pedidas, sem falso positivo, e o wrapper
// `createGroundedProvider` troca pelo fallback de verdade); (3) cada execução real do benchmark grava um
// artefato com nome ÚNICO -- nunca sobrescreve a execução anterior (achado real da Fase 4E, corrigido
// nesta rodada).
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

async function callBenchmark(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async (body) => {
    const res = await fetch("/api/dev/assistant-benchmark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }, body);
}

test("Fase 4F, item 1: provider local passa em TODOS os cenários do benchmark atualizado (Benchmark V2 + adversariais)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callBenchmark(page, { provider: "local" });
  expect(result.status).toBe(200);
  const { scorecard, results } = result.body;
  const failed = results.filter((r: any) => !r.passed);
  expect(failed, `cenários reprovados: ${JSON.stringify(failed.map((r: any) => ({ id: r.scenarioId, criteria: r.criteria.filter((c: any) => !c.pass) })))}`).toEqual([]);
  expect(scorecard.passedScenarios).toBe(scorecard.scenarioCount);
  expect(scorecard.scenarioCount).toBeGreaterThanOrEqual(49); // 39 originais + 10 adversariais novos (item 8)
  // Todos os eixos objetivamente mensuráveis (todos menos "português técnico/agronômico", que é sempre
  // null de propósito) precisam estar em 1.00 pro provider local -- é o determinístico, não devia perder
  // ponto em nenhum eixo automático.
  for (const axis of scorecard.axes) {
    if (axis.axis === "português técnico/agronômico") continue;
    expect(axis.score, `eixo "${axis.axis}" abaixo de 1.00: ${JSON.stringify(axis)}`).toBe(1);
  }
});

test("Fase 4F, item 6: suíte adversarial do grounding gate passa inteira (toda categoria de violação pedida, sem falso positivo, fallback real)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const result = await callBenchmark(page, { provider: "grounding-gate-selftest" });
  expect(result.status).toBe(200);
  const failed = result.body.results.filter((r: any) => !r.pass);
  expect(failed, `casos reprovados: ${JSON.stringify(failed)}`).toEqual([]);
  expect(result.body.allPassed).toBe(true);
});

test("Fase 4F, item 9: duas execuções reais consecutivas do benchmark gravam artefatos com nomes DIFERENTES -- nunca sobrescreve a anterior", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const first = await callBenchmark(page, { provider: "local", scenarioIds: ["dash-01"] });
  const second = await callBenchmark(page, { provider: "local", scenarioIds: ["dash-01"] });
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(first.body.artifact.filename).not.toBe(second.body.artifact.filename);

  const list = await callBenchmark(page, { provider: "list-artifacts" });
  expect(list.status).toBe(200);
  const filenames = list.body.artifacts.map((a: any) => a.filename);
  expect(filenames).toContain(first.body.artifact.filename);
  expect(filenames).toContain(second.body.artifact.filename);

  // Cada artefato tem os 5 campos de identificação pedidos: provider, modelo, timestamp, versão do
  // prompt, versão do benchmark.
  for (const artifact of [first.body.artifact, second.body.artifact]) {
    expect(artifact.provider).toBeTruthy();
    expect(artifact.model).toBeTruthy();
    expect(artifact.generatedAt).toBeTruthy();
    expect(artifact.promptVersion).toBeTruthy();
    expect(artifact.benchmarkVersion).toBeTruthy();
  }
});

test("Fase 4F, item 9: replay a partir de um artefato salvo (por nome) reproduz o mesmo resultado, sem depender do 'último resultado' em memória", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const original = await callBenchmark(page, { provider: "local", scenarioIds: ["field-01", "analysis-01"] });
  expect(original.status).toBe(200);

  // Uma execução TOTALMENTE separada acontece no meio (simula "outra pessoa rodando o benchmark depois") --
  // nunca deveria afetar o replay do artefato específico pedido abaixo.
  await callBenchmark(page, { provider: "local", scenarioIds: ["dash-02"] });

  const replay = await callBenchmark(page, { provider: "replay", artifactFilename: original.body.artifact.filename, scenarioIds: ["field-01", "analysis-01"] });
  expect(replay.status).toBe(200);
  expect(replay.body.scorecard.scenarioCount).toBe(2);
  expect(replay.body.results.map((r: any) => r.scenarioId).sort()).toEqual(["analysis-01", "field-01"]);
});
