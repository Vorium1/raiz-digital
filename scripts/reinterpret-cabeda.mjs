/**
 * Reexecuta AN-CABEDA-01/02/03 (e a análise mais recente do Talhão 3/Bela Vista, pra confirmar a
 * vinculação de crop_profile) chamando a rota HTTP REAL da aplicação (/api/analyses/[id]/interpret),
 * autenticado como admin@raiz.local -- prova o pipeline de verdade, não uma reimplementação da lógica
 * num script à parte. Exige `npm run dev` já rodando em http://localhost:3000.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = "admin@raiz.local";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error("defina E2E_ADMIN_PASSWORD no ambiente.");

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login falhou: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("login não devolveu cookie de sessão.");
  return setCookie.split(";")[0];
}

async function interpret(cookie, analysisId, label) {
  const res = await fetch(`${BASE_URL}/api/analyses/${analysisId}/interpret`, {
    method: "POST",
    headers: { cookie },
  });
  const body = await res.json();
  console.log(`\n${label} (${analysisId}) -> HTTP ${res.status}`);
  if (res.status !== 201) { console.log(JSON.stringify(body, null, 2)); return; }
  const { interpretation, engineResult } = body;
  console.log(`  interpretation.status: ${interpretation.status}  (revision ${interpretation.revision})`);
  console.log(`  not_interpretable_reason: ${interpretation.notInterpretableReason ?? interpretation.not_interpretable_reason ?? "(nenhum)"}`);
  const total = engineResult.interpretation.length;
  const ok = engineResult.interpretation.filter((i) => i.interpretable).length;
  console.log(`  resultados: ${ok}/${total} interpretados`);
  console.log(`  confidence: score=${engineResult.confidence.score} level=${engineResult.confidence.level}`);
  console.log(`  pendências restantes (${engineResult.pendencies.length}):`);
  for (const p of engineResult.pendencies) console.log(`    - ${p}`);
}

async function main() {
  const cookie = await login();
  console.log("login OK");

  const analyses = [
    ["0464127a-a534-4c36-95d3-c9938bb4aef1", "AN-CABEDA-01"],
    ["64370bf7-95ac-4ca8-a3ea-d42dd935fa17", "AN-CABEDA-02"],
    ["6cfa63b6-230b-45a2-bd10-1df2b20d1178", "AN-CABEDA-03"],
  ];
  for (const [id, label] of analyses) await interpret(cookie, id, label);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
