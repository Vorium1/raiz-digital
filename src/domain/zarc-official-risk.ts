import {
  normalizeMapaZarcRiskRow,
  type ZarcPlantingRiskEvidence,
  type ZarcRiskTableRow,
} from "./official-agroclimate-ingestion.ts";

export const ZARC_CYCLE_CODES = {
  13: "PERENE",
  19: "SEMIPERENE",
  20: "GRUPO_I",
  21: "GRUPO_II",
  22: "GRUPO_III",
  24: "GRUPO_IV",
  25: "GRUPO_V",
  26: "GRUPO_VI",
} as const;

export const ZARC_SOIL_CODES = {
  1: "ARENOSO",
  2: "TEXTURA_MEDIA",
  3: "ARGILOSO",
  11: "AD1",
  12: "AD2",
  13: "AD3",
  14: "AD4",
  15: "AD5",
  16: "AD6",
} as const;

export const ZARC_MANAGEMENT_CODES = {
  1: "SEQUEIRO",
  2: "IRRIGADO",
  3: "IRRIGADO_COM_CONTROLE_DE_GEADA",
} as const;

export const ZARC_CLIMATE_CODES = {
  0: "NAO_SE_APLICA",
  1: "ALTA_DISPONIBILIDADE_DE_FRIO",
  2: "MEDIA_DISPONIBILIDADE_DE_FRIO",
  3: "BAIXA_DISPONIBILIDADE_DE_FRIO",
  4: "SEMIARIDO",
  5: "CLIMA_AMENO",
  6: "CLIMA_QUENTE",
  7: "CLIMA_TROPICAL",
  8: "CLIMA_SUBTROPICAL_AMENO",
  9: "CLIMA_SUBTROPICAL_FRIO",
  11: "CLIMA_SUBTROPICAL",
} as const;

export type ZarcOfficialContext = {
  seasonStartYear: number;
  seasonEndYear: number;
  cropCode: number;
  cycleCode: keyof typeof ZARC_CYCLE_CODES;
  soilCode: keyof typeof ZARC_SOIL_CODES;
  ibgeMunicipalityCode: string;
  stateCode: string;
  managementCode: keyof typeof ZARC_MANAGEMENT_CODES;
  climateCode: keyof typeof ZARC_CLIMATE_CODES;
};

export type ZarcExactSelection =
  | {
      status: "READY";
      row: ZarcPlantingRiskEvidence;
      exactMatchCount: 1;
      warnings: string[];
    }
  | {
      status: "NO_EXACT_MATCH" | "AMBIGUOUS_EXACT_MATCH";
      row: null;
      exactMatchCount: number;
      warnings: string[];
    };

const REQUIRED_HEADERS = [
  "Nome_cultura",
  "SafraIni",
  "SafraFin",
  "Cod_Cultura",
  "Cod_Ciclo",
  "Cod_Solo",
  "geocodigo",
  "UF",
  "municipio",
  "Cod_Outros_Manejos",
  "Nome_Outros_Manejos",
  "Cod_Clima",
  "Nome_Clima",
  "Portaria",
  ...Array.from({ length: 36 }, (_, index) => `dec${index + 1}`),
];

function assertInteger(value: number, label: string) {
  if (!Number.isInteger(value)) throw new Error(`ZARC_${label}_INVALID`);
}

