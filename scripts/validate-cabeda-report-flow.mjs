/**
 * Valida o fluxo completo LAUDO -> INTERPRETAÇÃO -> REVISÃO -> RELATÓRIO pra AN-CABEDA-01, usando as
 * rotas HTTP reais (autenticado como admin@raiz.local, mesma conta usada nos e2e). Demonstração/validação
 * em dev, não publicação automática pra um cliente real -- é exatamente a revisão humana pedida (item 9).
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = "admin@raiz.local";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error("defina E2E_ADMIN_PASSWORD no ambiente.");
const ANALYSIS_ID = "0464127a-a534-4c36-95d3-c9938bb4aef1"; // AN-CABEDA-01

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  if (!res.ok) throw new Error(`login falhou: ${res.status} ${await res.text()}`);
  return res.headers.get("set-cookie").split(";")[0];
}

async function main() {
  const cookie = await login();
  console.log("login OK");

  const interpRes = await fetch(`${BASE_URL}/api/analyses/${ANALYSIS_ID}/interpretation`, { headers: { cookie } });
  const { latest } = await interpRes.json();
  console.log(`\ninterpretação atual: id=${latest.id} status=${latest.status} revision=${latest.revision}`);
  if (latest.status !== "IN_REVIEW") throw new Error(`status inesperado: ${latest.status} (esperava IN_REVIEW)`);

  console.log("\n-- aprovando a interpretação (revisão profissional) --");
  const reviewRes = await fetch(`${BASE_URL}/api/interpretations/${latest.id}/review`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ approve: true }) });
  const reviewBody = await reviewRes.json();
  console.log(`review -> HTTP ${reviewRes.status}:`, JSON.stringify(reviewBody));
  if (reviewRes.status !== 200) throw new Error("aprovação falhou");

  console.log("\n-- testando o gate de prescrição (deve permitir agora que há interpretação válida) --");
  const prescRes = await fetch(`${BASE_URL}/api/analyses/${ANALYSIS_ID}/agronomic-prescription`, { method: "POST", headers: { cookie } });
  console.log(`prescription POST -> HTTP ${prescRes.status}`);
  console.log(JSON.stringify(await prescRes.json(), null, 2).slice(0, 800));

  console.log("\n-- publicando o relatório --");
  const publishRes = await fetch(`${BASE_URL}/api/interpretations/${latest.id}/publish-report`, { method: "POST", headers: { cookie } });
  const publishBody = await publishRes.json();
  console.log(`publish-report -> HTTP ${publishRes.status}`);
  if (publishRes.status !== 201) { console.log(JSON.stringify(publishBody, null, 2)); throw new Error("publicação falhou"); }
  const report = publishBody.report;
  console.log(`  report id=${report.id} hash=${report.contentHash ?? report.hash ?? "(campo não encontrado, ver payload completo)"}`);
  console.log(JSON.stringify(report, null, 2).slice(0, 1500));

  console.log("\n-- confirmando que o relatório do talhão mostra os dados reais do Cabeda --");
  const reportPageRes = await fetch(`${BASE_URL}/relatorios/talhao/${ANALYSIS_ID}`, { headers: { cookie } });
  const html = await reportPageRes.text();
  const hasCabeda = html.includes("Rafael Cabeda") || html.includes("Cabeda");
  const hasArea01 = html.includes("Área 01") || html.includes("AN-CABEDA-01");
  console.log(`  HTTP ${reportPageRes.status} -- menciona "Cabeda": ${hasCabeda} -- menciona "Área 01"/"AN-CABEDA-01": ${hasArea01}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
