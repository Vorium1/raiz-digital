import * as XLSX from "xlsx";

export type LabImportSeverity = "BLOCKER" | "WARNING" | "INFO";

export type LabImportIssue = {
  severity: LabImportSeverity;
  code: string;
  message: string;
  line?: number;
};

export type LabImportRow = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
  sourceLine: number;
  source: "MEASURED";
  unitInferred: boolean;
  methodInferred: boolean;
};

export type LabImportConfidence = {
  score: number;
  level: "HIGH" | "ADEQUATE" | "LIMITED" | "INSUFFICIENT";
  dimensions: Array<{
    key: "completeness" | "laboratory" | "ruleCompatibility" | "context" | "spatialQuality";
    label: string;
    score: number;
    weight: number;
  }>;
};

export type LabImportPreview = {
  fileName: string;
  format: "LONG" | "WIDE";
  delimiter: ";" | "," | "\t";
  rows: LabImportRow[];
  sampleCount: number;
  parameterCount: number;
  parameters: string[];
  issues: LabImportIssue[];
  blockers: number;
  warnings: number;
  confidence: LabImportConfidence;
  detectedHeaders: string[];
};

export type LabImportContext = {
  hasAgronomicContext?: boolean;
  spatialLinked?: boolean;
  fallbackMethod?: string;
};

const PARAMETER_ALIASES: Record<string, string> = {
  ph: "PH",
  phagua: "PH",
  phh2o: "PH",
  phsmp: "SMP",
  smp: "SMP",
  p: "P",
  fosforo: "P",
  phosphorus: "P",
  k: "K",
  potassio: "K",
  potassium: "K",
  ca: "CA",
  calcio: "CA",
  calcium: "CA",
  mg: "MG",
  magnesio: "MG",
  magnesium: "MG",
  al: "AL",
  aluminio: "AL",
  aluminium: "AL",
  hal: "H_AL",
  hmaisal: "H_AL",
  h_al: "H_AL",
  acidezpotencial: "H_AL",
  ctc: "CTC",
  ctcpotencial: "CTC",
  ctcph7: "CTC",
  v: "V",
  vpercent: "V",
  saturacaobases: "V",
  saturacaoporbase: "V",
  mo: "MO",
  materiaorganica: "MO",
  carbonoorganico: "C_ORG",
  corganico: "C_ORG",
  c_org: "C_ORG",
  s: "S",
  enxofre: "S",
  sulfur: "S",
  b: "B",
  boro: "B",
  boron: "B",
  zn: "ZN",
  zinco: "ZN",
  zinc: "ZN",
  cu: "CU",
  cobre: "CU",
  copper: "CU",
  mn: "MN",
  manganes: "MN",
  manganese: "MN",
  fe: "FE",
  ferro: "FE",
  iron: "FE",
  argila: "CLAY",
  clay: "CLAY",
};

const DEFAULT_UNITS: Record<string, string> = {
  PH: "índice",
  SMP: "índice",
  P: "mg/dm³",
  K: "mg/dm³",
  CA: "cmolc/dm³",
  MG: "cmolc/dm³",
  AL: "cmolc/dm³",
  H_AL: "cmolc/dm³",
  CTC: "cmolc/dm³",
  V: "%",
  MO: "%",
  C_ORG: "%",
  S: "mg/dm³",
  B: "mg/dm³",
  ZN: "mg/dm³",
  CU: "mg/dm³",
  MN: "mg/dm³",
  FE: "mg/dm³",
  CLAY: "%",
};

const SAMPLE_HEADERS = ["amostra", "codigoamostra", "codamostra", "ponto", "sample", "sampleid", "idamostra", "identificacao"];
const PARAMETER_HEADERS = ["parametro", "elemento", "analito", "nutriente", "parameter"];
const VALUE_HEADERS = ["valor", "resultado", "result", "value"];
const UNIT_HEADERS = ["unidade", "unit", "uom"];
const METHOD_HEADERS = ["metodo", "method", "extrator", "extractor"];

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(value: string) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/%/g, "percent")
    .replace(/[+]/g, "mais")
    .replace(/[^a-z0-9_]+/g, "")
    .trim();
}

function normalizeParameter(value: string) {
  const raw = normalizeHeader(value.replace(/\([^)]*\)/g, ""));
  return PARAMETER_ALIASES[raw] ?? raw.toUpperCase();
}

