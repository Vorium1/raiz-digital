import { test, expect, type Page } from "@playwright/test";

// Valida a restrição adicionada em 0f4b0b0 ("security: restringe edicao da base tecnica
// compartilhada a curadores"): crop_profiles/crop_profile_parameters/technical_sources/
// technical_regions não têm tenant_id -- são uma base científica única, compartilhada por todas as
// empresas clientes. Só quem tem `users.is_platform_curator = true` pode escrever nela; qualquer
// outro papel, mesmo AGRONOMIST/TENANT_ADMIN de uma empresa, só pode ler. Reaproveita duas contas
// fixas já existentes (nenhuma conta nova criada): `admin@raiz.local` (curador nesta base de dev) e
// `rbac-agronomist@raiz.local` (não-curador). Ver e2e/README.md.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const CURATOR_EMAIL = "admin@raiz.local";
const CURATOR_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");

const NON_CURATOR_EMAIL = "rbac-agronomist@raiz.local";
const NON_CURATOR_PASSWORD = requiredEnv("E2E_RBAC_AGRONOMIST_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

async function api(page: Page, url: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method: method ?? "GET",
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, payload: await res.json().catch(() => ({})) };
    },
    { url, method: init?.method, body: init?.body },
  );
}

test("nao-curador consegue ler a base tecnica mas e bloqueado (403) em toda escrita", async ({ page }) => {
  await login(page, NON_CURATOR_EMAIL, NON_CURATOR_PASSWORD);

  const list = await api(page, "/api/crop-profiles");
  expect(list.status).toBe(200);
  expect(Array.isArray(list.payload.cropProfiles)).toBe(true);
  const existingProfile = list.payload.cropProfiles[0];
  expect(existingProfile).toBeTruthy();

  const createProfile = await api(page, "/api/crop-profiles", { method: "POST", body: { code: "E2E-NAO-DEVE-EXISTIR", name: "Não deve ser criada" } });
  expect(createProfile.status).toBe(403);

  const toggleStatus = await api(page, `/api/crop-profiles/${existingProfile.id}/status`, { method: "PATCH", body: { status: "ACTIVE" } });
  expect(toggleStatus.status).toBe(403);

  const createSource = await api(page, "/api/technical-sources", { method: "POST", body: { title: "Fonte que não deve existir" } });
  expect(createSource.status).toBe(403);

  const createRegion = await api(page, "/api/technical-regions", { method: "POST", body: { code: "E2E-NAO-DEVE-EXISTIR", name: "Região que não deve existir" } });
  expect(createRegion.status).toBe(403);

  // Mesma trava aplicada à pesquisa periódica (construída dois dias depois da restrição original) --
  // nunca deve gastar nenhum request de IA para quem não é curador.
  const runResearch = await api(page, "/api/knowledge-research", { method: "POST", body: {} });
  expect(runResearch.status).toBe(403);
});

test("curador consegue homologar um perfil de cultura existente (estado restaurado ao final)", async ({ page }) => {
  await login(page, CURATOR_EMAIL, CURATOR_PASSWORD);

  const list = await api(page, "/api/crop-profiles");
  expect(list.status).toBe(200);
  const target = list.payload.cropProfiles.find((profile: { status: string }) => profile.status === "DRAFT");
  expect(target, "precisa existir ao menos um perfil de cultura em DRAFT no banco de dev para este teste").toBeTruthy();

  try {
    const activate = await api(page, `/api/crop-profiles/${target.id}/status`, { method: "PATCH", body: { status: "ACTIVE" } });
    expect(activate.status).toBe(200);
    expect(activate.payload.cropProfile.status).toBe("ACTIVE");
  } finally {
    // sempre devolve pro estado em que encontrou, mesmo se a asserção acima falhar.
    const revert = await api(page, `/api/crop-profiles/${target.id}/status`, { method: "PATCH", body: { status: "DRAFT" } });
    expect(revert.status).toBe(200);
    expect(revert.payload.cropProfile.status).toBe("DRAFT");
  }

  // Curador passa da checagem de autorização da pesquisa periódica -- só testado quando NENHUMA chave
  // de IA está configurada no ambiente que roda o teste, porque só aí a chamada é garantidamente
  // gratuita (cai no caminho "nenhum provedor disponível", nunca chega a gastar). Com alguma chave
  // configurada, chamar essa rota de verdade dispararia uma pesquisa paga -- por segurança financeira,
  // o teste pula essa parte nesse caso em vez de arriscar gasto real num teste automatizado.
  const anyProviderConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
  if (!anyProviderConfigured) {
    const runResearch = await api(page, "/api/knowledge-research", { method: "POST", body: {} });
    expect(runResearch.status).not.toBe(403);
  }
});
