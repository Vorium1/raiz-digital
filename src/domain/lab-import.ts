import * as XLSX from "xlsx";

/**
 * Duplicado (não importado) de `ANALYTICAL_METHOD_ALIASES`/`normalizeAnalyticalMethod` em
 * `lab-method-normalization.ts` -- mesma restrição de sempre neste projeto: um import relativo entre dois
 * arquivos `.ts` quebra `node --experimental-strip-types` (usado por `scripts/test-lab-import.mjs` pra
 * testar este módulo sem subir a aplicação inteira), e adicionar a extensão `.ts` no import quebra o
 * `tsc`/Next build (`allowImportingTsExtensions` não habilitado). `lab-method-normalization.ts` continua
 * a fonte de verdade documentada/auditada (comentários com o motivo de cada equivalência, e a distinção
 * entre o que está APLICADO vs. PENDENTE DE CONFIRMAÇÃO DOCUMENTAL -- item 5 do fechamento técnico,
 * 2026-09-11); mudar uma entrada aqui exige mudar a mesma entrada lá. Só CTC aplicada -- S/B/MN ficaram
 * de fora de propósito (equivalência plausível, mas não confirmada contra o PDF original do laboratório).
 */
const ANALYTICAL_METHOD_ALIASES: Array<{ parameterCode: string; rawMethod: string; canonicalMethod: string }> = [
  { parameterCode: "CTC", rawMethod: "Calculado: Ca+Mg+K+(H+Al)", canonicalMethod: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)" },
];

const TEDESCO_1995_METHODS: Record<string, string> = {
  CLAY: "Densímetro",
  PH: "H2O",
  SMP: "Índice SMP",
  P: "Mehlich-1",
  K: "Mehlich-1",
  MO: "Oxidação sulfocrômica",
  AL: "KCl 1 mol/L",
  CA: "KCl 1 mol/L",
  MG: "KCl 1 mol/L",
  H_AL: "SMP",
  CTC: "Calculado: CTCpH7,0 = Ca + Mg + K + (H+Al)",
  S: "Ca(H2PO4)2 500mg P/L, turbidimetria",
  B: "Água quente, colorimetria com curcumina",
  MN: "KCl 1 mol/L (Tedesco 1995)",
  CU: "HCl 0,1 mol/L (Tedesco 1995)",
  ZN: "HCl 0,1 mol/L (Tedesco 1995)",
};

function isTedesco1995(protocol: string) {
  const text = protocol.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return (text.includes("tedesco") && text.includes("1995"))
    || (text.includes("boletim tecnico") && /\b5\b/.test(text) && text.includes("1995"));
}

function protocolMethodFor(parameterCode: string, protocol: string): string {
  return protocol && isTedesco1995(protocol) ? (TEDESCO_1995_METHODS[parameterCode] ?? "") : "";
}

function normalizeAnalyticalMethod(parameterCode: string, rawMethod: string, protocol = ""): string {
  const alias = ANALYTICAL_METHOD_ALIASES.find((a) => a.parameterCode === parameterCode && a.rawMethod === rawMethod);
  if (alias) return alias.canonicalMethod;
  const fromProtocol = protocolMethodFor(parameterCode, protocol);
  if (!fromProtocol) return rawMethod;

  if (!rawMethod) return fromProtocol;
  const acceptedAbbreviation: Record<string, string[]> = {
    B: ["Água quente"],
    S: ["Turbidimetria"],
    MN: ["KCl 1 mol/L"],
    CU: ["HCl 0,1 mol/L"],
    ZN: ["HCl 0,1 mol/L"],
  };
  return (acceptedAbbreviation[parameterCode] ?? []).includes(rawMethod) ? fromProtocol : rawMethod;
}