function extractUnitFromHeader(header: string) {
  const match = header.match(/\(([^)]+)\)/);
  if (!match) return "";
  return match[1].replace(/dm3/gi, "dm³").replace(/cmolc\/?dm3/gi, "cmolc/dm³").trim();
}


function inferMethod(parameterCode: string, fallbackMethod?: string) {
  const fallback = fallbackMethod?.trim();
  if (!fallback) return "";
  if (["P", "K"].includes(parameterCode) && ["Mehlich-1", "Resina"].includes(fallback)) return fallback;
  return "";
}

function parseNumber(raw: string) {
  const value = raw.trim().replace(/\s/g, "");
  if (!value) return Number.NaN;
  const normalized = value.includes(",") && !value.includes(".")
    ? value.replace(",", ".")
    : value.includes(",") && value.includes(".") && value.lastIndexOf(",") > value.lastIndexOf(".")
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");
  return Number(normalized);
}

function countOutsideQuotes(line: string, char: string) {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && line[i] === char) count += 1;
  }
  return count;
}

export function detectDelimiter(content: string): ";" | "," | "\t" {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).slice(0, 8);
  const candidates = [";", "\t", ","] as const;
  const scores = candidates.map((delimiter) => ({
    delimiter,
    score: lines.reduce((total, line) => total + countOutsideQuotes(line, delimiter), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score ? scores[0].delimiter : ";";
}

export function parseDelimited(content: string, delimiter = detectDelimiter(content)) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = content.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field.trim());
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function makeConfidence(rows: LabImportRow[], issues: LabImportIssue[], context: LabImportContext): LabImportConfidence {
  const total = Math.max(rows.length, 1);
  const unitKnown = rows.filter((row) => row.unit && row.unit !== "NÃO INFORMADA" && !row.unitInferred).length / total;
  const methodKnown = rows.filter((row) => row.method && row.method !== "NÃO INFORMADO" && !row.methodInferred).length / total;
  const recognized = rows.filter((row) => Boolean(DEFAULT_UNITS[row.parameterCode])).length / total;
  const blockerPenalty = Math.min(60, issues.filter((issue) => issue.severity === "BLOCKER").length * 12);

  const dimensions: LabImportConfidence["dimensions"] = [
    { key: "completeness", label: "Completude", score: Math.max(0, Math.round(((unitKnown + methodKnown) / 2) * 100) - blockerPenalty), weight: 25 },
    { key: "laboratory", label: "Coerência laboratorial", score: Math.max(0, 100 - blockerPenalty), weight: 25 },
    { key: "ruleCompatibility", label: "Compatibilidade de regra", score: Math.round(recognized * 100), weight: 20 },
    { key: "context", label: "Contexto agronômico", score: context.hasAgronomicContext === false ? 35 : 100, weight: 15 },
    { key: "spatialQuality", label: "Qualidade espacial", score: context.spatialLinked === false ? 45 : 90, weight: 15 },
  ];

  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / 100);
  const level = score >= 90 ? "HIGH" : score >= 75 ? "ADEQUATE" : score >= 50 ? "LIMITED" : "INSUFFICIENT";
  return { score, level, dimensions };
}

function addIssue(issues: LabImportIssue[], severity: LabImportSeverity, code: string, message: string, line?: number) {
  issues.push({ severity, code, message, line });
}

function dedupeRows(rows: LabImportRow[], issues: LabImportIssue[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.sampleCode}|${row.parameterCode}|${row.method}`;
    if (seen.has(key)) {
      addIssue(issues, "BLOCKER", "DUPLICATE_RESULT", `Resultado duplicado para ${row.sampleCode} / ${row.parameterCode}.`, row.sourceLine);
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildLabImportPreviewFromMatrix(
  matrix: string[][],
  fileName: string,
  context: LabImportContext,
  delimiter: ";" | "," | "\t",
): LabImportPreview {
  if (matrix.length < 2) throw new Error("O arquivo precisa conter cabeçalho e ao menos uma linha de dados.");

  const detectedHeaders = matrix[0].map((item) => item.trim());
  const normalizedHeaders = detectedHeaders.map(normalizeHeader);
  const sampleIndex = findHeaderIndex(detectedHeaders, SAMPLE_HEADERS);
  const parameterIndex = findHeaderIndex(detectedHeaders, PARAMETER_HEADERS);
  const valueIndex = findHeaderIndex(detectedHeaders, VALUE_HEADERS);
  const unitIndex = findHeaderIndex(detectedHeaders, UNIT_HEADERS);
  const methodIndex = findHeaderIndex(detectedHeaders, METHOD_HEADERS);
  const format: "LONG" | "WIDE" = parameterIndex >= 0 && valueIndex >= 0 ? "LONG" : "WIDE";
  const issues: LabImportIssue[] = [];
  let rows: LabImportRow[] = [];

  if (sampleIndex < 0) {
    addIssue(issues, "BLOCKER", "SAMPLE_COLUMN_MISSING", "Não foi possível identificar a coluna de amostra/ponto no arquivo.");
  }

  if (format === "LONG") {
    matrix.slice(1).forEach((sourceRow, rowIndex) => {
      const sourceLine = rowIndex + 2;
      const sampleCode = sampleIndex >= 0 ? (sourceRow[sampleIndex] ?? "").trim() : "";
      const parameterRaw = sourceRow[parameterIndex] ?? "";
      const valueRaw = sourceRow[valueIndex] ?? "";
      const value = parseNumber(valueRaw);
      const parameterCode = normalizeParameter(parameterRaw);
      const unitRaw = unitIndex >= 0 ? (sourceRow[unitIndex] ?? "").trim() : "";
      const methodRaw = methodIndex >= 0 ? (sourceRow[methodIndex] ?? "").trim() : "";
      const inferredUnit = !unitRaw && Boolean(DEFAULT_UNITS[parameterCode]);
      const fallbackForParameter = inferMethod(parameterCode, context.fallbackMethod);
      const inferredMethod = !methodRaw && Boolean(fallbackForParameter);
      const unit = unitRaw || DEFAULT_UNITS[parameterCode] || "NÃO INFORMADA";
      const method = methodRaw || fallbackForParameter || "NÃO INFORMADO";

      if (!sampleCode) addIssue(issues, "BLOCKER", "SAMPLE_CODE_MISSING", "Linha sem código de amostra.", sourceLine);
      if (!parameterRaw.trim()) addIssue(issues, "BLOCKER", "PARAMETER_MISSING", "Linha sem parâmetro laboratorial.", sourceLine);
      if (!Number.isFinite(value)) addIssue(issues, "BLOCKER", "INVALID_VALUE", `Valor inválido: “${valueRaw || "vazio"}”.`, sourceLine);
      if (unit === "NÃO INFORMADA") addIssue(issues, "BLOCKER", "UNIT_UNKNOWN", `Unidade não reconhecida para ${parameterRaw || "parâmetro"}.`, sourceLine);
      if (method === "NÃO INFORMADO") addIssue(issues, "BLOCKER", "METHOD_UNKNOWN", `Método analítico ausente para ${parameterRaw || "parâmetro"}.`, sourceLine);
      if (inferredUnit) addIssue(issues, "WARNING", "UNIT_INFERRED", `Unidade de ${parameterCode} foi inferida e precisa de conferência humana.`, sourceLine);
      if (inferredMethod) addIssue(issues, "WARNING", "METHOD_INFERRED", `Método de ${parameterCode} foi preenchido pelo método principal selecionado.`, sourceLine);

      if (sampleCode && parameterRaw.trim() && Number.isFinite(value)) {
        rows.push({ sampleCode, parameterCode, value, unit, method, sourceLine, source: "MEASURED", unitInferred: inferredUnit, methodInferred: inferredMethod });
      }
    });
  } else {
    const parameterColumns = detectedHeaders
      .map((header, index) => ({ header, index, parameterCode: normalizeParameter(header), unit: extractUnitFromHeader(header) }))
      .filter((entry) => entry.index !== sampleIndex && Boolean(DEFAULT_UNITS[entry.parameterCode]));

    if (!parameterColumns.length) {
      addIssue(issues, "BLOCKER", "PARAMETERS_NOT_RECOGNIZED", "O arquivo não possui colunas laboratoriais reconhecidas. Use nomes como pH, P, K, Ca, Mg, Al, CTC, V%, MO, S, B, Zn, Cu, Mn ou Fe.");
    }

    matrix.slice(1).forEach((sourceRow, rowIndex) => {
      const sourceLine = rowIndex + 2;
      const sampleCode = sampleIndex >= 0 ? (sourceRow[sampleIndex] ?? "").trim() : "";
      if (!sampleCode) {
        addIssue(issues, "BLOCKER", "SAMPLE_CODE_MISSING", "Linha sem código de amostra.", sourceLine);
        return;
      }

      parameterColumns.forEach((column) => {
        const raw = sourceRow[column.index] ?? "";
        if (!raw.trim()) return;
        const value = parseNumber(raw);
        const explicitUnit = column.unit.trim();
        const unit = explicitUnit || DEFAULT_UNITS[column.parameterCode] || "NÃO INFORMADA";
        const fallbackForParameter = inferMethod(column.parameterCode, context.fallbackMethod);
        const method = fallbackForParameter || "NÃO INFORMADO";
        const inferredUnit = !explicitUnit;
        const inferredMethod = Boolean(fallbackForParameter);

        if (!Number.isFinite(value)) {
          addIssue(issues, "BLOCKER", "INVALID_VALUE", `Valor inválido em ${column.header}: “${raw}”.`, sourceLine);
          return;
        }
        if (unit === "NÃO INFORMADA") addIssue(issues, "BLOCKER", "UNIT_UNKNOWN", `Unidade não reconhecida em ${column.header}.`, sourceLine);
        if (method === "NÃO INFORMADO") addIssue(issues, "BLOCKER", "METHOD_UNKNOWN", `Informe o método principal antes de processar ${column.header}.`, sourceLine);
        if (inferredUnit) addIssue(issues, "WARNING", "UNIT_INFERRED", `Unidade de ${column.parameterCode} foi inferida e precisa de conferência humana.`, sourceLine);
        if (inferredMethod) addIssue(issues, "WARNING", "METHOD_INFERRED", `Método de ${column.parameterCode} foi preenchido pelo método principal selecionado.`, sourceLine);

        rows.push({ sampleCode, parameterCode: column.parameterCode, value, unit, method, sourceLine, source: "MEASURED", unitInferred: inferredUnit, methodInferred: inferredMethod });
      });
    });
  }

  rows = dedupeRows(rows, issues);
  if (!rows.length) addIssue(issues, "BLOCKER", "NO_VALID_RESULTS", "Nenhum resultado laboratorial válido foi extraído.");

  const parameterSet = new Set(rows.map((row) => row.parameterCode));
  const sampleSet = new Set(rows.map((row) => row.sampleCode));
  const blockers = issues.filter((issue) => issue.severity === "BLOCKER").length;
  const warnings = issues.filter((issue) => issue.severity === "WARNING").length;
  const confidence = makeConfidence(rows, issues, context);

  return {
    fileName,
    format,
    delimiter,
    rows,
    sampleCount: sampleSet.size,
    parameterCount: parameterSet.size,
    parameters: Array.from(parameterSet).sort(),
    issues,
    blockers,
    warnings,
    confidence,
    detectedHeaders,
  };
}

export function buildLabImportPreview(
  content: string,
  fileName = "laudo.csv",
  context: LabImportContext = {},
): LabImportPreview {
  if (!content.trim()) throw new Error("O arquivo está vazio.");
  if (content.length > 3_500_000) throw new Error("O CSV excede o limite de 3,5 MB desta etapa do MVP.");

  const delimiter = detectDelimiter(content);
  const matrix = parseDelimited(content, delimiter);
  return buildLabImportPreviewFromMatrix(matrix, fileName, context, delimiter);
}

export function xlsxMatrixFromBase64(base64: string): string[][] {
  const workbook = XLSX.read(base64, { type: "base64" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("A planilha não possui nenhuma aba.");
  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  return matrix.map((row) => row.map((cell) => String(cell ?? "").trim()));
}

export function buildLabImportPreviewFromXlsxBase64(
  base64: string,
  fileName = "laudo.xlsx",
  context: LabImportContext = {},
): LabImportPreview {
  if (!base64.trim()) throw new Error("O arquivo está vazio.");
  if (base64.length > 5_000_000) throw new Error("A planilha excede o limite de tamanho desta etapa do MVP.");

  let matrix: string[][];
  try {
    matrix = xlsxMatrixFromBase64(base64);
  } catch (error) {
    throw new Error(error instanceof Error ? `Não foi possível ler a planilha: ${error.message}` : "Não foi possível ler a planilha.");
  }
  return buildLabImportPreviewFromMatrix(matrix, fileName, context, ";");
}

export function isSpreadsheetFileName(fileName: string) {
  return /\.xlsx?$/i.test(fileName);
}
