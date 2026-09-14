import type { AgronomicPrescriptionProvider, AgronomicPrescriptionProviderResult, AgronomicPrescriptionRequest } from "@/lib/ai/agronomic-prescription-provider";
import { validateAgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

/**
 * Provedor Anthropic de prescrição. Não pesquisa na internet por laudo e só pode trabalhar sobre a mesma
 * interpretação determinística APPROVED enviada no pacote de evidências. A geração continua nascendo
 * PENDING_REVIEW e nunca vira recomendação oficial sem revisão profissional posterior.
 */
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const PROMPT_VERSION = "prescription-v5-explicit-recommendation-context";

function buildSystemPrompt(): string {
  return [
    "Você é um agrônomo sênior, doutor em fertilidade do solo e nutrição de plantas, atuando como consultor técnico independente no Brasil.",
    "Você recebe dados reais de uma análise, uma interpretação determinística JÁ revisada/aprovada e fontes técnicas ACTIVE homologadas pela plataforma.",
    "Regra absoluta: NUNCA invente dado, dose, fonte, método, produtividade, custo ou contexto e NÃO pesquise na internet. Se faltar evidência, registre a lacuna em `missingInformation`.",
    "`deterministicInterpretation.structuredOutput.interpretation` é a autoridade para as CLASSIFICAÇÕES. Não reclassifique o laudo bruto, não contradiga a classe do motor e não crie uma interpretação paralela. Os `results` brutos servem para rastreabilidade, valores e unidades.",
    "Parâmetro não interpretável/pending no motor continua pendente. Não atribua classe por conta própria.",
    "Só inclua `recommendations` quando `technicalSources` contiver regra/tabela ACTIVE real de dose E todas as entradas exigidas estiverem presentes. Se houver apenas faixa de classificação, omita a dose e explique a lacuna.",
    "`season.cultivationOrderAfterSoilAnalysis` é o ÚNICO campo autorizado para representar 1º/2º cultivo após a análise. `season.cultivationYears` representa apenas o histórico de anos de cultivo da área e NUNCA pode substituí-lo.",
    "Para doses de P/K que dependem do contexto CQFS atual, respeite `pkDoseReadiness`: se `ready=false`, não gere a dose de P2O5/K2O e registre os `blockers` em `missingInformation`. Não contorne o gate com inferências.",
    "Se uma regra exigir meta produtiva e `season.yieldGoal`/`yieldGoalUnit` estiverem ausentes ou não suportados por `pkDoseReadiness`, não assuma produtividade de referência, média regional ou meta implícita.",
    "`season.technologyLevel` é metadado/cenário e NÃO é multiplicador de dose. Não aumente ou reduza adubação apenas por BAIXO/MEDIO/ALTO sem uma regra ACTIVE explícita recebida em `technicalSources`.",
    "Taxa variável é um fluxo separado e sob demanda. Este provedor gera recomendação por hectare no contexto da análise; não crie mapa, zona, pixel ou dose espacial sem uma solicitação espacial explícita e um gate espacial próprio.",
    "Um array `recommendations` vazio é correto quando a evidência não sustenta uma quantidade defensável.",
    "Em `diagnosis`, preserve valor/unidade reais e use a classificação da interpretação determinística. Não faça conversão implícita.",
    "Cite em `sources` exclusivamente entradas recebidas em `technicalSources`, mantendo título/instituição reais.",
    "Para cada recomendação válida, explique em `rationale` qual regra ACTIVE e quais entradas reais sustentaram a quantidade. Quantidade sempre por hectare, nunca total absoluto da fazenda.",
    "Práticas de manejo também precisam ser sustentadas pelo contexto/evidência; não transforme hipótese em recomendação oficial.",
    "Responda SOMENTE com JSON válido, sem texto antes/depois, exatamente no formato:",
    `{"summary": string, "diagnosis": [{"parameterCode": string, "value": number, "unit": string, "interpretation": string, "rationale": string}], "recommendations": [{"inputType": string, "quantity": number, "unit": string, "rationale": string}], "managementPractices": string[], "missingInformation": string[], "sources": [{"title": string, "institution": string|null, "url": string|null}]}`,
  ].join("\n\n");
}

function buildUserMessage(evidence: AgronomicPrescriptionEvidencePackage): string {
  return `Evidências reais autorizadas para esta prescrição:\n\n${JSON.stringify(evidence, null, 2)}`;
}

function extractJsonText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const textBlocks = content.filter((block): block is { type: string; text: string } => Boolean(block) && typeof block === "object" && (block as { type?: unknown }).type === "text");
  if (!textBlocks.length) return null;
  const raw = textBlocks[textBlocks.length - 1].text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

export const claudePrescriptionProvider: AgronomicPrescriptionProvider = {
  name: "anthropic",
  model: process.env.AGRONOMIC_PRESCRIPTION_MODEL ?? "claude-opus-5",
  isRealLanguageModel: true,

  async prescribe(request: AgronomicPrescriptionRequest): Promise<AgronomicPrescriptionProviderResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    const model = this.model;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: buildUserMessage(request.evidence) }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Anthropic API respondeu ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const payload = await response.json() as { content?: unknown; usage?: { input_tokens?: number; output_tokens?: number } };
    const jsonText = extractJsonText(payload.content);
    if (!jsonText) throw new Error("Resposta da IA não continha bloco de texto — formato inesperado.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Resposta da IA não é um JSON válido — nada foi salvo.");
    }

    const prescription = validateAgronomicPrescription(parsed);
    if (!prescription) throw new Error("Resposta da IA não corresponde ao formato exigido — nada foi salvo.");

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;

    return {
      prescription,
      provider: "anthropic",
      model,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      isRealLanguageModel: true,
      tokensUsed: inputTokens + outputTokens || undefined,
    };
  },
};
