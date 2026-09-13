import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createOpaqueSessionToken, hashSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../src/lib/auth/token.ts";

const a = createOpaqueSessionToken();
const b = createOpaqueSessionToken();
assert.notEqual(a, b, "Tokens consecutivos não podem coincidir.");
assert.ok(a.length >= 40, "Token deve carregar entropia suficiente.");
assert.equal(hashSessionToken(a).length, 64, "Hash SHA-256 deve ter 64 caracteres hex.");
assert.equal(hashSessionToken(a), hashSessionToken(a), "Hash precisa ser determinístico para lookup.");
assert.notEqual(hashSessionToken(a), a, "Banco não pode armazenar o token bruto.");
assert.equal(SESSION_COOKIE, "raiz_session");
assert.equal(SESSION_TTL_SECONDS, 43_200);

// Contrato mínimo do convite comercial: senha inicial nunca pode voltar na resposta/API nem aparecer na UX.
// Contas novas precisam entrar pelo fluxo individual de definição de senha e a interface deve distinguir
// criação do vínculo de entrega do e-mail, para um erro do provedor não virar uma falsa falha de cadastro.
const teamRoute = await readFile(new URL("../src/app/api/team/route.ts", import.meta.url), "utf8");
const settingsTabs = await readFile(new URL("../src/components/settings-tabs.tsx", import.meta.url), "utf8");
assert.match(teamRoute, /createPasswordResetToken\(/, "Convite de conta nova deve criar link individual de definição de senha.");
assert.match(teamRoute, /emailDelivery/, "API de convite deve informar separadamente o estado de entrega do e-mail.");
assert.doesNotMatch(teamRoute, /temporaryPassword\s*:/, "API de convite não pode devolver senha temporária em texto puro.");
assert.doesNotMatch(settingsTabs, /payload\.temporaryPassword/, "Frontend não pode depender de senha temporária devolvida pela API.");
assert.match(settingsTabs, /nenhuma senha temporária é exibida/i, "UX precisa declarar o fluxo sem senha temporária.");

console.log("security: token opaco, hash, TTL e convite de equipe aprovados");