export function validateZarcOfficialContext(input: ZarcOfficialContext) {
  assertInteger(input.seasonStartYear, "SEASON_START_YEAR");
  assertInteger(input.seasonEndYear, "SEASON_END_YEAR");
  if (input.seasonEndYear !== input.seasonStartYear + 1) throw new Error("ZARC_SEASON_INVALID");
  assertInteger(input.cropCode, "CROP_CODE");
  if (input.cropCode <= 0) throw new Error("ZARC_CROP_CODE_INVALID");
  if (!(input.cycleCode in ZARC_CYCLE_CODES)) throw new Error("ZARC_CYCLE_CODE_INVALID");
  if (!(input.soilCode in ZARC_SOIL_CODES)) throw new Error("ZARC_SOIL_CODE_INVALID");
  if (!(input.managementCode in ZARC_MANAGEMENT_CODES)) throw new Error("ZARC_MANAGEMENT_CODE_INVALID");
  if (!(input.climateCode in ZARC_CLIMATE_CODES)) throw new Error("ZARC_CLIMATE_CODE_INVALID");
  if (!/^\d{7}$/.test(input.ibgeMunicipalityCode.trim())) throw new Error("ZARC_IBGE_MUNICIPALITY_CODE_INVALID");
  if (!/^[A-Z]{2}$/.test(input.stateCode.trim().toUpperCase())) throw new Error("ZARC_STATE_CODE_INVALID");
  return {
    ...input,
    ibgeMunicipalityCode: input.ibgeMunicipalityCode.trim(),
    stateCode: input.stateCode.trim().toUpperCase(),
  };
}

function exactContextMatch(row: ZarcPlantingRiskEvidence, context: ZarcOfficialContext) {
  return row.seasonStartYear === context.seasonStartYear
    && row.seasonEndYear === context.seasonEndYear
    && row.cropCode === context.cropCode
    && row.cycleCode === context.cycleCode
    && row.soilCode === context.soilCode
    && row.ibgeMunicipalityCode === context.ibgeMunicipalityCode
    && row.stateCode.toUpperCase() === context.stateCode
    && row.managementCode === context.managementCode
    && row.climateCode === context.climateCode;
}

/**
 * ZARC só é resolvido quando TODOS os códigos oficiais do contexto estão explícitos.
 * Não existe fallback por nome de cultura, cultura "parecida", solo estimado, ciclo
 * presumido ou município vizinho.
 */
export function selectExactZarcRiskRow(
  rows: ZarcPlantingRiskEvidence[],
  rawContext: ZarcOfficialContext,
): ZarcExactSelection {
  const context = validateZarcOfficialContext(rawContext);
  const matches = rows.filter((row) => exactContextMatch(row, context));
  if (matches.length === 1) {
    return {
      status: "READY",
      row: matches[0],
      exactMatchCount: 1,
      warnings: [],
    };
  }
  return {
    status: matches.length ? "AMBIGUOUS_EXACT_MATCH" : "NO_EXACT_MATCH",
    row: null,
    exactMatchCount: matches.length,
    warnings: matches.length
      ? ["ZARC_EXACT_CONTEXT_AMBIGUOUS_NO_ROW_SELECTED"]
      : ["ZARC_EXACT_CONTEXT_NOT_FOUND"],
  };
}

export function zarcDecadeForCivilDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("ZARC_PLANTING_DATE_INVALID");
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("ZARC_PLANTING_DATE_INVALID");
  }
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  const withinMonth = day <= 10 ? 1 : day <= 20 ? 2 : 3;
  return (month - 1) * 3 + withinMonth;
}

export type ZarcPlantingDateAssessment = {
  decade: number;
  status: "INDICATED_AT_RISK_LEVEL" | "NOT_INDICATED_BY_ZARC";
  riskPct: number | null;
  portaria: string;
  warning: "ZARC_RISK_IS_NOT_YIELD_FORECAST";
};

export function assessZarcPlantingDate(
  row: ZarcPlantingRiskEvidence,
  plantingDate: string,
): ZarcPlantingDateAssessment {
  const decade = zarcDecadeForCivilDate(plantingDate);
  const risk = row.decades.find((item) => item.decade === decade)?.riskPct ?? null;
  return {
    decade,
    status: risk == null ? "NOT_INDICATED_BY_ZARC" : "INDICATED_AT_RISK_LEVEL",
    riskPct: risk,
    portaria: row.ordinance,
    warning: "ZARC_RISK_IS_NOT_YIELD_FORECAST",
  };
}


