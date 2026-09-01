export type ImportedPoint = {
  code: string;
  latitude: number;
  longitude: number;
  depthFromCm?: number;
  depthToCm?: number;
  subsampleCount?: number;
  sourcePayload?: Record<string, unknown>;
};

export type PointImportIssue = {
  code: "INVALID_FILE" | "INVALID_COORDINATE" | "DUPLICATE_CODE" | "DUPLICATE_COORDINATE" | "MISSING_CODE";
  message: string;
  line?: number;
};

export type PointImportPreview = {
  format: "CSV" | "GEOJSON";
  points: ImportedPoint[];
  issues: PointImportIssue[];
  blockers: number;
};

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const HEADER_ALIASES = {
  code: ["codigo", "code", "ponto", "point", "amostra", "sample", "id"],
  latitude: ["latitude", "lat", "y"],
  longitude: ["longitude", "lon", "lng", "long", "x"],
  depthFrom: ["profundidadede", "depthfrom", "depthfromcm", "inicio", "fromcm"],
  depthTo: ["profundidadeate", "depthto", "depthtocm", "fim", "tocm"],
  subsamples: ["subamostras", "subsamples", "subsamplecount"],
} as const;

function findHeader(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header) as never));
}

function detectDelimiter(header: string) {
  const candidates = [";", "\t", ","] as const;
  return candidates.map((delimiter) => ({ delimiter, count: header.split(delimiter).length - 1 })).sort((a,b)=>b.count-a.count)[0]?.delimiter ?? ";";
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(value.trim()); value = "";
    } else value += char;
  }
  values.push(value.trim());
  return values;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const text = value.trim().replace(/\s/g, "");
  if (!text) return Number.NaN;
  if (text.includes(",") && !text.includes(".")) return Number(text.replace(",", "."));
  if (text.includes(",") && text.includes(".") && text.lastIndexOf(",") > text.lastIndexOf(".")) return Number(text.replace(/\./g, "").replace(",", "."));
  return Number(text.replace(/,/g, ""));
}

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function finalize(format: "CSV" | "GEOJSON", points: ImportedPoint[], issues: PointImportIssue[]): PointImportPreview {
  const codes = new Map<string, number>();
  const coords = new Map<string, number>();
  points.forEach((point, index) => {
    const normalizedCode = point.code.trim().toUpperCase();
    if (!normalizedCode) issues.push({ code: "MISSING_CODE", message: `Ponto ${index + 1} não possui código.` });
    const codeCount = (codes.get(normalizedCode) ?? 0) + 1;
    codes.set(normalizedCode, codeCount);
    if (codeCount > 1) issues.push({ code: "DUPLICATE_CODE", message: `Código de ponto duplicado: ${point.code}.` });
    const coordinateKey = `${point.latitude.toFixed(7)}:${point.longitude.toFixed(7)}`;
    const coordCount = (coords.get(coordinateKey) ?? 0) + 1;
    coords.set(coordinateKey, coordCount);
    if (coordCount > 1) issues.push({ code: "DUPLICATE_COORDINATE", message: `Coordenada repetida em ${point.code}.` });
  });
  return { format, points, issues, blockers: issues.length };
}

