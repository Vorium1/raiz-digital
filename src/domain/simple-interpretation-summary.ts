import { computeParameterPredominance } from "./parameter-predominance.ts";

export type SimpleInterpretationItem = {
  sampleCode?: string | null;
  parameterCode?: string | null;
  interpretable?: boolean | null;
  classification?: string | null;
  classificationRole?: "TARGET" | "AUXILIARY" | null;
};

export type SimpleParameterSummary = {
  parameterCode: string;
  totalCount: number;
  classificationCounts: Array<{ classification: string; count: number }>;
  uniformClassification: string | null;
  predominantClassification: string | null;
  predominantCount: number | null;
};

/**
 * Resume classificações já produzidas pelo motor por parâmetro.
 *
 * Não calcula média, não interpola pontos e não infere padrão espacial.
 * "Predominância" reutiliza a mesma regra explícita do cockpit técnico:
 * maioria real + pelo menos 3 pontos concordantes.
 */
export function summarizeSimpleInterpretation(items: SimpleInterpretationItem[]): SimpleParameterSummary[] {
  const eligible = items.filter(
    (item) =>
      item.classificationRole !== "AUXILIARY"
      && item.interpretable === true
      && Boolean(item.parameterCode)
      && Boolean(item.classification),
  );

  const byParameter = new Map<string, string[]>();
  for (const item of eligible) {
    const code = item.parameterCode!;
    const list = byParameter.get(code) ?? [];
    list.push(item.classification!);
    byParameter.set(code, list);
  }

  const predominance = computeParameterPredominance(
    eligible
      .filter((item) => Boolean(item.sampleCode))
      .map((item) => ({
        sampleCode: item.sampleCode!,
        parameterCode: item.parameterCode!,
        interpretable: true,
        classification: item.classification!,
      })),
  );
  const predominantByParameter = new Map(predominance.map((item) => [item.parameterCode, item]));

  return Array.from(byParameter.entries())
    .map(([parameterCode, classifications]) => {
      const counts = new Map<string, number>();
      for (const classification of classifications) {
        counts.set(classification, (counts.get(classification) ?? 0) + 1);
      }
      const classificationCounts = Array.from(counts.entries())
        .map(([classification, count]) => ({ classification, count }))
        .sort((a, b) => b.count - a.count || a.classification.localeCompare(b.classification));
      const uniformClassification = classificationCounts.length === 1 ? classificationCounts[0].classification : null;
      const predominant = predominantByParameter.get(parameterCode) ?? null;

      return {
        parameterCode,
        totalCount: classifications.length,
        classificationCounts,
        uniformClassification,
        predominantClassification: predominant?.classification ?? null,
        predominantCount: predominant?.matchingCount ?? null,
      };
    })
    .sort((a, b) => a.parameterCode.localeCompare(b.parameterCode));
}