export type ZarcOfficialCoreResolution =
  | {
      status: "READY";
      cropCode: number;
      ibgeMunicipalityCode: string;
      stateCode: string;
      matchedCropName: string;
      matchedMunicipalityName: string;
      warnings: string[];
    }
  | {
      status: "NO_MATCH" | "AMBIGUOUS_OFFICIAL_MAPPING";
      cropCode: null;
      ibgeMunicipalityCode: null;
      stateCode: string;
      matchedCropName: null;
      matchedMunicipalityName: null;
      warnings: string[];
    };

function normalizedOfficialName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/**
 * Resolve cultura e geocódigo usando SOMENTE pares existentes na própria tábua
 * oficial da safra. Não há fuzzy match, alias inventado nem município vizinho.
 *
 * Isso permite que "Soja" / "Passo Fundo" já cadastrados na RAIZ sejam ligados
 * aos códigos oficiais apenas quando o conjunto MAPA contém correspondência
 * textual exata após normalização de caixa/acentos e um único código.
 */
export function resolveZarcOfficialCoreFromRows(input: {
  rows: ZarcPlantingRiskEvidence[];
  seasonStartYear: number;
  seasonEndYear: number;
  cropName: string;
  municipalityName: string;
  stateCode: string;
}): ZarcOfficialCoreResolution {
  if (!Number.isInteger(input.seasonStartYear) || input.seasonEndYear !== input.seasonStartYear + 1) {
    throw new Error("ZARC_SEASON_INVALID");
  }
  const stateCode = input.stateCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateCode)) throw new Error("ZARC_STATE_CODE_INVALID");
  const cropName = normalizedOfficialName(input.cropName);
  const municipalityName = normalizedOfficialName(input.municipalityName);
  if (!cropName) throw new Error("ZARC_CROP_NAME_REQUIRED");
  if (!municipalityName) throw new Error("ZARC_MUNICIPALITY_NAME_REQUIRED");

  const matches = input.rows.filter((row) =>
    row.seasonStartYear === input.seasonStartYear
    && row.seasonEndYear === input.seasonEndYear
    && row.stateCode.toUpperCase() === stateCode
    && normalizedOfficialName(row.cropName) === cropName
    && normalizedOfficialName(row.municipalityName) === municipalityName
  );
  if (!matches.length) {
    return {
      status: "NO_MATCH",
      cropCode: null,
      ibgeMunicipalityCode: null,
      stateCode,
      matchedCropName: null,
      matchedMunicipalityName: null,
      warnings: ["ZARC_OFFICIAL_CROP_MUNICIPALITY_PAIR_NOT_FOUND"],
    };
  }

  const cropCodes = [...new Set(matches.map((row) => row.cropCode))];
  const geocodes = [...new Set(matches.map((row) => row.ibgeMunicipalityCode))];
  const officialCropNames = [...new Set(matches.map((row) => row.cropName))];
  const officialMunicipalityNames = [...new Set(matches.map((row) => row.municipalityName))];
  if (cropCodes.length !== 1 || geocodes.length !== 1) {
    return {
      status: "AMBIGUOUS_OFFICIAL_MAPPING",
      cropCode: null,
      ibgeMunicipalityCode: null,
      stateCode,
      matchedCropName: null,
      matchedMunicipalityName: null,
      warnings: ["ZARC_OFFICIAL_MAPPING_AMBIGUOUS_NO_CODE_SELECTED"],
    };
  }

  return {
    status: "READY",
    cropCode: cropCodes[0],
    ibgeMunicipalityCode: geocodes[0],
    stateCode,
    matchedCropName: officialCropNames[0] ?? input.cropName.trim(),
    matchedMunicipalityName: officialMunicipalityNames[0] ?? input.municipalityName.trim(),
    warnings: [],
  };
}