export function parsePointCsv(content: string): PointImportPreview {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line)=>line.trim());
  if (lines.length < 2) return { format: "CSV", points: [], issues: [{ code: "INVALID_FILE", message: "CSV sem linhas de pontos." }], blockers: 1 };
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const codeIndex = findHeader(headers, HEADER_ALIASES.code);
  const latIndex = findHeader(headers, HEADER_ALIASES.latitude);
  const lonIndex = findHeader(headers, HEADER_ALIASES.longitude);
  const fromIndex = findHeader(headers, HEADER_ALIASES.depthFrom);
  const toIndex = findHeader(headers, HEADER_ALIASES.depthTo);
  const subsampleIndex = findHeader(headers, HEADER_ALIASES.subsamples);
  if (codeIndex < 0 || latIndex < 0 || lonIndex < 0) {
    return { format: "CSV", points: [], issues: [{ code: "INVALID_FILE", message: "CSV precisa conter código, latitude e longitude." }], blockers: 1 };
  }

  const points: ImportedPoint[] = [];
  const issues: PointImportIssue[] = [];
  lines.slice(1).forEach((line, offset) => {
    const lineNumber = offset + 2;
    const values = parseCsvLine(line, delimiter);
    const code = values[codeIndex]?.trim() ?? "";
    const latitude = toNumber(values[latIndex]);
    const longitude = toNumber(values[lonIndex]);
    if (!validCoordinate(latitude, longitude)) {
      issues.push({ code: "INVALID_COORDINATE", line: lineNumber, message: `Latitude/longitude inválida na linha ${lineNumber}.` });
      return;
    }
    points.push({
      code,
      latitude,
      longitude,
      depthFromCm: fromIndex >= 0 && Number.isFinite(toNumber(values[fromIndex])) ? toNumber(values[fromIndex]) : undefined,
      depthToCm: toIndex >= 0 && Number.isFinite(toNumber(values[toIndex])) ? toNumber(values[toIndex]) : undefined,
      subsampleCount: subsampleIndex >= 0 && Number.isFinite(toNumber(values[subsampleIndex])) ? Math.trunc(toNumber(values[subsampleIndex])) : undefined,
      sourcePayload: Object.fromEntries(headers.map((header, index)=>[header, values[index] ?? ""])),
    });
  });
  return finalize("CSV", points, issues);
}

export function parsePointGeoJson(content: string): PointImportPreview {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch {
    return { format: "GEOJSON", points: [], issues: [{ code: "INVALID_FILE", message: "GeoJSON inválido." }], blockers: 1 };
  }
  if (!parsed || typeof parsed !== "object" || (parsed as { type?: unknown }).type !== "FeatureCollection" || !Array.isArray((parsed as { features?: unknown }).features)) {
    return { format: "GEOJSON", points: [], issues: [{ code: "INVALID_FILE", message: "Use um GeoJSON FeatureCollection de pontos." }], blockers: 1 };
  }
  const points: ImportedPoint[] = [];
  const issues: PointImportIssue[] = [];
  const features = (parsed as { features: Array<Record<string, unknown>> }).features;
  features.forEach((feature, index) => {
    const geometry = feature.geometry as { type?: unknown; coordinates?: unknown } | undefined;
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      issues.push({ code: "INVALID_COORDINATE", message: `Feature ${index + 1} não é um Point GeoJSON válido.` });
      return;
    }
    const longitude = toNumber(geometry.coordinates[0]);
    const latitude = toNumber(geometry.coordinates[1]);
    if (!validCoordinate(latitude, longitude)) {
      issues.push({ code: "INVALID_COORDINATE", message: `Feature ${index + 1} possui coordenadas inválidas.` });
      return;
    }
    const code = String(properties.code ?? properties.codigo ?? properties.ponto ?? properties.amostra ?? feature.id ?? `P${String(index + 1).padStart(3,"0")}`);
    points.push({
      code,
      latitude,
      longitude,
      depthFromCm: Number.isFinite(toNumber(properties.depthFromCm ?? properties.profundidadeDe)) ? toNumber(properties.depthFromCm ?? properties.profundidadeDe) : undefined,
      depthToCm: Number.isFinite(toNumber(properties.depthToCm ?? properties.profundidadeAte)) ? toNumber(properties.depthToCm ?? properties.profundidadeAte) : undefined,
      subsampleCount: Number.isFinite(toNumber(properties.subsampleCount ?? properties.subamostras)) ? Math.trunc(toNumber(properties.subsampleCount ?? properties.subamostras)) : undefined,
      sourcePayload: properties,
    });
  });
  return finalize("GEOJSON", points, issues);
}

export function parsePointFile(content: string, fileName: string): PointImportPreview {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "geojson" || extension === "json") return parsePointGeoJson(content);
  return parsePointCsv(content);
}