export type LabSampleType =
  | "SOLO"
  | "FOLIAR"
  | "PECIOLO"
  | "MASSA_SECA"
  | "GRAO"
  | "SEMENTE"
  | "FERTILIZANTE"
  | "BIOLOGICO";

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
  /** Protocolo global transcrito do documento (ex.: Tedesco et al. 1995). */
  protocol: string;
  /** Texto do método exatamente como veio na linha, antes da resolução por protocolo. */
  rawMethod: string;
  sourceLine: number;
  source: "MEASURED";
  unitInferred: boolean;
  methodInferred: boolean;
  methodDerivedFromProtocol: boolean;
  depthFromCm?: number | null;
  depthToCm?: number | null;
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

export type LabImportUsability = {
  promotableRowCount: number;
  excludedRowCount: number;
  localizedBlockerCount: number;
  fatalBlockerCount: number;
  canProceedWithPartialEvidence: boolean;
  fullyUsable: boolean;
};

/**
 * Distingue bloqueio localizado de falha estrutural do arquivo.
 *
 * Um blocker com linha conhecida invalida somente a linha correspondente;
 * as demais evidências podem seguir para o motor. Um blocker sem linha é
 * tratado como estrutural/fatal (ex.: arquivo sem coluna de amostra ou sem
 * resultados utilizáveis) e impede promoção parcial.
 */
export function selectPromotableLabRows(
  rows: LabImportRow[],
  issues: LabImportIssue[],
): LabImportRow[] {
  if (issues.some((issue) => issue.severity === "BLOCKER" && issue.line == null)) return [];
  const blockedLines = new Set(
    issues
      .filter((issue) => issue.severity === "BLOCKER" && issue.line != null)
      .map((issue) => issue.line as number),
  );
  return rows.filter((row) => !blockedLines.has(row.sourceLine));
}

export function evaluateLabImportUsability(
  preview: Pick<LabImportPreview, "rows" | "issues">,
): LabImportUsability {
  const blockerIssues = preview.issues.filter((issue) => issue.severity === "BLOCKER");
  const fatalBlockerCount = blockerIssues.filter((issue) => issue.line == null).length;
  const localizedBlockerCount = blockerIssues.length - fatalBlockerCount;
  const promotableRowCount = selectPromotableLabRows(preview.rows, preview.issues).length;
  const excludedRowCount = Math.max(0, preview.rows.length - promotableRowCount);
  return {
    promotableRowCount,
    excludedRowCount,
    localizedBlockerCount,
    fatalBlockerCount,
    canProceedWithPartialEvidence: fatalBlockerCount === 0 && promotableRowCount > 0,
    fullyUsable: blockerIssues.length === 0 && promotableRowCount > 0,
  };
}

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

  // BioAS / bioanálise do solo — nomes observados em laudos e materiais Embrapa.
  ari: "BIOAS_ARYLSULFATASE",
  arilsulfatase: "BIOAS_ARYLSULFATASE",
  sulfatase: "BIOAS_ARYLSULFATASE",
  beta: "BIOAS_BETA_GLUCOSIDASE",
  betaglicosidase: "BIOAS_BETA_GLUCOSIDASE",
  betaglucosidase: "BIOAS_BETA_GLUCOSIDASE",
  glicosidase: "BIOAS_BETA_GLUCOSIDASE",
  iqsbiologico: "BIOAS_IQS_BIO",
  iqsbio: "BIOAS_IQS_BIO",
  iqsquimico: "BIOAS_IQS_QUIM",
  iqsquim: "BIOAS_IQS_QUIM",
  iqsfertbio: "BIOAS_IQS_FERTBIO",
  ciclagem: "BIOAS_CYCLING_SCORE",
  ciclagemdenutrientes: "BIOAS_CYCLING_SCORE",
  armazenamento: "BIOAS_STORAGE_SCORE",
  armazenamentodenutrientes: "BIOAS_STORAGE_SCORE",
  suprimento: "BIOAS_SUPPLY_SCORE",
  suprimentodenutrientes: "BIOAS_SUPPLY_SCORE",

  // Métodos biológicos complementares — não possuem unidade padrão inferida.
  // A unidade e o protocolo do laboratório precisam acompanhar o resultado.
  biomassamicrobiana: "MICROBIO_BIOMASS_C",
  carbonodabiomassamicrobiana: "MICROBIO_BIOMASS_C",
  cbm: "MICROBIO_BIOMASS_C",
  nitrogeniodabiomassamicrobiana: "MICROBIO_BIOMASS_N",
  nitrogêniodabiomassamicrobiana: "MICROBIO_BIOMASS_N",
  bmn: "MICROBIO_BIOMASS_N",
  respiracaobasal: "MICROBIO_BASAL_RESPIRATION",
  respiracaomicrobiana: "MICROBIO_BASAL_RESPIRATION",
  quocientemetabolico: "MICROBIO_QCO2",
  qco2: "MICROBIO_QCO2",
  hidrolisefda: "MICROBIO_FDA_HYDROLYSIS",
  fda: "MICROBIO_FDA_HYDROLYSIS",
  desidrogenase: "MICROBIO_DEHYDROGENASE",
  atividadedesidrogenase: "MICROBIO_DEHYDROGENASE",
  fosfataseacida: "MICROBIO_ACID_PHOSPHATASE",
  fosfatasealcalina: "MICROBIO_ALKALINE_PHOSPHATASE",
};

