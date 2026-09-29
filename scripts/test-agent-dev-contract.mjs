import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const agents = read("AGENTS.md");
const runbook = read("docs/agent-dev/RUNBOOK.md");
const backlog = read("docs/agent-dev/BACKLOG.md");
const handoff = read("docs/agent-dev/HANDOFF.md");
const ci = read(".github/workflows/ci.yml");

const requiredAgentContracts = [
  /continuar avançando/i,
  /#113/,
  /issue ativo/i,
  /branch ativa/i,
  /HEAD real/i,
  /merge de PR/i,
  /deploy\/publicação em produção/i,
  /escrita agronômica em produção/i,
  /nunca inventar dose/i,
  /nunca mover ponto GPS/i,
  /snapshot publicado é imutável/i,
  /fail-closed/i,
  /RLS/i,
  /cache privado/i,
  /INSUFFICIENT_EVIDENCE/,
  /REQUIRES_AGRONOMIST_REVIEW/,
  /no máximo 2 consultas consecutivas/i,
  /Próximo passo exato/i,
];

for (const contract of requiredAgentContracts) {
  assert.match(agents, contract, `AGENTS.md perdeu contrato obrigatório: ${contract}`);
}

assert.match(runbook, /falha determinística/i);
assert.match(runbook, /não seguir empilhando feature/i);
assert.match(runbook, /não declarar que continuará “em segundo plano”/i);

assert.match(backlog, /P0 — integridade e gates/i);
assert.match(backlog, /BLOCKED_EXTERNAL/);
assert.match(backlog, /#113/);
assert.match(backlog, /#125/);

assert.match(handoff, /seguindo o AGENTS\.md da raiz/i);
assert.match(handoff, /Não faça merge, deploy\/publicação de produção/i);
assert.match(handoff, /contexto foi verificado no GitHub/i);

assert.match(
  ci,
  /node --experimental-strip-types scripts\/test-agent-dev-contract\.mjs/,
  "CI precisa executar o gate do Agent Dev",
);

console.log("agent-dev-contract: autonomia, segurança, testes, backlog e handoff protegidos");