export type ZarcPartialContext = {
  seasonStartYear: number;
  seasonEndYear: number;
  cropCode: number;
  ibgeMunicipalityCode: string;
  stateCode: string;
  cycleCode?: keyof typeof ZARC_CYCLE_CODES | null;
  soilCode?: keyof typeof ZARC_SOIL_CODES | null;
  managementCode?: keyof typeof ZARC_MANAGEMENT_CODES | null;
  climateCode?: keyof typeof ZARC_CLIMATE_CODES | null;
};

export type ZarcRiskEnvelope = {
  status:
    | "CONSENSUS_RISK"
    | "CONSENSUS_NOT_INDICATED"
    | "VARIABLE_BY_OPTIONAL_CONTEXT"
    | "NO_COMPATIBLE_ROWS";
  decade: number;
  candidateCount: number;
  riskLevelsPct: number[];
  includesNotIndicated: boolean;
  unresolvedDimensions: Array<"CYCLE" | "SOIL" | "MANAGEMENT" | "CLIMATE">;
  sourcePortarias: string[];
  warning: "ZARC_RISK_IS_NOT_YIELD_FORECAST";
};

function validatePartialContext(input: ZarcPartialContext): ZarcPartialContext {
  if (!Number.isInteger(input.seasonStartYear) || !Number.isInteger(input.seasonEndYear)
      || input.seasonEndYear !== input.seasonStartYear + 1) {
    throw new Error("ZARC_SEASON_INVALID");
  }
  if (!Number.isInteger(input.cropCode) || input.cropCode <= 0) throw new Error("ZARC_CROP_CODE_INVALID");
  if (!/^\d{7}$/.test(input.ibgeMunicipalityCode.trim())) throw new Error("ZARC_IBGE_MUNICIPALITY_CODE_INVALID");
  const stateCode = input.stateCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateCode)) throw new Error("ZARC_STATE_CODE_INVALID");
  if (input.cycleCode != null && !(input.cycleCode in ZARC_CYCLE_CODES)) throw new Error("ZARC_CYCLE_CODE_INVALID");
  if (input.soilCode != null && !(input.soilCode in ZARC_SOIL_CODES)) throw new Error("ZARC_SOIL_CODE_INVALID");
  if (input.managementCode != null && !(input.managementCode in ZARC_MANAGEMENT_CODES)) throw new Error("ZARC_MANAGEMENT_CODE_INVALID");
  if (input.climateCode != null && !(input.climateCode in ZARC_CLIMATE_CODES)) throw new Error("ZARC_CLIMATE_CODE_INVALID");
  return {
    ...input,
    stateCode,
    ibgeMunicipalityCode: input.ibgeMunicipalityCode.trim(),
  };
}

/**
 * Leitura progressiva do ZARC.
 *
 * Safra + cultura oficial + município são o núcleo mínimo. As dimensões
 * ciclo/solo/manejo/clima podem permanecer abertas. Nesse caso a RAIZ não
 * escolhe uma linha: calcula o conjunto de riscos oficiais compatíveis para o
 * decêndio e só devolve consenso quando TODAS as linhas concordam.
 */
