import type { AgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

const PROMPT_VERSION = "deterministic-limited-v2-liming";

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

function deterministicRecommendations(evidence: AgronomicPrescriptionEvidencePackage) {
  const recommendations: Array<{ inputType: string; quantity: number; unit: string; rationale: string }> = [];
  const managementPractices: string[] = [];
  const limitations: string[] = [];

  for (const nutrient of ["P2O5", "K2O"] as const) {
    const dose = evidence.deterministicPkDoses[nutrient];
    if (!dose.ready || !dose.expected) {
      limitations.push(`Dose de ${nutrient} não incluída: ${dose.blockers.join(", ") || "evidência insuficiente para uma dose uniforme segura"}.`);
      continue;
    }
    if (dose.expected.isDiscretionaryRange) {
      limitations.push(`Dose de ${nutrient} não automatizada: a fonte permite faixa discricionária de ${dose.expected.minimumKgPerHa} a ${dose.expected.maximumKgPerHa} kg/ha.`);
      continue;
    }
    recommendations.push({
      inputType: nutrient,
      quantity: dose.expected.doseKgPerHa,
      unit: "kg/ha",
      rationale: `Dose exata do motor determinístico ${dose.expected.ruleId}, classe ${dose.expected.soilLevel}. ${dose.expected.assumptions.length ? `Premissas automáticas rastreadas: ${dose.expected.assumptions.join(", ")}.` : "Contexto informado na safra."}`,
    });
  }


  const sulfur = evidence.deterministicSulfurDose;
  if (evidence.season.cropProfileCode === "SOJA" && sulfur) {
    if (sulfur.dose.kind === "EXACT") {
      recommendations.push({
        inputType: "S",
        quantity: sulfur.dose.kgSPerHa,
        unit: "kg/ha",
        rationale: `Dose exata do motor determinístico ${sulfur.ruleId}. Base: teor crítico de S da soja + ${sulfur.basis === "STRICT_PREDOMINANCE" ? "predominância estrita entre os pontos" : "amostra única"}.`,
      });
    } else if (sulfur.blockers.includes("S_NO_STRICT_PREDOMINANCE")) {
      limitations.push("Enxofre: os pontos não sustentam uma dose única para toda a área; o RAIZ preservou a variação em vez de forçar uma recomendação uniforme.");
    } else if (sulfur.dose.kind === "BLOCKED") {
      limitations.push(`Enxofre: ${sulfur.dose.reason}`);
    } else {
      limitations.push(`Enxofre: a regra determinística retornou uma faixa de ${sulfur.dose.minKgSPerHa}–${sulfur.dose.maxKgSPerHa} kg S/ha; o RAIZ não escolheu um ponto dentro da faixa por conta própria.`);
    }
  }

  const liming = evidence.deterministicLimingDecision;
  if (evidence.season.cropProfileCode === "SOJA" && liming) {
    if (liming.status === "UNIFORM_APPLY" && liming.automaticUniformDoseAllowed && liming.uniformDoseTonHaPrnt100 != null) {
      const mode = liming.applicationMode === "SURFACE" ? "aplicação superficial" : "aplicação incorporada";
      recommendations.push({
        inputType: "CALCARIO_PRNT100",
        quantity: liming.uniformDoseTonHaPrnt100,
        unit: "t/ha",
        rationale: `Necessidade uniforme calculada pelo motor determinístico de calagem da soja RS/SC 2025, equivalente a PRNT 100%, com ${mode}. A RAIZ não escolhe produto comercial nem converte PRNT sem o valor declarado do corretivo.`,
      });
    } else if (liming.status === "UNIFORM_NO_APPLY") {
      managementPractices.push("Calagem: não indicada pelo critério determinístico atual para os pontos avaliados.");
    } else if (liming.status === "SPATIAL") {
      const bySample = liming.sampleDecisions
        .map((item) => {
          if (item.decision === "DO_NOT_APPLY") return `${item.sampleCode}: não aplicar`;
          if (item.decision === "APPLY" && item.recommendedDoseTonHaPrnt100 != null) {
            return `${item.sampleCode}: ${item.recommendedDoseTonHaPrnt100.toLocaleString("pt-BR")} t/ha PRNT 100%`;
          }
          return null;
        })
        .filter((item): item is string => Boolean(item));
      if (bySample.length) {
        const spatialModes = [...new Set(
          liming.sampleDecisions
            .map((item) => item.applicationMode)
            .filter((mode): mode is "INCORPORATED" | "SURFACE" => mode === "INCORPORATED" || mode === "SURFACE"),
        )];
        const modeText = spatialModes.length === 1
          ? spatialModes[0] === "SURFACE"
            ? " Modo de aplicação: superficial."
            : " Modo de aplicação: incorporada."
          : "";
        managementPractices.push(`Calagem por amostra: ${bySample.join("; ")}. Dose uniforme não indicada para toda a área.${modeText}`);
      }
      limitations.push("Calagem: os pontos não sustentam uma dose única para todo o talhão; a RAIZ preservou a variação em vez de calcular média simples.");
    } else if (liming.status === "BLOCKED") {
      if (liming.blockers.includes("MANAGEMENT_SYSTEM_REQUIRED_FOR_LIMING")) {
        limitations.push("Calagem: informe o sistema de manejo do solo para escolher a regra correta sem assumir preparo convencional ou estágio do plantio direto.");
      } else if (liming.managementSystem === "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS") {
        limitations.push("Calagem em plantio direto consolidado: a regra oficial usa a camada 0–10 cm. O laudo atual não possui essa camada separada; uma amostra composta de 0–20 cm não é dividida artificialmente pela RAIZ.");
      } else if (liming.managementSystem === "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS") {
        limitations.push("Calagem em plantio direto consolidado com restrições: a decisão exige evidências separadas de 0–10 e 10–20 cm. O laudo atual não contém essas duas camadas; a RAIZ preserva a amostragem real em vez de fabricar valores por profundidade.");
      } else {
        limitations.push("Calagem: a evidência atual não sustenta uma dose oficial uniforme para este sistema de manejo. A RAIZ manteve a decisão sem dose em vez de estimar um valor sem base técnica.");
      }
    }
  }

  return { recommendations, managementPractices, limitations };
}

/**
 * Fechamento local e deliberadamente limitado para quando nenhum LLM estiver configurado.
 *
 * Não inventa dose, produto ou prática de manejo. Apenas transporta para um rascunho revisável
 * aquilo que os motores determinísticos já calcularam/classificaram e registra as limitações reais. Isso permite
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
    const deterministic = deterministicRecommendations(evidence);
    const missingInformation = unique([...deterministicLimitations, ...deterministic.limitations]);

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
        summary: "Análise técnica preparada pelo motor RAIZ a partir das medições, métodos laboratoriais e regras agronômicas versionadas. Doses uniformes só entram quando a evidência do próprio talhão sustenta essa decisão.",
        diagnosis,
        recommendations: deterministic.recommendations,
        managementPractices: deterministic.managementPractices,
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
