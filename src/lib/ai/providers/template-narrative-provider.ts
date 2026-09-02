import type { AgronomicExplanationProvider, AgronomicExplanationRequest, AgronomicExplanationResult } from "@/lib/ai/agronomic-explanation-provider";

const PROMPT_VERSION = "template-v1";

/**
 * Provedor padrão, sem custo: um formatador determinístico, não um modelo
 * de linguagem. Existe para que o fluxo completo (evidências -> narrativa
 * -> revisão) funcione de ponta a ponta hoje, sem gastar nada e sem
 * nenhuma chave de API, enquanto nenhum provedor de IA real for
 * autorizado. Ele NUNCA classifica, nunca preenche lacuna, nunca inventa
 * severidade — só reformata em frases o que o motor determinístico e o
 * cadastro já decidiram. Por parâmetro:
 *   - interpretable=true  -> pode nomear a classificação (o motor já
 *     homologou aquele rótulo);
 *   - interpretable=false -> só o valor bruto + o motivo já dado pelo
 *     motor, nunca um adjetivo como "baixo"/"alto".
 */
function buildNarrative(request: AgronomicExplanationRequest) {
  const { evidence } = request;
  const cropLabel = evidence.season.crop ?? "cultura não informada";
  const summary = evidence.classifications.length === 0
    ? `Nenhum parâmetro foi classificado ainda para ${evidence.field.name} (${cropLabel}, ${evidence.season.label}).`
    : `${evidence.field.name} · ${cropLabel} · ${evidence.season.label}: ${evidence.classifications.filter((c) => c.interpretable).length} de ${evidence.classifications.length} parâmetro(s) com classificação homologada.`;

  const observations: string[] = [];
  const missingInformation: string[] = [];
  const attentionPoints: string[] = [];

  for (const item of evidence.classifications) {
    const fact = evidence.results.find((r) => r.sampleCode === item.sampleCode && r.parameterCode === item.parameterCode);
    const valueText = fact ? `${fact.value} ${fact.unit} (método ${fact.method})` : "sem valor persistido";
    if (item.interpretable) {
      const rule = evidence.ruleUsed?.cropProfileCode ? ` conforme o perfil ${evidence.ruleUsed.cropProfileCode} v${evidence.ruleUsed.version}` : "";
      observations.push(`${item.parameterCode} (${item.sampleCode}): ${valueText}, classificado como "${item.classification}"${rule}.`);
      if (item.classification && /muito (baixo|alto)/i.test(item.classification)) attentionPoints.push(`${item.parameterCode} em ${item.sampleCode} está em faixa extrema: ${item.classification}.`);
    } else {
      observations.push(`${item.parameterCode} (${item.sampleCode}): ${valueText}. Interpretação técnica indisponível — aguardando homologação da base agronômica.`);
      missingInformation.push(`${item.parameterCode}: ${item.reason ?? "sem regra homologada compatível."}`);
    }
  }

  const trends: string[] = [];
  const byParameter = new Map<string, typeof evidence.history>();
  for (const entry of evidence.history) {
    const list = byParameter.get(entry.parameterCode) ?? [];
    list.push(entry);
    byParameter.set(entry.parameterCode, list);
  }
  for (const [parameterCode, entries] of byParameter) {
    if (entries.length === 0) continue;
    const latest = entries[0];
    trends.push(`${parameterCode}: última classificação homologada anterior foi "${latest.classification}" em ${latest.seasonLabel} (${latest.analysisCode}).`);
  }

  const technicalReferences = [
    ...evidence.technicalSources.map((source) => `${source.title}${source.institution ? ` — ${source.institution}` : ""}${source.editionYear ? ` (${source.editionYear})` : ""}`),
    ...(evidence.ruleUsed?.cropProfileCode ? [`Perfil de cultura ${evidence.ruleUsed.cropProfileCode} v${evidence.ruleUsed.version}`] : []),
  ];

  return {
    summary,
    observations,
    trends,
    attentionPoints,
    missingInformation,
    technicalReferences,
    requiresProfessionalReview: evidence.reviewStatus !== "APPROVED",
  };
}

export const localTemplateNarrativeProvider: AgronomicExplanationProvider = {
  name: "raiz-template-local",
  model: "template-formatter-v1",
  isRealLanguageModel: false,
  async explain(request: AgronomicExplanationRequest): Promise<AgronomicExplanationResult> {
    return {
      narrative: buildNarrative(request),
      provider: "raiz-template-local",
      model: "template-formatter-v1",
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      isRealLanguageModel: false,
    };
  },
};