export function assessZarcRiskEnvelope(
  rows: ZarcPlantingRiskEvidence[],
  rawContext: ZarcPartialContext,
  plantingDate: string,
): ZarcRiskEnvelope {
  const context = validatePartialContext(rawContext);
  const decade = zarcDecadeForCivilDate(plantingDate);
  const unresolvedDimensions: ZarcRiskEnvelope["unresolvedDimensions"] = [
    ...(context.cycleCode == null ? ["CYCLE" as const] : []),
    ...(context.soilCode == null ? ["SOIL" as const] : []),
    ...(context.managementCode == null ? ["MANAGEMENT" as const] : []),
    ...(context.climateCode == null ? ["CLIMATE" as const] : []),
  ];

  const candidates = rows.filter((row) =>
    row.seasonStartYear === context.seasonStartYear
    && row.seasonEndYear === context.seasonEndYear
    && row.cropCode === context.cropCode
    && row.ibgeMunicipalityCode === context.ibgeMunicipalityCode
    && row.stateCode.toUpperCase() === context.stateCode
    && (context.cycleCode == null || row.cycleCode === context.cycleCode)
    && (context.soilCode == null || row.soilCode === context.soilCode)
    && (context.managementCode == null || row.managementCode === context.managementCode)
    && (context.climateCode == null || row.climateCode === context.climateCode)
  );

  const risks = candidates.map((row) =>
    row.decades.find((item) => item.decade === decade)?.riskPct ?? null
  );
  const riskLevelsPct = [...new Set(risks.filter((risk): risk is number => risk != null))].sort((a, b) => a - b);
  const includesNotIndicated = risks.some((risk) => risk == null);
  const sourcePortarias = [...new Set(candidates.map((row) => row.ordinance).filter(Boolean))].sort();

  let status: ZarcRiskEnvelope["status"];
  if (!candidates.length) status = "NO_COMPATIBLE_ROWS";
  else if (riskLevelsPct.length === 0 && includesNotIndicated) status = "CONSENSUS_NOT_INDICATED";
  else if (riskLevelsPct.length === 1 && !includesNotIndicated) status = "CONSENSUS_RISK";
  else status = "VARIABLE_BY_OPTIONAL_CONTEXT";

  return {
    status,
    decade,
    candidateCount: candidates.length,
    riskLevelsPct,
    includesNotIndicated,
    unresolvedDimensions,
    sourcePortarias,
    warning: "ZARC_RISK_IS_NOT_YIELD_FORECAST",
  };
}

function detectDelimiter(headerLine: string) {
  const candidates = [";", ",", "\t"] as const;
  const score = (delimiter: string) => {
    let quoted = false;
    let count = 0;
    for (let i = 0; i < headerLine.length; i += 1) {
      if (headerLine[i] === '"') {
        if (quoted && headerLine[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (!quoted && headerLine[i] === delimiter) count += 1;
    }
    return count;
  };
  return candidates
    .map((delimiter) => ({ delimiter, score: score(delimiter) }))
    .sort((a, b) => b.score - a.score)[0]?.delimiter ?? ";";
}

function parseDelimited(content: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = content.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("ZARC_CSV_UNCLOSED_QUOTE");
  return rows;
}

/**
 * Parser estrito do CSV oficial. Cabeçalhos críticos faltantes falham fechado.
 * A função pode filtrar pelo contexto oficial durante a conversão para evitar
 * propagar linhas irrelevantes para o restante do motor.
 */
export function parseMapaZarcCsv(
  content: string,
  context?: ZarcOfficialContext,
): ZarcPlantingRiskEvidence[] {
  if (!content.trim()) throw new Error("ZARC_CSV_EMPTY");
  const firstLine = content.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const matrix = parseDelimited(content, delimiter);
  if (matrix.length < 2) throw new Error("ZARC_CSV_NO_DATA_ROWS");
  const headers = matrix[0].map((value) => value.trim());
  const index = new Map(headers.map((value, position) => [value, position]));
  const missing = REQUIRED_HEADERS.filter((header) => !index.has(header));
  if (missing.length) throw new Error(`ZARC_CSV_REQUIRED_HEADERS_MISSING:${missing.join(",")}`);

  const validatedContext = context ? validateZarcOfficialContext(context) : null;
  const output: ZarcPlantingRiskEvidence[] = [];
  for (const source of matrix.slice(1)) {
    const raw: ZarcRiskTableRow = {};
    for (const header of headers) {
      raw[header] = source[index.get(header)!] ?? "";
    }
    const row = normalizeMapaZarcRiskRow(raw);
    if (!validatedContext || exactContextMatch(row, validatedContext)) output.push(row);
  }
  return output;
}
