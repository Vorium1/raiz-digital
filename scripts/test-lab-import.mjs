import assert from "node:assert/strict";
import { buildLabImportPreview } from "../src/domain/lab-import.ts";

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

console.log("lab-import: 4 cenários aprovados");
