import assert from "node:assert/strict";
import { getHttpSecurityHeaders } from "../src/domain/http-security.ts";

const headers = getHttpSecurityHeaders();
const byKey = new Map(headers.map((header) => [header.key.toLowerCase(), header.value]));

assert.equal(headers.length, byKey.size, "cada header de segurança deve aparecer uma única vez");
assert.equal(byKey.get("x-content-type-options"), "nosniff");
assert.equal(byKey.get("x-frame-options"), "DENY");
assert.equal(byKey.get("referrer-policy"), "strict-origin-when-cross-origin");
assert.equal(byKey.get("x-dns-prefetch-control"), "off");
assert.equal(byKey.get("x-permitted-cross-domain-policies"), "none");
assert.match(byKey.get("strict-transport-security") ?? "", /^max-age=\d+$/);

const permissions = byKey.get("permissions-policy") ?? "";
assert.match(permissions, /camera=\(\)/, "câmera deve permanecer bloqueada por padrão");
assert.match(permissions, /microphone=\(\)/, "microfone deve permanecer bloqueado por padrão");
assert.match(permissions, /geolocation=\(self\)/, "GPS de campo deve continuar permitido apenas para a própria origem");

assert.equal(byKey.has("content-security-policy"), false, "CSP não deve ser ativada sem matriz completa de origens externas");

console.log("✓ HTTP security: headers de defesa em profundidade validados sem bloquear geolocalização de campo");
