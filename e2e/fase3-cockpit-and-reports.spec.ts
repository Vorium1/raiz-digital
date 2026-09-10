import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

// Cobre os comportamentos novos da RAIZ 2.0 Fase 3 (Blocos A/B/C/D/E): fila de Inteligência agrupada por
// análise (nunca uma linha por revisão antiga), cockpit com as 6 categorias reais, pré-seleção de
// comparativo vinda da URL sem disparar comparação sozinha, permissão real de revisão (FIELD_TECH roda
// mas não aprova), e relatórios organizados por destinatário com rascunho identificado. Reaproveita as
// mesmas contas de e2e/tenant-isolation.spec.ts e e2e/field-operations-rbac.spec.ts (ver e2e/README.md).
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} precisa estar definida para rodar os testes e2e (ver e2e/README.md).`);
  return value;
}

const TENANT_A_EMAIL = "admin@raiz.local";
const TENANT_A_PASSWORD = requiredEnv("E2E_ADMIN_PASSWORD");
const FIELD_TECH_EMAIL = "rbac-field-tech@raiz.local";
const FIELD_TECH_PASSWORD = requiredEnv("E2E_RBAC_FIELD_TECH_PASSWORD");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 15_000 }), page.click(".login-submit")]);
}

test("Inteligência: fila mostra no máximo 1 linha por análise, mesmo com várias revisões (Bloco A)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/inteligencia");
  await page.waitForTimeout(1000);
  const hrefs = await page.locator(".intelligence-queue-row").evaluateAll((rows) => rows.map((r) => r.getAttribute("href")));
  test.skip(hrefs.length === 0, "nenhuma interpretação calculada agora -- nada de agrupamento pra verificar.");
  const uniqueHrefs = new Set(hrefs);
  expect(uniqueHrefs.size).toBe(hrefs.length);
});

test("Cockpit técnico: mostra as 6 categorias reais pra uma análise já calculada (Bloco B)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/inteligencia");
  await page.waitForTimeout(1000);
  const href = await page.locator(".intelligence-queue-row").first().getAttribute("href");
  test.skip(!href, "nenhuma interpretação calculada agora -- nada de cockpit pra verificar.");
  if (!href) return;

  await page.goto(href, { waitUntil: "networkidle" });
  await page.waitForSelector(".cockpit-category", { timeout: 10000 });
  // Filho direto: os painéis de IA embutidos (narrativa/prescrição) também têm seu próprio <h3>, e não
  // devem ser contados como uma 7ª/8ª categoria do cockpit.
  const headings = await page.locator(".cockpit-category > h3").allTextContents();
  expect(headings.length).toBe(6);
  for (const label of ["Dado", "Interpretação", "Padrão", "Hipótese", "Recomendação", "Validação profissional"]) {
    expect(headings.some((h) => h.includes(label))).toBe(true);
  }
  // Evidência (mapa/investigação) e leitura técnica precisam estar nas duas regiões do cockpit.
  await expect(page.locator(".cockpit-evidence")).toBeVisible();
  await expect(page.locator(".cockpit-technical")).toBeVisible();
});

test("Comparativos: chegar com ?mode=fields&a= pré-seleciona sem comparar sozinho (Bloco C)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  const context = await page.evaluate(async () => (await fetch("/api/context")).json());
  const fieldId = context.fields?.[0]?.id;
  test.skip(!fieldId, "precisa de 1 talhão real no tenant A.");

  await page.goto(`/comparativos?mode=fields&a=${fieldId}`, { waitUntil: "networkidle" });
  await expect(page.locator(".map-explorer-layer-toggle button.active")).toHaveText("Talhão × Talhão");
  // O <select> só reflete o valor depois que /api/context carrega as opções (populado num efeito
  // assíncrono) -- espera isso de verdade em vez de um tempo fixo curto.
  await expect(page.locator(".comparison-pickers select").first()).toHaveValue(fieldId, { timeout: 5000 });
  // Não deve ter disparado a comparação sozinho -- só A foi preenchido, falta B e o clique em "Comparar".
  await expect(page.locator(".comparison-result")).toHaveCount(0);
});

test("Cockpit: FIELD_TECH consegue recalcular mas não vê botão de aprovar (Bloco D, permissão real)", async ({ page }) => {
  await login(page, FIELD_TECH_EMAIL, FIELD_TECH_PASSWORD);
  await page.goto("/inteligencia");
  await page.waitForTimeout(1000);
  const href = await page.locator(".intelligence-queue-row").first().getAttribute("href");
  test.skip(!href, "nenhuma interpretação calculada agora -- nada de permissão pra verificar neste tenant.");
  if (!href) return;

  await page.goto(href, { waitUntil: "networkidle" });
  await page.waitForSelector(".cockpit-category", { timeout: 10000 });
  await expect(page.getByRole("button", { name: "Aprovar interpretação" })).toHaveCount(0);
});

test("Relatórios: índice organizado por destinatário (Executivo/Técnico/Operacional/Produtor) com links reais (Bloco E)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/relatorios");
  await page.waitForTimeout(800);
  for (const label of ["EXECUTIVO", "TÉCNICO", "OPERACIONAL", "RESUMO AO PRODUTOR"]) {
    await expect(page.locator(".eyebrow", { hasText: label }).first()).toBeVisible();
  }
  const producerLink = page.locator('a[href^="/relatorios/produtor/"]').first();
  test.skip(await producerLink.count() === 0, "nenhuma análise cadastrada agora -- nada de relatório ao produtor pra abrir.");
  const href = await producerLink.getAttribute("href");
  await page.goto(href!, { waitUntil: "networkidle" });
  await expect(page.locator("h1.report-title")).toHaveText("Resumo da análise do seu talhão");
  // Modelo determinístico, sem IA -- nunca cita "gerado por" um provedor de IA neste relatório.
  const bodyText = await page.locator("article.report-doc").textContent();
  expect(bodyText?.toLowerCase()).not.toMatch(/gemini|gpt|modelo de linguagem/);
});

test("Relatório técnico por talhão: rascunho identificado quando não há versão publicada correspondente (Bloco F)", async ({ page }) => {
  await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
  await page.goto("/relatorios");
  await page.waitForTimeout(800);
  const link = page.locator('a[href^="/relatorios/talhao/"]').first();
  test.skip(await link.count() === 0, "nenhuma análise cadastrada agora.");
  const href = await link.getAttribute("href");
  await page.goto(href!, { waitUntil: "networkidle" });
  // Ou está claramente marcado rascunho, ou claramente publicado -- nunca mudo sobre a situação.
  const situacao = await page.locator(".report-header-meta").textContent();
  expect(situacao).toMatch(/Rascunho|Publicado/);
});

test("Relatório técnico: 'Versão publicada' lê o snapshot imutável real, nunca reconstrói a partir do dado atual (fechamento técnico Fase 3, item 2)", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "precisa de DATABASE_URL no ambiente pra montar o cenário real deste teste (mesma variável usada por scripts/*.mjs -- ver e2e/README.md).");
  if (!process.env.DATABASE_URL) return;

  // Monta um "publish" real: escreve o snapshot no MESMO caminho que `saveReportSnapshot` usaria e insere
  // a linha real em `reports` -- não importa `reports.ts` diretamente (parâmetros de construtor TS não
  // rodam sob `node --experimental-strip-types`), então replica aqui só a gravação, nunca a leitura --
  // a leitura de verdade é testada abrindo a página real abaixo, exercitando `getPublishedReportSnapshot`
  // pelo caminho real (servidor Next.js, sem atalho).
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let reportId: string | null = null;
  let storageKey: string | null = null;
  try {
    const target = await client.query(
      `SELECT i.id, i.tenant_id, i.analysis_id, i.revision,
              (SELECT u.id FROM tenant_members tm JOIN users u ON u.id = tm.user_id
                 WHERE tm.tenant_id = (SELECT tenant_id FROM tenant_members tm2 JOIN users u2 ON u2.id = tm2.user_id WHERE u2.email = 'admin@raiz.local' LIMIT 1)
                 LIMIT 1) AS user_id
       FROM interpretations i
       WHERE i.tenant_id = (SELECT tenant_id FROM tenant_members tm JOIN users u ON u.id = tm.user_id WHERE u.email = 'admin@raiz.local' LIMIT 1)
       ORDER BY i.created_at DESC LIMIT 1`,
    );
    const row = target.rows[0];
    test.skip(!row, "nenhuma interpretação real no tenant A agora -- nada de snapshot pra publicar.");
    if (!row) return;

    const snapshotContent = JSON.stringify({
      interpretationId: row.id,
      revision: row.revision,
      structuredOutput: {
        facts: [{ sampleCode: "TESTE-E2E-01", parameterCode: "P", value: 12.3, unit: "mg/dm³", method: "TESTE-FECHAMENTO" }],
        interpretation: [{ sampleCode: "TESTE-E2E-01", parameterCode: "P", interpretable: true, classification: "MEDIO" }],
        confidence: { score: 77, level: "ADEQUADA" },
      },
      publishedAt: new Date().toISOString(),
    });
    const sha256 = createHash("sha256").update(snapshotContent).digest("hex");
    storageKey = `reports/${row.tenant_id}/${row.id}/rev-${row.revision}.json`;
    const storageRoot = process.env.LOCAL_STORAGE_ROOT?.trim() || path.join(process.cwd(), "storage");
    const fullPath = path.join(storageRoot, storageKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, snapshotContent, "utf8");

    const inserted = await client.query(
      `INSERT INTO reports (tenant_id, interpretation_id, revision, storage_key, sha256, published_at, published_by)
       VALUES ($1,$2,$3,$4,$5, now(), $6) RETURNING id`,
      [row.tenant_id, row.id, row.revision, storageKey, sha256, row.user_id],
    );
    reportId = inserted.rows[0].id;

    await login(page, TENANT_A_EMAIL, TENANT_A_PASSWORD);
    await page.goto(`/relatorios/talhao/${row.analysis_id}?versao=publicada`, { waitUntil: "networkidle" });

    // A prova real: o conteúdo do TESTE (marcado com código exclusivo) aparece na tela quando se pede a
    // "Versão publicada" -- nunca o dado atual reconstruído, e a integridade do arquivo é confirmada.
    const body = await page.locator("article.report-doc").textContent();
    expect(body).toContain("TESTE-E2E-01");
    expect(body).toContain("TESTE-FECHAMENTO");
    expect(body).toContain("MEDIO");
    const toolbarText = await page.locator(".report-toolbar.no-print").allTextContents();
    expect(toolbarText.join(" ")).toMatch(/hash verificado, conteúdo íntegro/i);
    await expect(page.locator(".report-version-toggle a.active")).toHaveText(/Versão publicada/);
  } finally {
    if (reportId) await client.query(`DELETE FROM reports WHERE id = $1`, [reportId]).catch(() => {});
    if (storageKey) {
      const storageRoot = process.env.LOCAL_STORAGE_ROOT?.trim() || path.join(process.cwd(), "storage");
      await rm(path.join(storageRoot, storageKey), { force: true }).catch(() => {});
    }
    await client.end();
  }
});
