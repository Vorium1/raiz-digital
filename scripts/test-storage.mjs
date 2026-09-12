import assert from "node:assert/strict";
import { readRawStoredFile, saveRawImportFile, saveReportSnapshot } from "../src/lib/storage.ts";

const previousStorage = process.env.STORAGE_PROVIDER;
const previousReportStorage = process.env.REPORT_STORAGE_PROVIDER;
const previousVercel = process.env.VERCEL;

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

  const raw = await saveRawImportFile({ tenantId: "tenant", analysisId: "analysis", fileName: "laudo.csv", content: "x", encoding: "utf8" });
  assert.equal(raw, null, "arquivos brutos não devem usar inline");

  process.env.REPORT_STORAGE_PROVIDER = "provider-inexistente";
  await assert.rejects(
    () => saveReportSnapshot({ tenantId: "tenant", interpretationId: "interpretation", revision: 4, content }),
    /não possui persistência de relatório implementada/,
  );

  console.log("OK — storage: snapshot inline durável/reversível + provider desconhecido fail-closed.");
} finally {
  if (previousStorage === undefined) delete process.env.STORAGE_PROVIDER; else process.env.STORAGE_PROVIDER = previousStorage;
  if (previousReportStorage === undefined) delete process.env.REPORT_STORAGE_PROVIDER; else process.env.REPORT_STORAGE_PROVIDER = previousReportStorage;
  if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
}
