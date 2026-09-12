import { test, expect, type Page } from "@playwright/test";

// Fechamento técnico (auditoria RAIZ_2.0/Cabeda, 2026-09-11, item 1) -- o gate de governança da rota
// /api/analyses/[id]/agronomic-prescription (interpretationStatus === "APPROVED", nunca IN_REVIEW/
// CALCULATED/ausente) já é coberto exaustivamente por `scripts/test-agronomic-prescription-gate.mjs`
// (unitário, puro, sem banco/rede -- os 4 casos de status). Este arquivo cobre só o que GENUINAMENTE
// precisa do banco/sessão real: isolamento multiempresa. Nunca chama o provider de IA de verdade (uma
// análise de outro tenant recebe 404 ANTES de qualquer checagem de interpretação/gate -- ver
// `buildAgronomicPrescriptionEvidencePackage`, tenant-escopado) -- zero risco de gastar cota real.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");
const TENANT_B_EMAIL = "e2e-tenant-b@raiz.local";
const TENANT_B_PASSWORD = requiredEnv("E2E_TENANT_B_PASSWORD");

// AN-CABEDA-01, análise real do tenant "Raiz Digital Demo" (tenant A) -- id estável, usado em
// docs/CABEDA_PIPELINE_DIAGNOSTICO_E_CORRECAO.md.
const TENANT_A_ANALYSIS_ID = "0464127a-a534-4c36-95d3-c9938bb4aef1";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

async function postPrescription(page: Page, analysisId: string) {
  return page.evaluate(async (analysisId) => {
    const res = await fetch(`/api/analyses/${analysisId}/agronomic-prescription`, { method: "POST" });
    return { status: res.status, payload: await res.json().catch(() => ({})) };
  }, analysisId);
}

test("interpretação de outro tenant nunca é aceita -- 404 antes de qualquer checagem de gate/IA", async ({ page }) => {
  await login(page, TENANT_B_EMAIL, TENANT_B_PASSWORD);
  const result = await postPrescription(page, TENANT_A_ANALYSIS_ID);
  expect(result.status).toBe(404);
  expect(result.payload.error).toMatch(/não encontrada/i);
  // Nunca o texto do gate de interpretação (provaria que passou por cima do isolamento de tenant antes
  // de checar o gate) nem qualquer menção a provider/IA.
  expect(JSON.stringify(result.payload)).not.toMatch(/aprovada por um profissional/i);
});

test("empresa A continua com acesso normal (não é uma trava geral) -- limite mensal responde normalmente", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const usage = await page.evaluate(async (analysisId) => {
    const res = await fetch(`/api/analyses/${analysisId}/agronomic-prescription`);
    return { status: res.status, payload: await res.json().catch(() => ({})) };
  }, TENANT_A_ANALYSIS_ID);
  expect(usage.status).toBe(200);
  expect(usage.payload.usage).toBeTruthy();
});