export const DEFAULT_UNITS: Record<string, string> = {
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
  BIOAS_BETA_GLUCOSIDASE: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
  BIOAS_ARYLSULFATASE: "mg p-nitrofenol kg⁻¹ solo h⁻¹",
  BIOAS_IQS_BIO: "índice",
  BIOAS_IQS_QUIM: "índice",
  BIOAS_IQS_FERTBIO: "índice",
  BIOAS_CYCLING_SCORE: "índice",
  BIOAS_STORAGE_SCORE: "índice",
  BIOAS_SUPPLY_SCORE: "índice",
};

const SAMPLE_HEADERS = ["amostra", "codigoamostra", "codamostra", "ponto", "sample", "sampleid", "idamostra", "identificacao"];
const PARAMETER_HEADERS = ["parametro", "elemento", "analito", "nutriente", "parameter"];
const VALUE_HEADERS = ["valor", "resultado", "result", "value"];
const UNIT_HEADERS = ["unidade", "unit", "uom"];
const METHOD_HEADERS = ["metodo", "method", "extrator", "extractor"];
const PROTOCOL_HEADERS = ["protocolo", "protocol", "metodologia", "referenciametodo", "methodprotocol"];
const DEPTH_FROM_HEADERS = ["profundidade_de_cm", "profundidadedecm", "profundidadeinicialcm", "depth_from_cm", "depthfromcm", "depthfrom"];
const DEPTH_TO_HEADERS = ["profundidade_ate_cm", "profundidadeatecm", "profundidadefinalcm", "depth_to_cm", "depthtocm", "depthto"];

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

function looksLikeBiologicalParameter(value: string) {
  const raw = normalizeHeader(value.replace(/\([^)]*\)/g, ""));
  return [
    "azospirillum",
    "bradyrhizobium",
    "rhizobium",
    "micorriz",
    "mycorrh",
    "solubilizador",
    "solubilizadora",
    "biomassamicrobiana",
    "carbonodabiomassamicrobiana",
    "nitrogeniodabiomassamicrobiana",
    "respiracaobasal",
    "respiracaomicrobiana",
    "quocientemetabolico",
    "qco2",
    "hidrolisefda",
    "fda",
    "desidrogenase",
    "fosfatase",
    "colonizacaomicorrizica",
    "esporosmicorrizicos",
    "bacteriasfixadoras",
    "fixadoresdenitrogenio",
    "diazotro",
    "qPCR",
    "metabarcoding",
    "16s",
    "its",
  ].some((token) => raw.includes(token.toLowerCase()));
}

function isGenericBiologicalParameterCode(parameterCode: string) {
  const code = parameterCode.toUpperCase();
  return [
    "AZOSPIRILLUM",
    "BRADYRHIZOBIUM",
    "RHIZOBIUM",
    "MICORRIZ",
    "MYCORRH",
    "SOLUBILIZ",
    "BIOMASSAMICROBIANA",
    "RESPIRACAO",
    "DIAZOTRO",
    "FIXADORESDE",
    "COLONIZACAO",
    "ESPOROS",
    "QPCR",
    "METABARCODING",
    "MICROBIO_",
  ].some((token) => code.includes(token));
}

