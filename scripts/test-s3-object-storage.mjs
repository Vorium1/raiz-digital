import assert from "node:assert/strict";
import { buildSignedS3Request, getS3Object, putS3Object } from "../src/lib/s3-object-storage.ts";

const config = {
  endpoint: "https://conta.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "raiz-private",
  accessKey: "access-key-test",
  secretKey: "secret-key-test",
};

const body = Buffer.from("arquivo-original", "utf8");
const signed = buildSignedS3Request({
  method: "PUT",
  key: "imports/tenant/sources/abc-Área 01.pdf",
  body,
  contentType: "application/octet-stream",
  config,
  now: new Date("2026-09-13T12:34:56.000Z"),
});
assert.equal(signed.url, "https://conta.r2.cloudflarestorage.com/raiz-private/imports/tenant/sources/abc-%C3%81rea%2001.pdf");
assert.equal(signed.headers["x-amz-date"], "20260913T123456Z");
assert.match(signed.headers["x-amz-content-sha256"], /^[a-f0-9]{64}$/);
assert.match(signed.headers.authorization, /Credential=access-key-test\/20260913\/auto\/s3\/aws4_request/);
assert.match(signed.headers.authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
assert.match(signed.headers.authorization, /Signature=[a-f0-9]{64}$/);

let putCalled = false;
await putS3Object({
  key: "imports/tenant/sources/hash-laudo.pdf",
  body,
  config,
  fetchImpl: async (url, init) => {
    putCalled = true;
    assert.equal(url, "https://conta.r2.cloudflarestorage.com/raiz-private/imports/tenant/sources/hash-laudo.pdf");
    assert.equal(init?.method, "PUT");
    assert.ok(init?.headers.authorization);
    assert.deepEqual(Buffer.from(init?.body), body);
    return new Response(null, { status: 200 });
  },
});
assert.equal(putCalled, true);

const restored = await getS3Object({
  key: "imports/tenant/sources/hash-laudo.pdf",
  config,
  fetchImpl: async (_url, init) => {
    assert.equal(init?.method, "GET");
    assert.ok(init?.headers.authorization);
    return new Response(body, { status: 200 });
  },
});
assert.deepEqual(restored, body);

await assert.rejects(
  () => putS3Object({
    key: "imports/tenant/sources/falha.pdf",
    body,
    config,
    fetchImpl: async () => new Response("provider down", { status: 503 }),
  }),
  /HTTP 503/,
);

console.log("s3-object-storage: assinatura SigV4, PUT/GET e falha fechada aprovados");
