import assert from "node:assert/strict";
import { buildLabImportPreview } from "../src/domain/lab-import.ts";
import {
  base64TransportBytes,
  compactLabImportPreview,
  jsonTransportBytes,
  LAB_UPLOAD_LIMITS,
} from "../src/domain/lab-upload-limits.ts";

const longCsv = `Amostra;Parametro;Valor;Unidade;Metodo
P01;pH;5,4;indice;Agua 1:1
P01;P;12,5;mg/dm3;Mehlich-1
P01;K;88;mg/dm3;Mehlich-1
P01;Ca;4,2;cmolc/dm3;KCl 1 mol/L`;

const valid = buildLabImportPreview(longCsv, "valid.csv", { hasAgronomicContext: true, spatialLinked: true });
assert.equal(valid.format, "LONG");
assert.equal(valid.sampleCount, 1);
assert.equal(valid.rows.length, 4);
assert.equal(valid.blockers, 0);
assert.ok(valid.confidence.score >= 90);

const duplicateCsv = `${longCsv}\nP01;P;13,0;mg/dm3;Mehlich-1`;
const duplicate = buildLabImportPreview(duplicateCsv, "duplicate.csv", { hasAgronomicContext: true, spatialLinked: true });
assert.ok(duplicate.blockers >= 1);
assert.ok(duplicate.issues.some((issue) => issue.code === "DUPLICATE_RESULT"));

const wideCsv = `Amostra;pH;P (mg/dm3);K (mg/dm3);Ca (cmolc/dm3)
P01;5,4;12,5;88;4,2`;
const wide = buildLabImportPreview(wideCsv, "wide.csv", { fallbackMethod: "Mehlich-1", hasAgronomicContext: true, spatialLinked: true });
assert.equal(wide.format, "WIDE");
assert.ok(wide.blockers >= 1, "Métodos não devem ser inventados para todos os parâmetros de tabela ampla.");
assert.equal(wide.rows.find((row) => row.parameterCode === "P")?.method, "Mehlich-1");
assert.equal(wide.rows.find((row) => row.parameterCode === "CA")?.method, "NÃO INFORMADO");

const commaCsv = `Amostra,Parametro,Valor,Unidade,Metodo
A1,P,10.5,mg/dm3,Mehlich-1`;
const comma = buildLabImportPreview(commaCsv, "comma.csv", { hasAgronomicContext: true, spatialLinked: true });
assert.equal(comma.delimiter, ",");
assert.equal(comma.rows[0]?.value, 10.5);

// Regressão de transporte: o navegador limita o arquivo bruto e o servidor limita o JSON transportado.
// PDF/XLSX crescem ~4/3 em base64; os tetos precisam deixar margem para JSON e metadados sem prometer
// arquivos que a Vercel recusaria na borda antes de a rota conseguir responder.
assert.ok(LAB_UPLOAD_LIMITS.functionPayloadBytes < 4_500_000, "o teto interno deve manter folga abaixo dos 4,5 MB da Vercel");
assert.ok(
  base64TransportBytes(LAB_UPLOAD_LIMITS.imageOrPdfBytes) + 100_000 < LAB_UPLOAD_LIMITS.functionPayloadBytes,
  "o maior PDF/foto permitido deve caber em base64 + overhead no teto interno",
);
assert.ok(
  base64TransportBytes(LAB_UPLOAD_LIMITS.spreadsheetBytes) + 100_000 < LAB_UPLOAD_LIMITS.functionPayloadBytes,
  "o maior XLS/XLSX permitido deve caber em base64 + overhead no teto interno",
);
assert.ok(
  LAB_UPLOAD_LIMITS.textBytes + 100_000 < LAB_UPLOAD_LIMITS.functionPayloadBytes,
  "o maior CSV/TXT permitido deve caber com overhead no teto interno",
);
assert.ok(jsonTransportBytes({ content: "x".repeat(1_000) }) > 1_000, "a medição deve incluir o envelope JSON, não só o conteúdo");

const manyRows = Array.from({ length: LAB_UPLOAD_LIMITS.previewRows + 7 }, (_, index) => ({ index }));
const manyIssues = Array.from({ length: LAB_UPLOAD_LIMITS.previewIssues + 9 }, (_, index) => ({ index }));
const compact = compactLabImportPreview({ rows: manyRows, issues: manyIssues, marker: "preservado" });
assert.equal(compact.normalizedRowCount, manyRows.length);
assert.equal(compact.issueCount, manyIssues.length);
assert.equal(compact.rows.length, LAB_UPLOAD_LIMITS.previewRows);
assert.equal(compact.issues.length, LAB_UPLOAD_LIMITS.previewIssues);
assert.equal(compact.marker, "preservado");

console.log("lab-import: 4 cenários agronômicos + limites/compactação de transporte aprovados");
