export type ComparisonDepth = { from: number; to: number };

export type ComparisonMeasurementAggregate = {
  parameterCode: string;
  n: number;
  avg: number;
  units: string[];
  methods: string[];
  sampleTypes: string[];
  depths: ComparisonDepth[];
};

export type NumericDeltaDirection = "INCREASE" | "DECREASE" | "NO_CHANGE" | "NOT_COMPARABLE";

export type ParameterComparisonRow = {
  parameterCode: string;
  unitA: string | null;
  unitB: string | null;
  methodsA: string[];
  methodsB: string[];
  sampleTypesA: string[];
  sampleTypesB: string[];
  depthA: ComparisonDepth | null;
  depthB: ComparisonDepth | null;
  nA: number;
  nB: number;
  avgA: number | null;
  avgB: number | null;
  classificationA: string | null;
  classificationB: string | null;
  comparable: boolean;
  incompatibilityReasons: string[];
  absoluteDifference: number | null;
  direction: NumericDeltaDirection;
  isPercentUnit: boolean;
};

function normalizedDistinct(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort();
}

function normalizedDepths(depths: ComparisonDepth[]): ComparisonDepth[] {
  const unique = new Map<string, ComparisonDepth>();
  for (const depth of depths) {
    if (!Number.isFinite(depth.from) || !Number.isFinite(depth.to)) continue;
    unique.set(`${depth.from}::${depth.to}`, { from: depth.from, to: depth.to });
  }
  return [...unique.values()].sort((a, b) => a.from - b.from || a.to - b.to);
}

function exactSingleContext(
  label: string,
  aValues: string[],
  bValues: string[],
  reasons: string[],
) {
  if (aValues.length === 0 || bValues.length === 0) {
    reasons.push(`${label} não informado em um dos lados.`);
    return;
  }
  if (aValues.length > 1 || bValues.length > 1) {
    reasons.push(`Mais de um ${label.toLowerCase()} registrado em um dos lados; a média agregada não recebe delta direto.`);
    return;
  }
  if (aValues[0] !== bValues[0]) {
    reasons.push(`${label}s diferentes (${aValues[0]} vs. ${bValues[0]}).`);
  }
}

/**
 * Compara dois agregados somente quando a SUBTRAÇÃO B - A representa o mesmo contexto de medição.
 *
 * Não existe semântica de "melhor/pior" aqui. Um delta positivo quer dizer apenas que B é numericamente
 * maior que A. Unidade, método, tipo de amostra e intervalo de profundidade precisam ser únicos em cada
 * lado e equivalentes entre os lados. Se algum contexto estiver ausente/misturado, os valores continuam
 * visíveis individualmente, mas o delta fica fail-closed.
 */
export function buildParameterComparisonRows(
  aggA: Map<string, ComparisonMeasurementAggregate>,
  aggB: Map<string, ComparisonMeasurementAggregate>,
  classA: Map<string, string>,
  classB: Map<string, string>,
): ParameterComparisonRow[] {
  const codes = new Set([...aggA.keys(), ...aggB.keys()]);
  const rows: ParameterComparisonRow[] = [];

  for (const code of codes) {
    const rawA = aggA.get(code) ?? null;
    const rawB = aggB.get(code) ?? null;
    const A = rawA ? {
      ...rawA,
      units: normalizedDistinct(rawA.units),
      methods: normalizedDistinct(rawA.methods),
      sampleTypes: normalizedDistinct(rawA.sampleTypes),
      depths: normalizedDepths(rawA.depths),
    } : null;
    const B = rawB ? {
      ...rawB,
      units: normalizedDistinct(rawB.units),
      methods: normalizedDistinct(rawB.methods),
      sampleTypes: normalizedDistinct(rawB.sampleTypes),
      depths: normalizedDepths(rawB.depths),
    } : null;

    const reasons: string[] = [];
    if (!A) reasons.push("Sem resultado deste parâmetro no lado A.");
    if (!B) reasons.push("Sem resultado deste parâmetro no lado B.");

    if (A && B) {
      if (A.units.length === 0 || B.units.length === 0) {
        reasons.push("Unidade não informada em um dos lados.");
      } else if (A.units.length > 1 || B.units.length > 1) {
        reasons.push("Mais de uma unidade registrada para este parâmetro em um dos lados; a média agregada não recebe delta direto.");
      } else if (A.units[0] !== B.units[0]) {
        reasons.push(`Unidades diferentes (${A.units[0]} vs. ${B.units[0]}).`);
      }

      exactSingleContext("Método analítico", A.methods, B.methods, reasons);
      exactSingleContext("Tipo de amostra", A.sampleTypes, B.sampleTypes, reasons);

      if (A.depths.length === 0 || B.depths.length === 0) {
        reasons.push("Profundidade não registrada em um dos lados.");
      } else if (A.depths.length > 1 || B.depths.length > 1) {
        reasons.push("Mais de um intervalo de profundidade registrado em um dos lados; a média agregada não recebe delta direto.");
      } else {
        const aDepth = A.depths[0];
        const bDepth = B.depths[0];
        if (aDepth.from !== bDepth.from || aDepth.to !== bDepth.to) {
          reasons.push(`Profundidades diferentes (${aDepth.from}–${aDepth.to} cm vs. ${bDepth.from}–${bDepth.to} cm).`);
        }
      }
    }

    const comparable = reasons.length === 0;
    const diff = comparable && A && B ? B.avg - A.avg : null;
    const direction: NumericDeltaDirection = diff == null
      ? "NOT_COMPARABLE"
      : diff > 0
        ? "INCREASE"
        : diff < 0
          ? "DECREASE"
          : "NO_CHANGE";

    rows.push({
      parameterCode: code,
      unitA: A?.units[0] ?? null,
      unitB: B?.units[0] ?? null,
      methodsA: A?.methods ?? [],
      methodsB: B?.methods ?? [],
      sampleTypesA: A?.sampleTypes ?? [],
      sampleTypesB: B?.sampleTypes ?? [],
      depthA: A?.depths.length === 1 ? A.depths[0] : null,
      depthB: B?.depths.length === 1 ? B.depths[0] : null,
      nA: A?.n ?? 0,
      nB: B?.n ?? 0,
      avgA: A?.avg ?? null,
      avgB: B?.avg ?? null,
      classificationA: classA.get(code) ?? null,
      classificationB: classB.get(code) ?? null,
      comparable,
      incompatibilityReasons: reasons,
      absoluteDifference: diff,
      direction,
      isPercentUnit: A?.units[0] === "%" || B?.units[0] === "%",
    });
  }

  return rows.sort((a, b) => a.parameterCode.localeCompare(b.parameterCode));
}
