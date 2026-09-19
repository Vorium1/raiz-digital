import assert from "node:assert/strict";
import {
  readRawStoredFile,
  saveRawImportFile,
  saveRequiredRawImportFile,
  saveReportSnapshot,
  unwrapExtractedLabContent,
  wrapExtractedLabContent,
} from "../src/lib/storage.ts";

const previousStorage = process.env.STORAGE_PROVIDER;
const previousReportStorage = process.env.REPORT_STORAGE_PROVIDER;
const previousVercel = process.env.VERCEL;
const previousAuthSecret = process.env.AUTH_SECRET;

try {
  delete process.env.VERCEL;
  process.env.STORAGE_PROVIDER = "inline";
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-32-characters";
  delete process.env.REPORT_STORAGE_PROVIDER;

  const content = JSON.stringify({ reportSnapshotVersion: 2, field: "Área 01", facts: [{ p: 11, k: 229.9 }] });
  const stored = await saveReportSnapshot({ tenantId: "tenant", interpretationId: "interpretation", revision: 3, content });
  assert.ok(stored.key.startsWith("inline:v1:"));
  assert.equal(stored.bytes, Buffer.byteLength(content));
  assert.match(stored.sha256, /^[a-f0-9]{64}$/);
  const readBack = await readRawStoredFile(stored.key);
  assert.equal(readBack.toString("utf8"), content);

  // O provider local também precisa ser imutável entre duas publicações da MESMA interpretação/revisão.
  // O conteúdo/hash faz parte da chave para impedir overwrite silencioso quando uma nova prescrição é
  // aprovada sem recalcular a interpretação determinística.
  process.env.REPORT_STORAGE_PROVIDER = "local";
  const localContentA = JSON.stringify({ reportSnapshotVersion: 3, prescription: "A" });
  const localContentB = JSON.stringify({ reportSnapshotVersion: 3, prescription: "B" });
  const localA = await saveReportSnapshot({ tenantId: "tenant", interpretationId: "same-interpretation", revision: 7, content: localContentA });
  const localB = await saveReportSnapshot({ tenantId: "tenant", interpretationId: "same-interpretation", revision: 7, content: localContentB });
  assert.notEqual(localA.key, localB.key, "snapshots diferentes da mesma revisão não podem compartilhar a chave local");
  assert.ok(localA.key.includes(localA.sha256));
  assert.ok(localB.key.includes(localB.sha256));
  assert.equal((await readRawStoredFile(localA.key)).toString("utf8"), localContentA);
  assert.equal((await readRawStoredFile(localB.key)).toString("utf8"), localContentB);
  process.env.REPORT_STORAGE_PROVIDER = "inline";

  const raw = await saveRawImportFile({ tenantId: "tenant", analysisId: "analysis", fileName: "laudo.csv", content: "x", encoding: "utf8" });
  assert.equal(raw, null, "arquivos brutos não devem usar inline");
  await assert.rejects(
    () => saveRequiredRawImportFile({ tenantId: "tenant", analysisId: "analysis", fileName: "laudo.csv", content: "x", encoding: "utf8" }),
    /Persistência obrigatória do arquivo original indisponível/,
    "fluxos agronômicos devem falhar fechado quando não há persistência bruta durável",
  );

  const source = {
    key: "s3:v1:imports/tenant/sources/abc-laudo.pdf",
    bytes: 123,
    sha256: "a".repeat(64),
    fileName: "Laudo Área 01.pdf",
    sourceType: "PDF_OCR",
  };
  const csv = "amostra,parametro,valor\nA1,P,12";
  const transported = wrapExtractedLabContent(csv, source, "tenant");
  const unwrapped = unwrapExtractedLabContent(transported, "tenant");
  assert.equal(unwrapped.content, csv);
  assert.equal(unwrapped.source?.key, source.key);
  assert.equal(unwrapped.source?.sha256, source.sha256);
  assert.equal(unwrapped.source?.fileName, source.fileName);
  assert.equal(unwrapped.source?.sourceType, source.sourceType);
  assert.match(unwrapped.source?.extractedSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.match(unwrapped.source?.signature ?? "", /^[a-f0-9]{64}$/);

  // CSV/XLSX também usam o mesmo transporte assinado: a pré-validação real não pode acontecer sobre
  // uma versão do arquivo e o commit receber silenciosamente outra.
  const csvSource = {
    key: "s3:v1:imports/tenant/sources/def-laudo.csv",
    bytes: Buffer.byteLength(csv),
    sha256: "b".repeat(64),
    fileName: "laudo.csv",
    sourceType: "CSV",
  };
  const transportedCsv = wrapExtractedLabContent(csv, csvSource, "tenant");
  const unwrappedCsv = unwrapExtractedLabContent(transportedCsv, "tenant");
  assert.equal(unwrappedCsv.content, csv);
  assert.equal(unwrappedCsv.source?.sourceType, "CSV");
  assert.equal(unwrappedCsv.source?.fileName, "laudo.csv");
  assert.throws(
    () => unwrapExtractedLabContent(transportedCsv.replace("A1,P,12", "A1,P,13"), "tenant"),
    /proveniência/,
    "CSV alterado depois do preview deve invalidar o recibo assinado",
  );

  const xlsxSource = {
    key: "s3:v1:imports/tenant/sources/ghi-laudo.xlsx",
    bytes: 321,
    sha256: "c".repeat(64),
    fileName: "laudo.xlsx",
    sourceType: "XLSX",
  };
  const fakeXlsxBase64 = "UEsDBAoAAAAAAFRFU1Q=";
  const transportedXlsx = wrapExtractedLabContent(fakeXlsxBase64, xlsxSource, "tenant");
  assert.equal(unwrapExtractedLabContent(transportedXlsx, "tenant").source?.sourceType, "XLSX");

  assert.deepEqual(unwrapExtractedLabContent(csv, "tenant"), { content: csv, source: null });

  // O cliente não pode trocar um único valor do CSV depois que /extract assinou a proveniência.
  const tamperedCsv = transported.replace("A1,P,12", "A1,P,99");
  assert.throws(
    () => unwrapExtractedLabContent(tamperedCsv, "tenant"),
    /proveniência/,
    "alterar o CSV depois da extração deve invalidar o recibo assinado",
  );

  // O mesmo recibo também não pode ser reaproveitado por outro tenant.
  assert.throws(
    () => unwrapExtractedLabContent(transported, "outro-tenant"),
    /proveniência/,
    "recibo de proveniência deve ser vinculado ao tenant que arquivou o original",
  );

  // Envelopes V1 não assinados são deliberadamente recusados: refazer a validação é mais seguro do que
  // aceitar uma cadeia de custódia que o cliente conseguiria editar livremente.
  assert.throws(
    () => unwrapExtractedLabContent("#RAIZ_SOURCE_V1 nao-e-base64\namostra,parametro,valor", "tenant"),
    /legado|proveniência/,
  );

  const signedWithoutSecret = transported;
  delete process.env.AUTH_SECRET;
  assert.throws(
    () => unwrapExtractedLabContent(signedWithoutSecret, "tenant"),
    /AUTH_SECRET|cadeia de custódia/i,
    "servidor sem segredo de proveniência deve falhar fechado",
  );
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-32-characters";

  process.env.REPORT_STORAGE_PROVIDER = "provider-inexistente";
  await assert.rejects(
    () => saveReportSnapshot({ tenantId: "tenant", interpretationId: "interpretation", revision: 4, content }),
    /não possui persistência de relatório implementada/,
  );

  console.log("OK — storage: snapshot inline/local imutável + proveniência HMAC para PDF/CSV/XLSX + anti-tampering + persistência bruta fail-closed.");
} finally {
  if (previousStorage === undefined) delete process.env.STORAGE_PROVIDER; else process.env.STORAGE_PROVIDER = previousStorage;
  if (previousReportStorage === undefined) delete process.env.REPORT_STORAGE_PROVIDER; else process.env.REPORT_STORAGE_PROVIDER = previousReportStorage;
  if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
  if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previousAuthSecret;
}
