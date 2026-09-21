import type { AgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

const PROMPT_VERSION = "deterministic-limited-v9-spatial-evidence-envelope";

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


  const nitrogen = evidence.deterministicNitrogenEvidence;
  if (nitrogen?.status === "CURRENT") {
    const recommendation = nitrogen.recommendation;
    if (
      nitrogen.executionStatus === "READY_FOR_IMPLEMENTATION"
      && recommendation.dose.kind === "EXACT"
      && recommendation.dose.kgNPerHa > 0
    ) {
      recommendations.push({
        inputType: "N",
        quantity: recommendation.dose.kgNPerHa,
        unit: "kg/ha",
        rationale: `Dose exata do motor determinístico ${recommendation.ruleId}, execução rastreável ${nitrogen.executionId}. A RAIZ apenas transporta o valor calculado; não recalcula N na camada de narrativa.`,
      });
    } else if (recommendation.dose.kind === "RANGE") {
      limitations.push(
        `Nitrogênio: a regra determinística retornou faixa de ${recommendation.dose.minKgNPerHa}–${recommendation.dose.maxKgNPerHa} kg N/ha. A RAIZ preservou a faixa e não escolheu um ponto automaticamente.`,
      );
    } else if (recommendation.dose.kind === "BLOCKED") {
      limitations.push(`Nitrogênio: ${recommendation.dose.reason}`);
    } else if (nitrogen.executionStatus !== "READY_FOR_IMPLEMENTATION") {
      limitations.push("Nitrogênio: a execução determinística corrente exige revisão específica; nenhuma dose foi promovida automaticamente.");
    }

    if (recommendation.qualityObjective?.requested) {
      managementPractices.push(
        `Trigo — objetivo industrial de proteína/glúten vital registrado separadamente da dose-base de produtividade. O foco inclui quantidade de proteína e funcionalidade do glúten (principalmente gliadinas e gluteninas). Nenhum N tardio adicional foi automatizado. ${recommendation.qualityObjective.evidence}`,
      );
    }
  } else if (nitrogen?.status === "STALE") {
    limitations.push("Nitrogênio: existe cálculo histórico, mas ele não representa mais exatamente a safra/regra/matéria orgânica correntes; nenhuma dose antiga foi reutilizada.");
  } else if (nitrogen?.status === "INVALID") {
    limitations.push("Nitrogênio: a execução persistida não passou nas verificações de rastreabilidade e foi isolada sem afetar as demais conclusões.");
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
      if (
        liming.automaticGeneralDoseAllowed
        && liming.operationalGeneralDoseTonHaPrnt100 != null
        && liming.operationalGeneralDoseTonHaPrnt100 > 0
      ) {
        const mode = liming.applicationMode === "SURFACE" ? "aplicação superficial" : "aplicação incorporada";
        const range = liming.doseRangeTonHaPrnt100;
        recommendations.push({
          inputType: "CALCARIO_PRNT100",
          quantity: liming.operationalGeneralDoseTonHaPrnt100,
          unit: "t/ha",
          rationale: `Dose geral operacional do talhão calculada pelo motor como média simples das necessidades dos ${liming.sampleDecisions.length} pontos, equivalentes a PRNT 100%, com ${mode}. ${range ? `Variação observada: ${range.min.toLocaleString("pt-BR")}–${range.max.toLocaleString("pt-BR")} t/ha.` : ""} A média assume representatividade equivalente entre os pontos; quando houver zonas/polígonos com área conhecida, a RAIZ deve preferir ponderação por área.`,
        });
      }
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
        managementPractices.push(`Calagem por ponto: ${bySample.join("; ")}. A recomendação principal do talhão usa a média operacional dos pontos; os valores individuais permanecem visíveis para auditoria e futura taxa variável.${modeText}`);
      }
      if (liming.generalDoseBasis === "EQUAL_WEIGHT_SAMPLE_MEAN") limitations.push("Calagem: a dose geral considera peso igual entre os pontos de amostragem. Se a área representada por cada ponto for diferente, refaça a consolidação com ponderação por zona/área.");
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


  const riceNitrogen = evidence.riceNitrogenEvidence;
  if (evidence.season.cropProfileCode === "ARROZ" && riceNitrogen) {
    const formatDose = (dose: { kind: "EXACT"; kgPerHa: number } | { kind: "UPPER_BOUND"; maxKgPerHa: number }) =>
      dose.kind === "EXACT" ? `${dose.kgPerHa} kg N/ha` : `até ${dose.maxKgPerHa} kg N/ha`;
    const responseLabel = { MEDIA: "Média", ALTA: "Alta", MUITO_ALTA: "Muito alta" } as const;

    if (riceNitrogen.status === "OFFICIAL_ENVELOPE" && riceNitrogen.envelopes.length > 0) {
      const envelope = riceNitrogen.envelopes[0];
      const alternatives = envelope.alternatives
        .map((item) => `${responseLabel[item.responseClass]}: ${formatDose(item.dose)}`)
        .join("; ");
      managementPractices.push(
        `Nitrogênio do arroz — envelope oficial SOSBAI 2025 para a classe de matéria orgânica do talhão: ${alternatives}. A RAIZ preservou as três alternativas oficiais e não escolheu uma expectativa de resposta sem evidência explícita.`,
      );
      limitations.push(
        "Nitrogênio do arroz: a expectativa de resposta à adubação ainda não foi explicitamente resolvida; o envelope oficial foi mantido em vez de fabricar uma dose única.",
      );
    } else if (riceNitrogen.status === "MULTI_BAND_OFFICIAL_ENVELOPE") {
      const byBand = new Map<string, typeof riceNitrogen.envelopes[number]>();
      for (const envelope of riceNitrogen.envelopes) if (!byBand.has(envelope.organicMatterBand)) byBand.set(envelope.organicMatterBand, envelope);
      const bandTexts = [...byBand.values()].map((envelope) => {
        const alternatives = envelope.alternatives
          .map((item) => `${responseLabel[item.responseClass]} ${formatDose(item.dose)}`)
          .join(", ");
        return `${envelope.organicMatterBand}: ${alternatives}`;
      });
      managementPractices.push(
        `Nitrogênio do arroz — os pontos cruzam classes de matéria orgânica da Tabela 4.5 da SOSBAI 2025. Envelopes preservados por classe: ${bandTexts.join(" | ")}.`,
      );
      limitations.push(
        "Nitrogênio do arroz: a variabilidade de matéria orgânica e a expectativa de resposta não sustentam uma dose uniforme automática para todo o talhão.",
      );
    } else if (riceNitrogen.status === "NOT_EVALUATED") {
      limitations.push(
        "Nitrogênio do arroz: a Tabela 4.5 da SOSBAI 2025 só é aplicada quando há matéria orgânica utilizável em porcentagem; essa decisão específica ficou sem dose, sem bloquear o restante do parecer.",
      );
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

    const buyerQuality = evidence.wheatBuyerQualityEvidence;
    if (buyerQuality?.status === "EVALUATED") {
      const complianceLabel = {
        COMPLIANT: "itens obrigatórios verificados como conformes nos dados fornecidos",
        NON_COMPLIANT: "há pelo menos uma divergência nos itens obrigatórios verificados",
        UNVERIFIED: "a conformidade obrigatória ainda não pode ser fechada com as informações disponíveis",
      }[buyerQuality.evaluation.mandatoryCompliance];
      const recommendedLabel = {
        FOLLOWED: "item recomendado de primeira aplicação de N compatível com o documento",
        NOT_FOLLOWED: "item recomendado de primeira aplicação de N não seguido",
        UNVERIFIED: "item recomendado de primeira aplicação de N ainda não verificado",
      }[buyerQuality.evaluation.checks.firstNitrogenApplicationRecommended];

      deterministic.managementPractices.push(
        `Protocolo de comprador selecionado explicitamente: Be8 Agro — Glúten Vital 2026. Checklist do documento fornecido: ${complianceLabel}; ${recommendedLabel}. Esta leitura é separada do motor agronômico de N e não garante prêmio, aceite comercial ou desempenho industrial.`,
      );

      const limitationLabels: Record<string, string> = {
        BE8_SECOND_N_AREA_BASIS_NOT_EXPLICIT_IN_SOURCE: "Be8: a peça fornecida não explicita a base de área dos 150–200 kg de sulfato de amônio.",
        BE8_SECOND_N_AMOUNT_BASIS_NOT_CONFIRMED: "Be8: a base operacional da quantidade informada para a segunda aplicação ainda não foi confirmada; esse item permanece não verificado.",
        BE8_FUNGAL_APPLICATION_PRODUCT_NOT_SPECIFIED_IN_SOURCE: "Be8: o documento fornecido marca aplicação fúngica obrigatória, mas não especifica produto.",
        BE8_FUNGAL_APPLICATION_DOSE_NOT_SPECIFIED_IN_SOURCE: "Be8: o documento fornecido marca aplicação fúngica obrigatória, mas não especifica dose.",
      };
      for (const limitation of buyerQuality.evaluation.limitations) {
        deterministic.limitations.push(limitationLabels[limitation] ?? `Protocolo Be8: ${limitation}`);
      }
      if (buyerQuality.evaluation.mandatoryCompliance === "UNVERIFIED") {
        deterministic.limitations.push(
          "Protocolo Be8: informações não verificadas refinam apenas o checklist do comprador; não bloqueiam a recomendação-base de N nem o parecer do RAIZ.",
        );
      }
    } else if (buyerQuality?.status === "INVALID_OPTIONAL_EVIDENCE") {
      deterministic.limitations.push(
        "Protocolo de comprador do trigo: o contexto opcional armazenado é inválido e foi isolado. O manejo-base e as demais conclusões permanecem válidos.",
      );
    }

    const grainQuality = evidence.wheatGrainQualityEvidence;
    if (grainQuality?.status === "AVAILABLE") {
      const observations = grainQuality.observations.map((row) =>
        `${row.sampleCode} — ${row.label}: ${row.value.toLocaleString("pt-BR")} ${row.unit} (método: ${row.method}${row.protocol ? `; protocolo: ${row.protocol}` : ""})`,
      );
      const cultivarText = grainQuality.targetCultivar
        ? ` Cultivar associada ao contexto da safra: ${grainQuality.targetCultivar}.`
        : "";

      deterministic.managementPractices.push(
        `Qualidade do grão de trigo — medições laboratoriais preservadas: ${observations.join("; ")}.${cultivarText}`,
      );

      if (evidence.season.wheatQualityObjectiveRequested) {
        deterministic.managementPractices.push(
          "Objetivo proteína/Glúten Vital: as medições acima aumentam a resolução do parecer industrial, mas permanecem evidências independentes. Proteína total, glúten úmido/seco, índice de glúten, W, P/L, SDS, gliadina e glutenina não são convertidos uns nos outros e não autorizam N adicional automaticamente.",
        );
        deterministic.limitations.push(
          "Qualidade industrial do trigo: sem especificação oficial/contratual do comprador vinculada à análise, o RAIZ não declara atendimento a padrão, prêmio ou classe comercial específica.",
        );
      } else {
        deterministic.managementPractices.push(
          "As medições de qualidade do grão foram incorporadas ao histórico técnico, sem transformar a análise em um manejo específico para Glúten Vital e sem alterar a recomendação-base de N para produtividade.",
        );
      }
    }

    const irrigation = evidence.irrigationApplicationEvidence;
    if (irrigation?.status === "AVAILABLE") {
      for (const application of irrigation.applications) {
        const details = [
          application.date ? `data local ${application.date}` : "data não informada",
          application.time ? `horário local ${application.time}${application.utcOffset ? ` (UTC${application.utcOffset})` : " (fuso não informado)"}` : null,
          application.depthMm != null ? `lâmina declarada ${application.depthMm} mm` : null,
          application.volumeM3 != null ? `volume declarado ${application.volumeM3} m³` : null,
          application.irrigatedAreaHa != null ? `área irrigada declarada ${application.irrigatedAreaHa} ha` : null,
          application.depthFromVolumeMm != null ? `lâmina equivalente por volume/área ${application.depthFromVolumeMm} mm` : null,
        ].filter(Boolean).join("; ");
        deterministic.managementPractices.push(`Registro de irrigação informado pelo usuário: ${details}.`);
      }
      deterministic.managementPractices.push("As aplicações registradas são evidências operacionais. Não representam balanço hídrico nem autorizam alteração automática das doses de nutrientes.");
    } else if (irrigation?.status === "INVALID_OPTIONAL_EVIDENCE") {
      deterministic.managementPractices.push("O registro complementar de irrigação contém dados inválidos e não foi usado. As conclusões sustentadas pela análise de solo foram preservadas.");
    }

    const water = evidence.irrigationWaterEvidence;
    if (water?.resolution === "CONTEXT_ONLY") {
      if (water.waterRegime === "IRRIGADO") {
        deterministic.managementPractices.push("Condição hídrica: a área foi declarada irrigada. Essa informação enriquece o contexto, mas sozinha não comprova quanto da demanda da cultura foi atendida e não autoriza inferir balanço hídrico ou lâmina recomendada.");
      } else if (water.waterRegime === "SEQUEIRO") {
        deterministic.managementPractices.push("Condição hídrica: a área foi declarada de sequeiro, portanto não há irrigação suplementar declarada. O RAIZ não transforma isso em estimativa de déficit sem demanda da cultura, chuva efetiva e armazenamento do solo alinhados.");
      }
    } else if (water?.resolution === "DEMAND_AVAILABLE" && water.demand) {
      deterministic.managementPractices.push(`Demanda hídrica: ETc de ${water.demand.cropEtMm.toLocaleString("pt-BR")} mm disponível como evidência explícita/derivada a montante. Ainda não há balanço completo suficiente para afirmar reposição, déficit ou recomendar lâmina.`);
    } else if (water?.resolution === "UNALIGNED_EVIDENCE") {
      deterministic.managementPractices.push("Condição hídrica: existem componentes para aprofundar o balanço, mas eles não estão temporal e espacialmente alinhados; o RAIZ preservou os dados sem combiná-los artificialmente.");
    } else if (water?.resolution === "BALANCE_AVAILABLE" && water.balance) {
      const stateLabel = {
        WATER_SUPPLY_ADEQUATE: "suprimento hídrico adequado no balanço avaliado",
        IRRIGATION_THRESHOLD_REACHED: "limiar hídrico de manejo atingido no balanço avaliado",
        WATER_STRESS_ESTIMATED: "estresse hídrico estimado no balanço avaliado",
      }[water.balance.state];
      deterministic.managementPractices.push(
        `Balanço hídrico determinístico: ${stateLabel}; depleção estimada da zona radicular ${water.balance.nextRootZoneDepletionMm.toLocaleString("pt-BR")} mm. O estado não autoriza, por si só, uma lâmina recomendada automática.`,
      );
    } else if (water?.resolution === "INVALID_OPTIONAL_EVIDENCE") {
      deterministic.managementPractices.push("A camada opcional de balanço hídrico contém evidência inválida e foi isolada. O parecer de solo e as demais conclusões sustentadas permanecem válidos.");
    }

    const spatial = evidence.spatialEvidenceEnvelope;
    if (spatial?.requested) {
      const n = spatial.evidence.distinctReliableLabCoordinateCount;
      if (spatial.status === "NO_SPATIAL_EVIDENCE") {
        deterministic.managementPractices.push(
          "Análise espacial/taxa variável foi solicitada, mas o conjunto atual ainda não possui suporte espacial laboratorial confiável suficiente. O RAIZ preserva normalmente o parecer por ponto/talhão e não fabrica uma superfície.",
        );
      } else if (spatial.status === "POINTS_ONLY") {
        deterministic.managementPractices.push(
          `Análise espacial solicitada: ${n} posição(ões) distinta(s), confiável(is) e vinculada(s) ao laudo podem ser mostradas individualmente. A geometria atual não sustenta uma superfície 2-D defensável; os pontos permanecem pontos, sem interpolação automática.`,
        );
      } else if (spatial.status === "EXPLORATORY_ONLY") {
        deterministic.managementPractices.push(
          `Análise espacial solicitada: ${n} posições distintas, confiáveis e vinculadas ao laudo formam suporte 2-D. Pela política conservadora RAIZ, este tamanho de amostragem permite somente exploração visual/zonas auxiliares; não autoriza mapa de prescrição nem taxa variável automática.`,
        );
      } else if (spatial.status === "INTERPOLATION_CANDIDATE") {
        deterministic.managementPractices.push(
          `Análise espacial solicitada: ${n} posições distintas, confiáveis e vinculadas ao laudo possuem suporte 2-D suficiente para avaliar uma técnica de interpolação. O RAIZ não escolheu atributo, IDW/krigagem/Thiessen nem gerou dose espacial automaticamente; a etapa seguinte exige validação por atributo, método, distribuição e revisão profissional, com validação cruzada e métricas preservadas antes de qualquer superfície oficial.`,
        );
      }

      if (spatial.evidence.reliablePointCount < spatial.evidence.totalPointCount) {
        deterministic.limitations.push(
          `Espacial: ${spatial.evidence.totalPointCount - spatial.evidence.reliablePointCount} ponto(s) sem coordenada observada ou fonte GPS auditada ficaram fora do suporte espacial, sem serem descartados do restante do parecer.`,
        );
      }
      if (spatial.evidence.reliableLabLinkedPointCount < spatial.evidence.reliablePointCount) {
        deterministic.limitations.push(
          "Espacial: existem pontos com coordenada confiável ainda sem evidência laboratorial vinculada; eles não foram usados para sustentar uma superfície.",
        );
      }
      if (spatial.evidence.distinctReliableLabCoordinateCount < spatial.evidence.reliableLabLinkedPointCount) {
        deterministic.limitations.push(
          "Espacial: coordenadas duplicadas não foram contadas como suporte espacial independente.",
        );
      }
      if (spatial.evidence.sampleDistribution === "COLLINEAR") {
        deterministic.limitations.push(
          "Espacial: os pontos com evidência formam suporte colinear, insuficiente para uma superfície bidimensional.",
        );
      }

      const methodValidation = evidence.spatialInterpolationValidationEvidence;
      if (methodValidation?.status === "INVALID_CONTEXT") {
        deterministic.limitations.push(
          "Espacial: existe um registro opcional de validação de interpolação inválido. Ele foi isolado; o parecer por ponto/talhão continua válido e nenhuma superfície foi promovida.",
        );
      } else if (methodValidation?.status === "RECORDED") {
        for (const item of methodValidation.entries) {
          const cv = item.validation.crossValidation;
          const cvText = cv
            ? `${cv.strategy}; n=${cv.validationCount}; RMSE ${cv.rmse == null ? "não informado" : cv.rmse.toLocaleString("pt-BR")}; MAE ${cv.mae == null ? "não informado" : cv.mae.toLocaleString("pt-BR")}; erro médio ${cv.meanError == null ? "não informado" : cv.meanError.toLocaleString("pt-BR")}`
            : "validação cruzada não informada";
          const variogramText = item.method === "KRIGING"
            ? item.validation.variogram
              ? `; variograma ${item.validation.variogram.model}, nugget ${item.validation.variogram.nugget ?? "não informado"}, sill ${item.validation.variogram.sill ?? "não informado"}, range ${item.validation.variogram.range ?? "não informado"}`
              : "; variograma não informado"
            : "";

          if (item.current && item.officialSurfaceAllowed) {
            deterministic.managementPractices.push(
              `Espacial ${item.parameterCode}: ${item.method} possui validação técnica corrente sobre ${item.currentSampleCount} ponto(s) comparável(is) (${cvText}${variogramText}). Isso qualifica uma superfície oficial candidata, mas não autoriza dose espacial nem taxa variável automática; a aprovação final continua separada.`,
            );
          } else if (item.limitations.includes("SPATIAL_VALIDATION_SAMPLE_COUNT_STALE")) {
            deterministic.limitations.push(
              `Espacial ${item.parameterCode}: a validação ${item.method} foi calculada com ${item.storedSampleCount} ponto(s), enquanto o suporte comparável atual é ${item.currentSampleCount ?? "indisponível"}. A validação antiga não foi reutilizada.`,
            );
          } else if (item.currentAttributeStatus && item.currentAttributeStatus !== "INTERPOLATION_CANDIDATE") {
            deterministic.limitations.push(
              `Espacial ${item.parameterCode}: existe validação ${item.method} registrada, mas o atributo atualmente está em estado ${item.currentAttributeStatus}; nenhuma superfície oficial foi liberada.`,
            );
          } else if (item.validation.status === "REVIEW_REQUIRED") {
            deterministic.limitations.push(
              `Espacial ${item.parameterCode}: métricas da validação ${item.method} estão registradas (${cvText}${variogramText}), porém a revisão profissional do método ainda não foi aprovada.`,
            );
          } else if (item.validation.status !== "VALIDATED_FOR_OFFICIAL_SURFACE") {
            deterministic.limitations.push(
              `Espacial ${item.parameterCode}: a validação ${item.method} permanece incompleta ou inválida; o RAIZ não promoveu a superfície.`,
            );
          }
        }
      }

      const methodComparisons = evidence.spatialMethodComparisons ?? [];
      for (const comparison of methodComparisons) {
        if (comparison.status === "NOT_COMPARABLE_VALIDATION_DESIGN") {
          deterministic.limitations.push(
            `Espacial ${comparison.parameterCode}: existem métodos tecnicamente validados, mas os desenhos de validação cruzada não são equivalentes. O RAIZ não comparou RMSE/MAE/erro médio entre estratégias ou tamanhos de validação diferentes.`,
          );
          continue;
        }
        if (comparison.status !== "PARETO_COMPARISON_AVAILABLE") continue;

        const nonDominated = comparison.entries.filter((item) => item.paretoStatus === "NON_DOMINATED");
        const dominated = comparison.entries.filter((item) => item.paretoStatus === "DOMINATED");
        const metricText = comparison.entries.map((item) =>
          `${item.method}: RMSE ${item.rmse.toLocaleString("pt-BR")}, MAE ${item.mae.toLocaleString("pt-BR")}, |erro médio| ${item.absoluteMeanError.toLocaleString("pt-BR")}`
        ).join("; ");

        if (nonDominated.length > 1) {
          deterministic.managementPractices.push(
            `Comparação espacial ${comparison.parameterCode}: ${comparison.entries.length} métodos foram avaliados no mesmo desenho (${comparison.comparisonBasis.strategy}, n=${comparison.comparisonBasis.validationCount}). Há trade-off entre os métodos não dominados (${nonDominated.map((item) => item.method).join(", ")}): nenhum é melhor simultaneamente em RMSE, MAE e |erro médio|. Métricas: ${metricText}. A seleção final permanece profissional.`,
          );
        } else if (nonDominated.length === 1 && dominated.length > 0) {
          deterministic.managementPractices.push(
            `Comparação espacial ${comparison.parameterCode}: ${nonDominated[0].method} não foi dominado nas três métricas, enquanto ${dominated.map((item) => `${item.method} (dominado por ${item.dominatedBy.join("/")})`).join(", ")} apresentou desempenho simultaneamente não superior. Métricas: ${metricText}. Dominância de Pareto não autoriza seleção automática; a decisão do método permanece profissional.`,
          );
        }
      }
    }

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
