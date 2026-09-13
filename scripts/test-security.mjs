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

// Contrato de sessões: trocar senha preserva somente a sessão que acabou de reautenticar.
// A ação manual de encerrar sessões nunca aceita userId/sessionId enviados pelo cliente: usa apenas a sessão autenticada.
const sessionSource = await readFile(new URL("../src/lib/auth/session.ts", import.meta.url), "utf8");
const changePasswordRoute = await readFile(new URL("../src/app/api/auth/change-password/route.ts", import.meta.url), "utf8");
const revokeOthersRoute = await readFile(new URL("../src/app/api/auth/sessions/revoke-others/route.ts", import.meta.url), "utf8");
const sessionSecuritySource = await readFile(new URL("../src/lib/auth/session-security.ts", import.meta.url), "utf8");

assert.match(sessionSource, /currentSessionId/, "Troca de senha precisa conhecer a sessão atual.");
assert.match(sessionSource, /UPDATE user_sessions[\s\S]*revoked_at = now\(\)[\s\S]*id <> \$3::uuid/, "Troca de senha deve revogar todas as outras sessões e preservar a atual.");
assert.match(changePasswordRoute, /currentSessionId:\s*session\.sessionId/, "Rota de troca de senha deve usar o id da sessão autenticada.");
assert.match(revokeOthersRoute, /revokeOwnOtherSessions\(session\.userId, session\.sessionId\)/, "Revogação manual deve ser sempre escopada ao usuário e sessão autenticados.");
assert.doesNotMatch(revokeOthersRoute, /request\.json\(/, "Rota de revogação não deve aceitar identidade de sessão enviada pelo cliente.");
assert.match(sessionSecuritySource, /WHERE s\.user_id = \$1::uuid/, "Listagem de sessões precisa ser escopada ao usuário autenticado.");
assert.doesNotMatch(sessionSecuritySource, /AS "ipHash"/, "Painel de sessões não deve expor hash de IP ao frontend.");

console.log("security: token opaco, hash, TTL, convite e gestão de sessões aprovados");