function extractUnitFromHeader(header: string) {
  const match = header.match(/\(([^)]+)\)/);
  if (!match) return "";
  return match[1].replace(/dm3/gi, "dm³").replace(/cmolc\/?dm3/gi, "cmolc/dm³").trim();
}


function inferMethod(parameterCode: string, fallbackMethod?: string) {
  if (parameterCode === "BIOAS_BETA_GLUCOSIDASE" || parameterCode === "BIOAS_ARYLSULFATASE") {
    return "BioAS Embrapa — atividade enzimática";
  }
  if (parameterCode.startsWith("BIOAS_IQS_") || parameterCode.endsWith("_SCORE")) {
    return "BioAS/MIQS — índice informado no laudo";
  }

  const fallback = fallbackMethod?.trim();
  if (!fallback) return "";
  if (["P", "K"].includes(parameterCode) && ["Mehlich-1", "Resina"].includes(fallback)) return fallback;
  if (isGenericBiologicalParameterCode(parameterCode)) return fallback;
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

function parseOptionalDepth(raw: string) {
  if (!raw.trim()) return null;
  const value = parseNumber(raw.replace(/cm/gi, ""));
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

function readDepthContext(input: {
  sourceRow: string[];
  depthFromIndex: number;
  depthToIndex: number;
  sourceLine: number;
  issues: LabImportIssue[];
}) {
  const fromRaw = input.depthFromIndex >= 0 ? (input.sourceRow[input.depthFromIndex] ?? "").trim() : "";
  const toRaw = input.depthToIndex >= 0 ? (input.sourceRow[input.depthToIndex] ?? "").trim() : "";
  const from = parseOptionalDepth(fromRaw);
  const to = parseOptionalDepth(toRaw);

  if ((fromRaw && !Number.isFinite(from)) || (toRaw && !Number.isFinite(to))) {
    addIssue(input.issues, "WARNING", "DEPTH_INVALID", "Profundidade informada no arquivo não pôde ser validada e não será usada automaticamente.", input.sourceLine);
    return { depthFromCm: null, depthToCm: null };
  }
  if ((from == null) !== (to == null)) {
    addIssue(input.issues, "WARNING", "DEPTH_PARTIAL", "A camada foi informada parcialmente; a RAIZ preserva o valor disponível, mas não assume o limite ausente.", input.sourceLine);
  }
  if (from != null && to != null && from >= to) {
    addIssue(input.issues, "WARNING", "DEPTH_RANGE_INVALID", "A profundidade inicial precisa ser menor que a final; a camada não será usada automaticamente.", input.sourceLine);
    return { depthFromCm: null, depthToCm: null };
  }
  return { depthFromCm: from, depthToCm: to };
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
  const protocolIndex = findHeaderIndex(detectedHeaders, PROTOCOL_HEADERS);
  const depthFromIndex = findHeaderIndex(detectedHeaders, DEPTH_FROM_HEADERS);
  const depthToIndex = findHeaderIndex(detectedHeaders, DEPTH_TO_HEADERS);
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
      // Traduz um método exatamente como um laboratório já confirmado escreve (ex.: "Turbidimetria") para
      // o nome canônico homologado, ANTES de decidir se precisa de fallback/inferência -- ver
      // `ANALYTICAL_METHOD_ALIASES` acima. Sem correspondência conhecida, devolve o texto original.
      const methodRawFromFile = methodIndex >= 0 ? (sourceRow[methodIndex] ?? "").trim() : "";
      const protocol = protocolIndex >= 0 ? (sourceRow[protocolIndex] ?? "").trim() : "";
      const depth = readDepthContext({ sourceRow, depthFromIndex, depthToIndex, sourceLine, issues });
      const protocolMethod = protocolMethodFor(parameterCode, protocol);
      const normalizedExplicitMethod = methodRawFromFile
        ? normalizeAnalyticalMethod(parameterCode, methodRawFromFile, protocol)
        : "";
      const methodDerivedFromProtocol = Boolean(protocolMethod)
        && (!methodRawFromFile || normalizedExplicitMethod === protocolMethod);
      const methodRaw = normalizedExplicitMethod || protocolMethod;
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
        rows.push({
          sampleCode, parameterCode, value, unit, method, protocol, rawMethod: methodRawFromFile,
          sourceLine, source: "MEASURED", unitInferred: inferredUnit, methodInferred: inferredMethod,
          methodDerivedFromProtocol, depthFromCm: depth.depthFromCm, depthToCm: depth.depthToCm,
        });
      }
    });
  } else {
    const parameterColumns = detectedHeaders
      .map((header, index) => ({
        header,
        index,
        parameterCode: normalizeParameter(header),
        unit: extractUnitFromHeader(header),
        biologicalCandidate: looksLikeBiologicalParameter(header),
      }))
      .filter((entry) =>
        entry.index !== sampleIndex
        && (Boolean(DEFAULT_UNITS[entry.parameterCode]) || entry.biologicalCandidate)
      );

    if (!parameterColumns.length) {
      addIssue(issues, "BLOCKER", "PARAMETERS_NOT_RECOGNIZED", "O arquivo não possui colunas laboratoriais reconhecidas. Use nomes químico-físicos, parâmetros BioAS ou parâmetros microbiológicos explícitos (ex.: Azospirillum, Bradyrhizobium, solubilizadores de P/K, micorrizas, biomassa/respiração), preservando unidade e método do laboratório.");
    }

    matrix.slice(1).forEach((sourceRow, rowIndex) => {
      const sourceLine = rowIndex + 2;
      const sampleCode = sampleIndex >= 0 ? (sourceRow[sampleIndex] ?? "").trim() : "";
      const depth = readDepthContext({ sourceRow, depthFromIndex, depthToIndex, sourceLine, issues });
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
        const protocol = protocolIndex >= 0 ? (sourceRow[protocolIndex] ?? "").trim() : "";
        const protocolMethod = protocolMethodFor(column.parameterCode, protocol);
        const fallbackForParameter = inferMethod(column.parameterCode, context.fallbackMethod);
        const method = protocolMethod || fallbackForParameter || "NÃO INFORMADO";
        const inferredUnit = !explicitUnit;
        const inferredMethod = !protocolMethod && Boolean(fallbackForParameter);
        const methodDerivedFromProtocol = Boolean(protocolMethod);

        if (!Number.isFinite(value)) {
          addIssue(issues, "BLOCKER", "INVALID_VALUE", `Valor inválido em ${column.header}: “${raw}”.`, sourceLine);
          return;
        }
        if (unit === "NÃO INFORMADA") addIssue(issues, "BLOCKER", "UNIT_UNKNOWN", `Unidade não reconhecida em ${column.header}.`, sourceLine);
        if (method === "NÃO INFORMADO") addIssue(issues, "BLOCKER", "METHOD_UNKNOWN", `Informe o método principal antes de processar ${column.header}.`, sourceLine);
        if (inferredUnit) addIssue(issues, "WARNING", "UNIT_INFERRED", `Unidade de ${column.parameterCode} foi inferida e precisa de conferência humana.`, sourceLine);
        if (inferredMethod) addIssue(issues, "WARNING", "METHOD_INFERRED", `Método de ${column.parameterCode} foi preenchido pelo método principal selecionado.`, sourceLine);

        rows.push({
          sampleCode, parameterCode: column.parameterCode, value, unit, method, protocol, rawMethod: "",
          sourceLine, source: "MEASURED", unitInferred: inferredUnit, methodInferred: inferredMethod,
          methodDerivedFromProtocol, depthFromCm: depth.depthFromCm, depthToCm: depth.depthToCm,
        });
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
