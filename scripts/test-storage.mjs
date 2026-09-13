import assert from "node:assert/strict";
import { readRawStoredFile, saveRawImportFile, saveReportSnapshot } from "../src/lib/storage.ts";

const envKeys = [
  "STORAGE_PROVIDER",
  "REPORT_STORAGE_PROVIDER",
  "VERCEL",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const previousFetch = globalThis.fetch;

try {
  delete process.env.VERCEL;
  process.env.STORAGE_PROVIDER = "inline";
  delete process.env.REPORT_STORAGE_PROVIDER;

  const content = JSON.stringify({ reportSnapshotVersion: 2, field: "Área 01", facts: [{ p: 11, k: 229.9 }] });
  const stored = await saveReportSnapshot({ tenantId: "tenant", interpretationId: "interpretation", revision: 3, content });
  assert.ok(stored.key.startsWith("inline:v1:"));
  assert.equal(stored.bytes, Buffer.byteLength(content));
  const readBack = await readRawStoredFile(stored.key);
  assert.equal(readBack.toString("utf8"), content);

  const rawInline = await saveRawImportFile({ tenantId: "tenant", analysisId: "analysis", fileName: "laudo.csv", content: "x", encoding: "utf8" });
  assert.equal(rawInline, null, "arquivos brutos não devem usar inline");

  process.env.STORAGE_PROVIDER = "s3";
  process.env.REPORT_STORAGE_PROVIDER = "s3";
  process.env.S3_ENDPOINT = "https://objects.raizdigital.invalid";
  process.env.S3_BUCKET = "raiz-prod";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY = "access-key-test";
  process.env.S3_SECRET_KEY = "secret-key-test";

  const objects = new Map();
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    requests.push({ method, url: parsed.toString(), headers });
    if (method === "PUT") {
      const bytes = Buffer.from(init.body);
      objects.set(parsed.pathname, bytes);
      return new Response(null, { status: 200 });
    }
    if (method === "GET") {
      const bytes = objects.get(parsed.pathname);
      return bytes ? new Response(bytes, { status: 200 }) : new Response("missing", { status: 404 });
    }
    return new Response("unsupported", { status: 405 });
  };

  const rawContent = "ponto;ph\nP1;5.4\n";
  const raw = await saveRawImportFile({ tenantId: "tenant-1", analysisId: "analysis-1", fileName: "laudo final.csv", content: rawContent, encoding: "utf8" });
  assert.ok(raw?.key.startsWith("s3:v1:imports/tenant-1/analysis-1/"));
  assert.equal(raw?.bytes, Buffer.byteLength(rawContent));
  const putRequest = requests.find((request) => request.method === "PUT");
  assert.ok(putRequest, "S3 precisa executar PUT");
  assert.match(putRequest.headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 Credential=access-key-test\//);
  assert.ok(putRequest.headers.get("x-amz-content-sha256"));
  assert.ok(putRequest.headers.get("x-amz-date"));

  const rawRoundTrip = await readRawStoredFile(raw.key);
  assert.equal(rawRoundTrip.toString("utf8"), rawContent, "arquivo bruto S3 precisa ser reversível");

  const s3Report = await saveReportSnapshot({ tenantId: "tenant-1", interpretationId: "interp-1", revision: 7, content });
  assert.equal(s3Report.key, "s3:v1:reports/tenant-1/interp-1/rev-7.json");
  const reportRoundTrip = await readRawStoredFile(s3Report.key);
  assert.equal(reportRoundTrip.toString("utf8"), content);

  delete process.env.S3_SECRET_KEY;
  await assert.rejects(
    () => saveRawImportFile({ tenantId: "tenant", analysisId: "analysis", fileName: "laudo.csv", content: "x", encoding: "utf8" }),
    /Storage S3 incompleto/,
  );

  process.env.STORAGE_PROVIDER = "inline";
  process.env.REPORT_STORAGE_PROVIDER = "provider-inexistente";
  await assert.rejects(
    () => saveReportSnapshot({ tenantId: "tenant", interpretationId: "interpretation", revision: 4, content }),
    /não possui persistência de relatório implementada/,
  );

  console.log("OK — storage: inline + S3 SigV4, round-trip bruto/relatório e falha fechada de configuração.");
} finally {
  for (const key of envKeys) {
    const value = previousEnv[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  globalThis.fetch = previousFetch;
}
