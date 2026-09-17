import type { AgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

const PROMPT_VERSION = "deterministic-limited-v1";

type InterpretationItem = {
  sampleCode?: string;
  parameterCode?: string;
  classificationRole?: "TARGET" | "AUXILIARY";
  interpretable?: boolean;
  classification?: string;
  reason?: string;
  derivation?: { value?: number };
};

function interpretationItems(evidence: AgronomicPrescriptionEvidencePackage): InterpretationItem[] {
  const structured = evidence.deterministicInterpretation?.structuredOutput;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) return [];
  const items = (structured as { interpretation?: unknown }).interpretation;
  return Array.isArray(items) ? items as InterpretationItem[] : [];
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function doseLimitation(evidence: AgronomicPrescriptionEvidencePackage) {
  if (evidence.pkDoseReadiness.ready && evidence.uniformPkReadiness.ready) return null;
  if (!evidence.pkDoseReadiness.ready) {
    return "Dose de fósforo e potássio não incluída: falta contexto necessário para o cálculo seguro da dose. O relatório segue sem estimar esse valor.";
  }
  return "Dose uniforme de fósforo e/ou potássio não incluída: os resultados disponíveis não sustentam uma dose uniforme segura para esta área.";
}

/**
 * Fechamento local e deliberadamente limitado para quando nenhum LLM estiver configurado.
 *
 * Não prescreve dose, produto ou prática de manejo. Apenas transporta para um rascunho revisável
 * aquilo que o motor determinístico já classificou e registra as limitações reais. Isso permite
 * concluir um relatório técnico com as evidências disponíveis sem transformar indisponibilidade de
 * provedor externo em uma falsa "falta de dados" do usuário.
 */
export const deterministicLimitedPrescriptionProvider: AgronomicPrescriptionProvider = {
  name: "raiz-deterministic-limited",
  model: "agronomic-engine",
  isRealLanguageModel: false,

  async prescribe({ evidence }) {
    const interpreted = interpretationItems(evidence);
    const resultByKey = new Map(
      evidence.results.map((result) => [`${result.sampleCode}::${result.parameterCode}`, result] as const),
    );

    const diagnosis = interpreted
      .filter((item) => item.classificationRole !== "AUXILIARY" && item.interpretable === true && item.parameterCode && item.classification)
      .flatMap((item) => {
        const result = resultByKey.get(`${item.sampleCode ?? ""}::${item.parameterCode}`);
        const derivedValue = item.derivation?.value;
        const value = result?.value ?? derivedValue;
        if (typeof value !== "number" || !Number.isFinite(value)) return [];
        return [{
          parameterCode: item.parameterCode!,
          value,
          unit: result?.unit || "calculado",
          interpretation: item.classification!,
          rationale: "Classificação produzida pelo motor determinístico da RAIZ a partir das evidências disponíveis.",
        }];
      });

    const deterministicLimitations = unique(
      interpreted
        .filter((item) => item.classificationRole !== "AUXILIARY" && item.interpretable === false)
        .map((item) => item.reason),
    );
    const pkLimitation = doseLimitation(evidence);
    const missingInformation = unique([...deterministicLimitations, pkLimitation]);

    const sources = Array.from(
      new Map(
        evidence.technicalSources
          .filter((source) => source.title?.trim())
          .map((source) => [
            `${source.title}::${source.institution ?? ""}`,
            { title: source.title, institution: source.institution ?? null, url: null },
          ]),
      ).values(),
    );

    return {
      prescription: {
        summary: "Análise técnica preparada com os dados disponíveis. A RAIZ manteve apenas classificações produzidas pelo motor validado e não criou doses ou práticas de manejo sem evidência suficiente.",
        diagnosis,
        recommendations: [],
        managementPractices: [],
        missingInformation,
        sources,
      },
      provider: "raiz-deterministic-limited",
      model: "agronomic-engine",
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      isRealLanguageModel: false,
      tokensUsed: 0,
      costUsd: 0,
    };
  },
};
