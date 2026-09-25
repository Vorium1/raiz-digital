export type PublishedResultFact = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method?: string | null;
  source?: string | null;
};

export type PublishedResultInterpretation = {
  sampleCode?: string | null;
  parameterCode?: string | null;
  interpretable?: boolean | null;
  classification?: string | null;
  reason?: string | null;
  classificationRole?: "TARGET" | "AUXILIARY" | null;
};

export type PublishedParameterDashboardRow = {
  parameterCode: string;
  sampleCount: number;
  valueCount: number;
  unit: string | null;
  mixedUnits: boolean;
  mean: number | null;
  min: number | null;
  max: number | null;
  classificationCounts: Array<{ classification: string; count: number }>;
  classifiedCount: number;
  unclassifiedCount: number;
  methods: string[];
  reasons: string[];
};

const PARAMETER_PRIORITY = [
  "PH", "MO", "CTC", "CTC_PH7", "V", "CA", "MG", "AL", "H_AL",
  "P", "K", "S", "B", "ZN", "CU", "MN", "FE", "MOLIBDENIO", "MO_ELEMENT",
];

function normalizedCode(value: string) {
  return value.trim().toUpperCase();
}

function finiteValues(facts: PublishedResultFact[]) {
  return facts.map((fact) => Number(fact.value)).filter(Number.isFinite);
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function priority(code: string) {
  const index = PARAMETER_PRIORITY.indexOf(code);
  return index === -1 ? PARAMETER_PRIORITY.length : index;
}

/**
 * Monta a camada visual do laudo publicado a partir SOMENTE de fatos e interpretações congelados.
 *
 * Regras de segurança:
 * - nenhum parâmetro presente nos fatos é descartado por falta de classificação;
 * - nenhuma unidade é convertida;
 * - média/min/max só aparecem quando todos os fatos daquele parâmetro usam a mesma unidade textual;
 * - classificações AUXILIARY não viram conclusão principal;
 * - ausência de faixa homologada permanece explícita como "não classificado".
 */
export function buildPublishedParameterDashboard(input: {
  facts: PublishedResultFact[];
  interpretation: PublishedResultInterpretation[];
}): PublishedParameterDashboardRow[] {
  const factByCode = new Map<string, PublishedResultFact[]>();
  for (const fact of input.facts) {
    if (!fact?.parameterCode?.trim()) continue;
    const code = normalizedCode(fact.parameterCode);
    const rows = factByCode.get(code) ?? [];
    rows.push({ ...fact, parameterCode: code });
    factByCode.set(code, rows);
  }

  const interpretationByCode = new Map<string, PublishedResultInterpretation[]>();
  for (const row of input.interpretation) {
    if (!row?.parameterCode?.trim()) continue;
    const code = normalizedCode(row.parameterCode);
    const rows = interpretationByCode.get(code) ?? [];
    rows.push({ ...row, parameterCode: code });
    interpretationByCode.set(code, rows);
  }

  const codes = new Set([...factByCode.keys(), ...interpretationByCode.keys()]);
  return [...codes]
    .map((parameterCode) => {
      const facts = factByCode.get(parameterCode) ?? [];
      const interpretations = interpretationByCode.get(parameterCode) ?? [];
      const units = uniqueNonEmpty(facts.map((fact) => fact.unit));
      const mixedUnits = units.length > 1;
      const values = finiteValues(facts);

      const mainInterpretations = interpretations.filter((row) => row.classificationRole !== "AUXILIARY");
      const counts = new Map<string, number>();
      for (const row of mainInterpretations) {
        if (row.interpretable !== true || !row.classification?.trim()) continue;
        const classification = row.classification.trim();
        counts.set(classification, (counts.get(classification) ?? 0) + 1);
      }
      const classificationCounts = [...counts.entries()]
        .map(([classification, count]) => ({ classification, count }))
        .sort((a, b) => b.count - a.count || a.classification.localeCompare(b.classification));

      const sampleCodes = uniqueNonEmpty(facts.map((fact) => fact.sampleCode));
      const classifiedCount = classificationCounts.reduce((sum, item) => sum + item.count, 0);
      const mainEvidenceCount = mainInterpretations.length > 0
        ? new Set(mainInterpretations.map((row) => row.sampleCode).filter(Boolean)).size
        : sampleCodes.length;

      return {
        parameterCode,
        sampleCount: Math.max(sampleCodes.length, mainEvidenceCount),
        valueCount: values.length,
        unit: mixedUnits ? null : (units[0] ?? null),
        mixedUnits,
        mean: !mixedUnits && values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
        min: !mixedUnits && values.length ? Math.min(...values) : null,
        max: !mixedUnits && values.length ? Math.max(...values) : null,
        classificationCounts,
        classifiedCount,
        unclassifiedCount: Math.max(0, mainEvidenceCount - classifiedCount),
        methods: uniqueNonEmpty(facts.map((fact) => fact.method)),
        reasons: uniqueNonEmpty(
          mainInterpretations
            .filter((row) => row.interpretable !== true)
            .map((row) => row.reason),
        ),
      } satisfies PublishedParameterDashboardRow;
    })
    .sort((a, b) => priority(a.parameterCode) - priority(b.parameterCode) || a.parameterCode.localeCompare(b.parameterCode));
}
