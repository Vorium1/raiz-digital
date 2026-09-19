import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/homologation-readiness-evidence.yml", import.meta.url), "utf8");

const guardIndex = workflow.indexOf("id: candidate_guard");
const candidateCheckoutIndex = workflow.indexOf("- name: Checkout exato do candidato");
const firstSecretIndex = workflow.indexOf("${{ secrets.");

assert.ok(guardIndex >= 0, "workflow precisa possuir gate explícito para candidate SHA");
assert.ok(candidateCheckoutIndex > guardIndex, "gate do candidate SHA precisa ocorrer antes do checkout do código candidato");
assert.ok(firstSecretIndex > guardIndex, "nenhum secret pode ser exposto antes da autorização do candidate SHA");

assert.match(workflow, /pull-requests:\s*read/, "GITHUB_TOKEN deve ter somente leitura de pull requests");
assert.match(workflow, /candidate_sha:\s*\n\s*description:/, "workflow_dispatch deve exigir candidate_sha explícito");
assert.match(workflow, /\^\[0-9a-fA-F\]\{40\}\$/, "candidate_sha precisa ser SHA Git completo de 40 hex");
assert.match(workflow, /commits\/\$\{CANDIDATE_SHA\}\/pulls/, "gate deve resolver associação commit → PR pela API do GitHub");
assert.match(workflow, /pr\?\.state === "open"/, "PR candidato deve estar aberto");
assert.match(workflow, /\["develop", "feature\/spatial-map-architecture"\]\.includes\(pr\?\.base\?\.ref\)/, "PR candidato deve apontar para uma base explicitamente permitida");
assert.match(workflow, /pr\?\.head\?\.sha === process\.env\.CANDIDATE_SHA/, "SHA candidato deve ser exatamente o head atual do PR");
assert.match(workflow, /pr\?\.head\?\.repo\?\.full_name === process\.env\.REPOSITORY/, "PR candidato deve pertencer ao mesmo repositório; fork não é autorizado");
assert.match(workflow, /if \(matches\.length !== 1\) process\.exit\(2\)/, "gate deve rejeitar zero ou múltiplos PRs correspondentes");
assert.match(workflow, /ref: \$\{\{ steps\.candidate\.outputs\.sha \}\}/, "checkout deve usar exatamente o SHA autorizado");
assert.match(workflow, /RESOLVED_SHA="\$\(git rev-parse HEAD\)"/, "workflow deve verificar o SHA realmente resolvido após checkout");
assert.match(workflow, /if \[ "\$\{RESOLVED_SHA\}" != "\$\{EXPECTED_SHA\}" \]/, "checkout divergente precisa falhar fechado");
assert.match(workflow, /persist-credentials: false/g, "checkouts sensíveis não devem persistir credenciais Git");

assert.doesNotMatch(workflow, /pull_request_target/, "workflow de homologação não pode usar pull_request_target");
assert.doesNotMatch(workflow, /cat\s+"?\$\{?RESPONSE_FILE\}?"?/, "resposta bruta da API não deve ser impressa no log");

console.log("homologation-candidate-guard: SHA explícito, PR aberto same-repo/base permitida, ordem antes de secrets e checkout exato aprovados");

assert.match(workflow, /NDVI_SATELLITE_PROVIDER: \$\{\{ vars\.NDVI_SATELLITE_PROVIDER \}\}/, "workflow deve propagar o provider NDVI selecionado");
assert.match(workflow, /COPERNICUS_CLIENT_ID: \$\{\{ secrets\.COPERNICUS_CLIENT_ID \}\}/, "provider Copernicus explícito precisa receber credencial somente após o candidate guard");
assert.match(workflow, /COPERNICUS_CLIENT_SECRET: \$\{\{ secrets\.COPERNICUS_CLIENT_SECRET \}\}/, "provider Copernicus explícito precisa receber credencial somente após o candidate guard");
assert.ok(
  workflow.indexOf("COPERNICUS_CLIENT_ID:") > guardIndex
    && workflow.indexOf("COPERNICUS_CLIENT_SECRET:") > guardIndex,
  "credenciais opcionais do Copernicus só podem existir depois da autorização do SHA candidato",
);
