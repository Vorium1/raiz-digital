import assert from "node:assert/strict";
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
console.log("security: token opaco, hash e TTL aprovados");
