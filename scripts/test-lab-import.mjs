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


const tedescoProtocol = "Tedesco, M. J. et al. Boletim técnico n° 5 - Análises de Solo, Plantas e Outros Materiais. 2 ed. Porto Alegre, 1995";
const protocolCsv = `Amostra;Parametro;Valor;Unidade;Metodo;Protocolo
SQC1;B;0,3;mg/dm3;;${tedescoProtocol}
SQC1;Mn;30,9;mg/dm3;KCl 1 mol/L;${tedescoProtocol}
SQC1;S;9,8;mg/dm3;Turbidimetria;${tedescoProtocol}
SQC1;Cu;2,8;mg/dm3;;${tedescoProtocol}
SQC1;Zn;4,4;mg/dm3;;${tedescoProtocol}`;
const protocolPreview = buildLabImportPreview(protocolCsv, "tedesco.csv", { hasAgronomicContext: true, spatialLinked: true });
assert.equal(protocolPreview.blockers, 0, "Protocolo global reconhecido deve resolver os métodos por parâmetro.");
assert.equal(protocolPreview.rows.find((row) => row.parameterCode === "B")?.method, "Água quente, colorimetria com curcumina");
assert.equal(protocolPreview.rows.find((row) => row.parameterCode === "MN")?.method, "KCl 1 mol/L (Tedesco 1995)");
assert.equal(protocolPreview.rows.find((row) => row.parameterCode === "S")?.method, "Ca(H2PO4)2 500mg P/L, turbidimetria");
assert.equal(protocolPreview.rows.find((row) => row.parameterCode === "CU")?.method, "HCl 0,1 mol/L (Tedesco 1995)");
assert.equal(protocolPreview.rows.find((row) => row.parameterCode === "ZN")?.method, "HCl 0,1 mol/L (Tedesco 1995)");
assert.ok(protocolPreview.rows.every((row) => row.methodDerivedFromProtocol));

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


const bioAsLongCsv = `Amostra;Parametro;Valor;Unidade;Metodo
B01;β-glicosidase;152;mg p-nitrofenol kg-1 solo h-1;
B01;Arilsulfatase;158;mg p-nitrofenol kg-1 solo h-1;
B01;IQS FertBio;0,92;indice;
B01;IQS Bio;0,97;indice;`;
const bioAsLong = buildLabImportPreview(bioAsLongCsv, "bioas-long.csv", { hasAgronomicContext: true, spatialLinked: true });
assert.equal(bioAsLong.blockers, 0, "BioAS deve ser importável sem método manual quando o parâmetro é inequívoco.");
assert.equal(bioAsLong.rows.find((row) => row.parameterCode === "BIOAS_BETA_GLUCOSIDASE")?.method, "BioAS Embrapa — atividade enzimática");
assert.equal(bioAsLong.rows.find((row) => row.parameterCode === "BIOAS_ARYLSULFATASE")?.method, "BioAS Embrapa — atividade enzimática");
assert.equal(bioAsLong.rows.find((row) => row.parameterCode === "BIOAS_IQS_FERTBIO")?.method, "BioAS/MIQS — índice informado no laudo");

const bioAsWideCsv = `Amostra;Beta-glicosidase;Ari;IQS FertBio
B01;152;158;0,92`;
const bioAsWide = buildLabImportPreview(bioAsWideCsv, "bioas-wide.csv", { hasAgronomicContext: true, spatialLinked: true });
assert.equal(bioAsWide.format, "WIDE");
assert.equal(bioAsWide.blockers, 0);
assert.equal(bioAsWide.rows.length, 3);
assert.ok(bioAsWide.parameters.includes("BIOAS_BETA_GLUCOSIDASE"));
assert.ok(bioAsWide.parameters.includes("BIOAS_ARYLSULFATASE"));

const functionalBioWideCsv = `Amostra;Azospirillum brasilense (UFC/g solo);Bactérias solubilizadoras de fósforo (UFC/g solo)
M01;420000;11000`;
const functionalBioWide = buildLabImportPreview(functionalBioWideCsv, "microbiologia-wide.csv", {
  fallbackMethod: "Contagem em meio seletivo informada pelo laboratório",
  hasAgronomicContext: true,
  spatialLinked: true,
});
assert.equal(functionalBioWide.format, "WIDE");
assert.equal(functionalBioWide.blockers, 0);
assert.equal(functionalBioWide.rows.length, 2);
assert.ok(functionalBioWide.parameters.some((code) => code.includes("AZOSPIRILLUM")));
assert.ok(functionalBioWide.parameters.some((code) => code.includes("SOLUBILIZADORASDEFOSFORO")));
assert.ok(functionalBioWide.rows.every((row) => row.unit === "UFC/g solo"));
assert.ok(functionalBioWide.rows.every((row) => row.method === "Contagem em meio seletivo informada pelo laboratório"));

const functionalBioMissingUnitCsv = `Amostra;Azospirillum brasilense
M01;420000`;
const functionalBioMissingUnit = buildLabImportPreview(functionalBioMissingUnitCsv, "microbiologia-sem-unidade.csv", {
  fallbackMethod: "Contagem em meio seletivo informada pelo laboratório",
  hasAgronomicContext: true,
  spatialLinked: true,
});
assert.equal(functionalBioMissingUnit.rows.length, 1, "Parâmetro biológico deve ser preservado mesmo quando falta unidade.");
assert.ok(functionalBioMissingUnit.issues.some((issue) => issue.code === "UNIT_UNKNOWN"));
assert.ok(functionalBioMissingUnit.blockers >= 1, "Unidade microbiológica não pode ser inventada.");

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

console.log("lab-import: protocolo global + cenários agronômicos + limites/compactação de transporte aprovados");
